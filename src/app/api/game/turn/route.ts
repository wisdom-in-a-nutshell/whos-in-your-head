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
import { getOpenAIRuntimeStatus } from "@/lib/server/openai";
import {
  generateAiMove,
  readWarmedOpeningMove,
  warmOpeningMoveResponses,
  type GeneratedAiMove
} from "@/lib/server/game-master";

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
  const body = await request.json().catch(() => null);
  const parsed = gameTurnRequestSchema.safeParse(body);

  if (!parsed.success) {
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
      return NextResponse.json({
        ok: true,
        game: finalizeGuess(parsed.data.state, parsed.data.correct)
      });
    }

    if (parsed.data.action === "start") {
      const nextGame = applyAiMove(createInitialGameState(), OPENING_MOVE);
      warmOpeningMoveResponses();

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
    const { generated, nextGame, source } = await generateNextGameState(game);
    const move = generated.move;
    logAnsweredTurn({
      game,
      answer: parsed.data.answer,
      generated,
      nextGame
    });

    return NextResponse.json({
      ok: true,
      game: nextGame,
      move,
      runtime: {
        source,
        requestedServiceTier: generated.requestedServiceTier,
        actualServiceTier: generated.actualServiceTier,
        promptCacheKey: generated.promptCacheKey,
        usage: summarizeUsage(generated.usage)
      }
    });
  } catch (error) {
    const isRuleError = error instanceof GameRuleError;
    console.error(
      "[game-turn] turn failed",
      JSON.stringify({
        code: isRuleError ? "game_rule_error" : "game_master_error",
        error: describeError(error)
      })
    );

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
  game: GameState
): Promise<{ generated: GeneratedAiMove; nextGame: GameState; source: string }> {
  const warmedOpening = readWarmedOpeningGameState(game);

  if (warmedOpening) {
    return warmedOpening;
  }

  for (let attempt = 1; attempt <= MODEL_MOVE_ATTEMPTS; attempt += 1) {
    try {
      const generated = await generateAiMove(game);
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
      console.warn(
        "[game-turn] model move attempt failed",
        JSON.stringify({
          attempt,
          maxAttempts: MODEL_MOVE_ATTEMPTS,
          gameId: game.gameId,
          questionCount: game.questionCount,
          transcriptLength: game.transcript.length,
          error: describeError(error)
        })
      );
    }
  }

  throw new Error("The game master failed to produce a valid move after retries.");
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
  game,
  answer,
  generated,
  nextGame
}: {
  game: GameState;
  answer: string;
  generated: GeneratedAiMove;
  nextGame: GameState;
}) {
  const move = generated.move;

  console.info(
    "[game-turn] answered",
    JSON.stringify({
      gameId: game.gameId,
      answeredQuestionCount: game.transcript.length,
      latestAnswer: answer,
      transcript: game.transcript,
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
        requestedServiceTier: generated.requestedServiceTier,
        actualServiceTier: generated.actualServiceTier,
        promptCacheKey: generated.promptCacheKey,
        usage: summarizeUsage(generated.usage)
      }
    })
  );
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

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
}
