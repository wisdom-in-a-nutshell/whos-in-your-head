import { NextResponse } from "next/server";
import {
  applyAiMove,
  attachModelResponseId,
  createInitialGameState,
  finalizeGuess,
  forceGameModel,
  GameRuleError,
  gameStateSchema,
  gameTurnRequestSchema,
  recordPlayerAnswer,
  type GameState
} from "@/lib/game/state";
import { isFirstOpeningAnswer, OPENING_MOVE } from "@/lib/game/opening";
import { getAnthropicRuntimeStatus } from "@/lib/server/anthropic";
import {
  getOpenAIModelFallbacks,
  getOpenAIRuntimeStatus
} from "@/lib/server/openai";
import {
  generateAiMove,
  isContentFilterIncompleteResponseError,
  readWarmedOpeningMove,
  warmOpeningMoveResponsesForReasoning,
  type GeneratedAiMove
} from "@/lib/server/game-master";
import {
  recordActualAnswerTelemetry,
  recordGameFailureTelemetry,
  recordGameResultTelemetry,
  recordGameStartedTelemetry,
  recordGameTurnTelemetry
} from "@/lib/server/game-telemetry";
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
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const body = await request.json().catch(() => null);
  const parsed = gameTurnRequestSchema.safeParse(body);

  if (!parsed.success) {
    logWarn("game_turn_invalid_request", {
      requestId,
      issues: parsed.error.flatten()
    });
    recordGameFailureTelemetry({
      requestId,
      action: readBodyAction(body),
      state: readBodyState(body),
      code: "invalid_request",
      error: new Error("Invalid game turn request."),
      routeDurationMs: Date.now() - startedAt,
      body
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
    if (parsed.data.action === "report_actual_answer") {
      const state = forceGameModel(parsed.data.state);

      if (state.phase !== "result" || state.result !== "incorrect") {
        throw new GameRuleError("Only missed guesses can report the real answer.");
      }

      logInfo("game_turn_actual_answer_reported", {
        requestId,
        gameId: state.gameId,
        questionCount: state.questionCount,
        finalGuess: state.finalGuess,
        routeDurationMs: Date.now() - startedAt
      });
      recordActualAnswerTelemetry({
        requestId,
        state,
        actualAnswer: parsed.data.actualAnswer,
        routeDurationMs: Date.now() - startedAt
      });

      return NextResponse.json({
        ok: true,
        game: state
      });
    }

    if (parsed.data.action === "judge_guess") {
      const state = forceGameModel(parsed.data.state);
      const resultGame = finalizeGuess(state, parsed.data.correct);
      logInfo("game_turn_judge_guess", {
        requestId,
        gameId: state.gameId,
        correct: parsed.data.correct,
        questionCount: state.questionCount,
        routeDurationMs: Date.now() - startedAt
      });
      recordGameResultTelemetry({
        requestId,
        state,
        correct: parsed.data.correct,
        resultGame,
        routeDurationMs: Date.now() - startedAt
      });

      return NextResponse.json({
        ok: true,
        game: resultGame
      });
    }

    if (parsed.data.action === "start") {
      const status = getOpenAIRuntimeStatus();
      const nextGame = applyAiMove(
        createInitialGameState(status.reasoningEffort),
        OPENING_MOVE
      );
      warmOpeningMoveResponsesForReasoning(nextGame.reasoningEffort, nextGame.model);
      logInfo("game_turn_started", {
        requestId,
        gameId: nextGame.gameId,
        model: nextGame.model,
        reasoningEffort: nextGame.reasoningEffort,
        reasoningSchedule: "low:1-8,medium:9-16,late:17+",
        question: nextGame.latestQuestion,
        routeDurationMs: Date.now() - startedAt
      });
      recordGameStartedTelemetry({
        requestId,
        game: nextGame,
        routeDurationMs: Date.now() - startedAt
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

    const forcedState = forceGameModel(parsed.data.state);
    const status = getRuntimeStatusForGame(forcedState.model);

    if (status.configurationError) {
      logError("game_turn_llm_configuration_error", {
        requestId,
        provider: status.provider,
        error: status.configurationError
      });
      recordGameFailureTelemetry({
        requestId,
        action: parsed.data.action,
        state: forcedState,
        code: "llm_configuration_error",
        error: new Error(status.configurationError),
        routeDurationMs: Date.now() - startedAt,
        body
      });

      return NextResponse.json(
        {
          ok: false,
          code: "llm_configuration_error",
          error: status.configurationError,
          llm: status
        },
        { status: 503 }
      );
    }

    if (!status.configured) {
      logError("game_turn_llm_not_configured", {
        requestId,
        provider: status.provider
      });
      recordGameFailureTelemetry({
        requestId,
        action: parsed.data.action,
        state: forcedState,
        code: "llm_not_configured",
        error: new Error(status.missingConfigurationMessage),
        routeDurationMs: Date.now() - startedAt,
        body
      });

      return NextResponse.json(
        {
          ok: false,
          code: "llm_not_configured",
          error: status.missingConfigurationMessage,
          llm: status
        },
        { status: 503 }
      );
    }

    const game = recordPlayerAnswer(forcedState, parsed.data.answer);
    const { generated, nextGame, source } = await generateNextGameState(game, requestId);
    const move = generated.move;
    logAnsweredTurn({
      requestId,
      game,
      answer: parsed.data.answer,
      generated,
      nextGame,
      source,
      routeDurationMs: Date.now() - startedAt
    });
    recordGameTurnTelemetry({
      requestId,
      game,
      answer: parsed.data.answer,
      generated,
      nextGame,
      source,
      routeDurationMs: Date.now() - startedAt
    });

    return NextResponse.json({
      ok: true,
      game: nextGame,
      move,
      runtime: {
        source,
        requestedModel: generated.requestedModel,
        actualModel: generated.actualModel,
        reasoningEffort: generated.reasoningEffort,
        requestedServiceTier: generated.requestedServiceTier,
        actualServiceTier: generated.actualServiceTier,
        promptCacheKey: generated.promptCacheKey,
        usage: summarizeUsage(generated.usage)
      }
    });
  } catch (error) {
    const isRuleError = error instanceof GameRuleError;
    const failureState =
      parsed.success && "state" in parsed.data ? parsed.data.state : readBodyState(body);
    logError("game_turn_failed", {
      requestId,
      gameId: failureState?.gameId ?? null,
      questionCount: failureState?.questionCount ?? null,
      latestQuestion: failureState?.latestQuestion ?? null,
      finalGuess: failureState?.finalGuess ?? null,
      code: isRuleError ? "game_rule_error" : "game_master_error",
      error: describeError(error),
      routeDurationMs: Date.now() - startedAt
    });
    recordGameFailureTelemetry({
      requestId,
      action: parsed.success ? parsed.data.action : readBodyAction(body),
      state: failureState,
      code: isRuleError ? "game_rule_error" : "game_master_error",
      error,
      routeDurationMs: Date.now() - startedAt,
      body
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
        getReusableResponseId(generated),
        getReusableResponseModel(generated)
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

  const generated = readWarmedOpeningMove(
    game.transcript[0].answer,
    game.reasoningEffort,
    game.model
  );

  if (!generated || generated.move.action !== "ask_question") {
    return null;
  }

  const nextGame = attachModelResponseId(
    applyAiMove(game, generated.move),
    getReusableResponseId(generated),
    getReusableResponseModel(generated)
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
  source,
  routeDurationMs
}: {
  requestId: string;
  game: GameState;
  answer: string;
  generated: GeneratedAiMove;
  nextGame: GameState;
  source: string;
  routeDurationMs: number;
}) {
  const move = generated.move;

  logInfo("game_turn_answered", {
    requestId,
    gameId: game.gameId,
    model: game.model,
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
    routeDurationMs,
    runtime: {
      requestedModel: generated.requestedModel,
      actualModel: generated.actualModel,
      reasoningEffort: generated.reasoningEffort,
      requestedServiceTier: generated.requestedServiceTier,
      actualServiceTier: generated.actualServiceTier,
      promptCacheKey: generated.promptCacheKey,
      responseId: generated.responseId,
      modelDurationMs: generated.durationMs,
      usage: summarizeUsage(generated.usage)
    }
  });
}

function getReusableResponseId(generated: GeneratedAiMove) {
  if (!generated.responseId?.startsWith("resp_")) {
    return null;
  }

  if (generated.requestedModel.startsWith("gemini-")) {
    return null;
  }

  return generated.responseId;
}

function getReusableResponseModel(generated: GeneratedAiMove) {
  return getReusableResponseId(generated) === null ? null : generated.requestedModel;
}

function getRuntimeStatusForGame(model: string) {
  if (model.startsWith("claude-")) {
    return {
      ...getAnthropicRuntimeStatus(model),
      provider: "anthropic",
      missingConfigurationMessage: "LLM_API_KEY is not configured."
    };
  }

  return {
    ...getOpenAIRuntimeStatus(),
    provider: "openai",
    missingConfigurationMessage: "LLM_API_KEY or OPENAI_API_KEY is not configured."
  };
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

function readBodyAction(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("action" in body)) {
    return null;
  }

  return typeof body.action === "string" ? body.action : null;
}

function readBodyState(body: unknown): GameState | null {
  if (!body || typeof body !== "object" || !("state" in body)) {
    return null;
  }

  const parsed = gameStateSchema.safeParse(body.state);

  return parsed.success ? parsed.data : null;
}
