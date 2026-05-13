import { NextResponse } from "next/server";
import {
  applyAiMove,
  createInitialGameState,
  finalizeGuess,
  GameRuleError,
  gameTurnRequestSchema,
  recordPlayerAnswer,
  type GameState
} from "@/lib/game/state";
import { getOpenAIRuntimeStatus } from "@/lib/server/openai";
import { generateAiMove, type GeneratedAiMove } from "@/lib/server/game-master";
import type { AiMove } from "@/lib/game/ai-move";

export const runtime = "nodejs";
const MODEL_MOVE_ATTEMPTS = 2;

const OPENING_MOVE: AiMove = {
  action: "ask_question",
  question: "Is this person alive?",
  guess: null,
  shortRationale: "Open with a broad split."
};

const RECOVERY_QUESTIONS = [
  "Are they primarily famous for entertainment?",
  "Are they primarily famous for music?",
  "Are they primarily famous for acting or screen work?",
  "Are they primarily famous through social media or online video?",
  "Are they primarily famous outside the United States?",
  "Did they become famous before 2010?",
  "Are they associated with one signature work?",
  "Are they also known for business or entrepreneurship?",
  "Have they held public office?",
  "Are they best known as an athlete?",
  "Are they a historical figure from before 1900?",
  "Is their public name a stage name or pseudonym?"
];

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
    const { generated, nextGame } = await generateNextGameState(game);
    const move = generated.move;

    return NextResponse.json({
      ok: true,
      game: nextGame,
      move,
      runtime: {
        requestedServiceTier: generated.requestedServiceTier,
        actualServiceTier: generated.actualServiceTier
      }
    });
  } catch (error) {
    const isRuleError = error instanceof GameRuleError;
    console.error("[game-turn] turn failed", {
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
  game: GameState
): Promise<{ generated: GeneratedAiMove; nextGame: GameState }> {
  for (let attempt = 1; attempt <= MODEL_MOVE_ATTEMPTS; attempt += 1) {
    try {
      const generated = await generateAiMove(game);
      const nextGame = applyAiMove(game, generated.move);

      return {
        generated,
        nextGame
      };
    } catch (error) {
      console.warn("[game-turn] model move attempt failed", {
        attempt,
        maxAttempts: MODEL_MOVE_ATTEMPTS,
        gameId: game.gameId,
        questionCount: game.questionCount,
        transcriptLength: game.transcript.length,
        error: describeError(error)
      });
    }
  }

  const recoveryMove = buildRecoveryMove(game);
  const nextGame = applyAiMove(game, recoveryMove);

  console.warn("[game-turn] using deterministic recovery move", {
    gameId: game.gameId,
    questionCount: game.questionCount,
    move: recoveryMove
  });

  return {
    generated: {
      move: recoveryMove,
      requestedServiceTier: "local_recovery",
      actualServiceTier: null
    },
    nextGame
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

function buildRecoveryMove(game: GameState): AiMove {
  if (game.questionCount >= game.maxQuestions) {
    return {
      action: "make_guess",
      question: null,
      guess: chooseRecoveryGuess(game),
      shortRationale: "Local recovery guess after model move failures."
    };
  }

  const askedQuestions = new Set(
    game.transcript
      .map((turn) => normalizeQuestionForComparison(turn.question))
      .concat(game.latestQuestion ? [normalizeQuestionForComparison(game.latestQuestion)] : [])
  );

  const question =
    RECOVERY_QUESTIONS.find(
      (candidate) => !askedQuestions.has(normalizeQuestionForComparison(candidate))
    ) ?? "Are they still professionally active today?";

  return {
    action: "ask_question",
    question,
    guess: null,
    shortRationale: "Local recovery question after model move failures."
  };
}

function normalizeQuestionForComparison(question: string): string {
  return question.replace(/\s+/g, " ").trim().toLowerCase();
}

function chooseRecoveryGuess(game: GameState): string {
  const yesAnswers = game.transcript
    .filter((turn) => turn.answer === "yes")
    .map((turn) => turn.question.toLowerCase())
    .join(" ");

  if (/\b(instagram|social media|online|vine|youtube|internet)\b/.test(yesAnswers)) {
    return "Kim Kardashian";
  }

  if (/\b(music|singer|song|album|pop)\b/.test(yesAnswers)) {
    return "Taylor Swift";
  }

  if (/\b(actor|acting|screen|movie|film|tv|television)\b/.test(yesAnswers)) {
    return "Tom Cruise";
  }

  if (/\b(sport|athlete|football|soccer|basketball|tennis)\b/.test(yesAnswers)) {
    return "Cristiano Ronaldo";
  }

  if (/\b(politic|president|public office|government)\b/.test(yesAnswers)) {
    return "Barack Obama";
  }

  if (/\b(science|scientist|inventor|historical|before 1900)\b/.test(yesAnswers)) {
    return "Albert Einstein";
  }

  return "Taylor Swift";
}
