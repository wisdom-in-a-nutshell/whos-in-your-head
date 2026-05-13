import { NextResponse } from "next/server";
import {
  applyAiMove,
  attachModelResponseId,
  createInitialGameState,
  finalizeGuess,
  GameRuleError,
  gameTurnRequestSchema,
  recordPlayerAnswer,
  type GameState
} from "@/lib/game/state";
import { isFirstOpeningAnswer, OPENING_MOVE } from "@/lib/game/opening";
import { getOpenAIModelFallbacks, getOpenAIRuntimeStatus } from "@/lib/server/openai";
import {
  generateAiMove,
  isContentFilterIncompleteResponseError,
  readWarmedOpeningMove,
  warmOpeningMoveResponses,
  type GeneratedAiMove
} from "@/lib/server/game-master";
import { describeError, logError, logInfo, logWarn } from "@/lib/server/logging";

export const runtime = "nodejs";
const MODEL_MOVE_ATTEMPTS = 2;

export function GET() {
  return NextResponse.json({
    ok: true,
    status: "ready",
    message: "POST start, answer, or judge_guess actions to drive a game turn."
  });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const body = await request.json().catch(() => null);
  const parsed = gameTurnRequestSchema.safeParse(body);

  if (!parsed.success) {
    logWarn("game_turn_invalid_request", {
      requestId,
      issues: parsed.error.flatten()
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Invalid game turn request.",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.action === "judge_guess") {
      logInfo("game_turn_judge_guess", {
        requestId,
        gameId: parsed.data.state.gameId,
        correct: parsed.data.correct,
        questionCount: parsed.data.state.questionCount
      });

      return NextResponse.json({
        ok: true,
        game: finalizeGuess(parsed.data.state, parsed.data.correct)
      });
    }

    if (parsed.data.action === "start") {
      const nextGame = applyAiMove(createInitialGameState(), OPENING_MOVE);
      warmOpeningMoveResponses();
      logInfo("game_turn_started", {
        requestId,
        gameId: nextGame.gameId,
        question: nextGame.latestQuestion
      });

      return NextResponse.json({
        ok: true,
        game: nextGame,
        move: OPENING_MOVE,
        runtime: {
          source: "local_opening_question"
        }
      });
    }

    const status = getOpenAIRuntimeStatus();

    if (status.configurationError) {
      logError("game_turn_openai_configuration_error", {
        requestId,
        error: status.configurationError
      });

      return NextResponse.json(
        {
          ok: false,
          code: "openai_configuration_error",
          error: status.configurationError,
          openai: status
        },
        { status: 503 }
      );
    }

    if (!status.configured) {
      logError("game_turn_openai_not_configured", {
        requestId
      });

      return NextResponse.json(
        {
          ok: false,
          code: "openai_not_configured",
          error: "OPENAI_API_KEY is not configured.",
          openai: status
        },
        { status: 503 }
      );
    }

    const game = recordPlayerAnswer(parsed.data.state, parsed.data.answer);
    const { generated, nextGame, source } = await generateNextGameState(game, requestId);
    const move = generated.move;
    logAnsweredTurn({
      requestId,
      game,
      answer: parsed.data.answer,
      generated,
      nextGame,
      source
    });

    return NextResponse.json({
      ok: true,
      game: nextGame,
      move,
      runtime: {
        source,
        requestedModel: generated.requestedModel,
        actualModel: generated.actualModel,
        requestedServiceTier: generated.requestedServiceTier,
        actualServiceTier: generated.actualServiceTier,
        promptCacheKey: generated.promptCacheKey,
        usage: summarizeUsage(generated.usage)
      }
    });
  } catch (error) {
    const isRuleError = error instanceof GameRuleError;
    logError("game_turn_failed", {
      requestId,
      code: isRuleError ? "game_rule_error" : "game_master_error",
      error: describeError(error)
    });

    return NextResponse.json(
      {
        ok: false,
        code: isRuleError ? "game_rule_error" : "game_master_error",
        error:
          error instanceof Error
            ? error.message
            : "The game master could not produce a valid move."
      },
      { status: isRuleError ? 409 : 502 }
    );
  }
}

async function generateNextGameState(
  game: GameState,
  requestId: string
): Promise<{ generated: GeneratedAiMove; nextGame: GameState; source: string }> {
  const warmedOpening = readWarmedOpeningGameState(game);

  if (warmedOpening) {
    return warmedOpening;
  }

  for (let attempt = 1; attempt <= MODEL_MOVE_ATTEMPTS; attempt += 1) {
    try {
      const generated = await generateAiMove(game, requestId, attempt);
      const nextGame = attachModelResponseId(
        applyAiMove(game, generated.move),
        generated.responseId
      );

      return {
        generated,
        nextGame,
        source: "model_move"
      };
    } catch (error) {
      logWarn("game_turn_model_move_attempt_failed", {
        requestId,
        attempt,
        maxAttempts: MODEL_MOVE_ATTEMPTS,
        gameId: game.gameId,
        questionCount: game.questionCount,
        transcriptLength: game.transcript.length,
        error: describeError(error)
      });

      if (isContentFilterIncompleteResponseError(error)) {
        const fallback = await tryContentFilterFallbacks(game, requestId, attempt + 1);

        if (fallback) {
          return fallback;
        }

        break;
      }
    }
  }

  throw new Error("The game master failed to produce a valid move after retries.");
}

async function tryContentFilterFallbacks(
  game: GameState,
  requestId: string,
  retryAttempt: number
): Promise<{ generated: GeneratedAiMove; nextGame: GameState; source: string } | null> {
  const fallbackModels = getOpenAIModelFallbacks();

  if (fallbackModels.length === 0) {
    logWarn("game_turn_content_filter_no_fallback_configured", {
      requestId,
      gameId: game.gameId,
      questionCount: game.questionCount,
      transcriptLength: game.transcript.length
    });
    return null;
  }

  for (const fallbackModel of fallbackModels) {
    try {
      logInfo("game_turn_content_filter_fallback_started", {
        requestId,
        gameId: game.gameId,
        questionCount: game.questionCount,
        transcriptLength: game.transcript.length,
        fallbackModel,
        retryAttempt
      });

      const generated = await generateAiMove(game, requestId, retryAttempt, fallbackModel);
      const nextGame = attachModelResponseId(
        applyAiMove(game, generated.move),
        null
      );

      logInfo("game_turn_content_filter_fallback_succeeded", {
        requestId,
        gameId: game.gameId,
        questionCount: game.questionCount,
        fallbackModel,
        responseId: generated.responseId,
        preservedResponseId: false
      });

      return {
        generated,
        nextGame,
        source: "model_move_content_filter_fallback"
      };
    } catch (fallbackError) {
      logWarn("game_turn_content_filter_fallback_failed", {
        requestId,
        gameId: game.gameId,
        questionCount: game.questionCount,
        transcriptLength: game.transcript.length,
        fallbackModel,
        retryAttempt,
        error: describeError(fallbackError)
      });
    }
  }

  return null;
}

function readWarmedOpeningGameState(
  game: GameState
): { generated: GeneratedAiMove; nextGame: GameState; source: string } | null {
  if (!isFirstOpeningAnswer(game)) {
    return null;
  }

  const generated = readWarmedOpeningMove(game.transcript[0].answer);

  if (!generated || generated.move.action !== "ask_question") {
    return null;
  }

  const nextGame = attachModelResponseId(
    applyAiMove(game, generated.move),
    generated.responseId
  );

  return {
    generated,
    nextGame,
    source: "warmed_opening_move"
  };
}

function logAnsweredTurn({
  requestId,
  game,
  answer,
  generated,
  nextGame,
  source
}: {
  requestId: string;
  game: GameState;
  answer: string;
  generated: GeneratedAiMove;
  nextGame: GameState;
  source: string;
}) {
  const move = generated.move;

  logInfo("game_turn_answered", {
    requestId,
    gameId: game.gameId,
    answeredQuestionCount: game.transcript.length,
    latestQuestion: game.transcript.at(-1)?.question ?? null,
    latestAnswer: answer,
    source,
    move: {
      action: move.action,
      question: move.question,
      guess: move.guess,
      shortRationale: move.shortRationale
    },
    nextState: {
      phase: nextGame.phase,
      questionCount: nextGame.questionCount,
      latestQuestion: nextGame.latestQuestion,
      finalGuess: nextGame.finalGuess
    },
    runtime: {
      requestedModel: generated.requestedModel,
      actualModel: generated.actualModel,
      requestedServiceTier: generated.requestedServiceTier,
      actualServiceTier: generated.actualServiceTier,
      promptCacheKey: generated.promptCacheKey,
      responseId: generated.responseId,
      usage: summarizeUsage(generated.usage)
    }
  });
}

function summarizeUsage(usage: GeneratedAiMove["usage"]) {
  if (!usage) {
    return null;
  }

  return {
    inputTokens: usage.input_tokens,
    cachedTokens: usage.input_tokens_details.cached_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    totalTokens: usage.total_tokens
  };
}
