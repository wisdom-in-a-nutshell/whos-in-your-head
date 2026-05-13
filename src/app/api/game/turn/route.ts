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
  "Are they primarily famous outside the United States?",
  "Are they primarily associated with Latin or Spanish-language culture?",
  "Are they primarily famous for acting or screen work?",
  "Are they primarily famous through social media or online video?",
  "Are they better described as a media personality than a traditional performer?",
  "Did they first become famous through adult entertainment?",
  "Are they publicly associated with a major controversy?",
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
): Promise<{ generated: GeneratedAiMove; nextGame: GameState }> {
  for (let attempt = 1; attempt <= MODEL_MOVE_ATTEMPTS; attempt += 1) {
    try {
      const generated = await generateAiMove(game);
      const nextGame = attachModelResponseId(
        applyAiMove(game, generated.move),
        generated.responseId
      );

      return {
        generated,
        nextGame
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

  const recoveryMove = buildRecoveryMove(game);
  const nextGame = applyAiMove(game, recoveryMove);

  console.warn(
    "[game-turn] using deterministic recovery move",
    JSON.stringify({
      gameId: game.gameId,
      questionCount: game.questionCount,
      transcriptLength: game.transcript.length,
      move: recoveryMove
    })
  );

  return {
    generated: {
      move: recoveryMove,
      requestedServiceTier: "local_recovery",
      actualServiceTier: null,
        promptCacheKey: null,
        responseId: null,
        usage: null
    },
    nextGame
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

function buildRecoveryMove(game: GameState): AiMove {
  if (game.questionCount >= game.maxQuestions) {
    throw new Error("The model failed to produce a final guess after retries.");
  }

  const askedQuestions = new Set(
    game.transcript
      .map((turn) => normalizeQuestionForComparison(turn.question))
      .concat(game.latestQuestion ? [normalizeQuestionForComparison(game.latestQuestion)] : [])
  );

  const contextualQuestion = chooseContextualRecoveryQuestion(game, askedQuestions);
  const question =
    contextualQuestion ??
    RECOVERY_QUESTIONS.find(
      (candidate) =>
        !askedQuestions.has(normalizeQuestionForComparison(candidate)) &&
        !questionConflictsWithTranscript(candidate, game)
    ) ?? "Are they still professionally active today?";

  return {
    action: "ask_question",
    question,
    guess: null,
    shortRationale: "Local recovery question after model move failures."
  };
}

function chooseContextualRecoveryQuestion(
  game: GameState,
  askedQuestions: Set<string>
): string | null {
  const candidates: string[] = [];

  if (hasAnswer(game, "yes", /\b(business|entrepreneurship)\b/)) {
    if (hasAnswer(game, "yes", /\b(finance|payments|banking|cryptocurrency)\b/)) {
      candidates.push(
        "Is this person primarily known as an investor or hedge fund manager rather than as a banker?",
        "Is this person best known for investment management rather than running a bank?"
      );
    }

    candidates.push(
      "Is this person best known for founding or leading a technology company?",
      "Is this person best known for a consumer-facing company?"
    );
  }

  if (hasAnswer(game, "yes", /\b(entertainment|media)\b/)) {
    candidates.push(
      "Did they first become famous through television?",
      "Are they better described as a media personality than a traditional performer?"
    );
  }

  if (hasAnswer(game, "yes", /\b(music|musician|singer|song|album)\b/)) {
    candidates.push(
      "Are they primarily associated with music from outside the United States?",
      "Are they mainly known as a solo performer?"
    );
  }

  return (
    candidates.find(
      (candidate) =>
        !askedQuestions.has(normalizeQuestionForComparison(candidate)) &&
        !questionConflictsWithTranscript(candidate, game)
    ) ?? null
  );
}

function normalizeQuestionForComparison(question: string): string {
  return question.replace(/\s+/g, " ").trim().toLowerCase();
}

function questionConflictsWithTranscript(question: string, game: GameState): boolean {
  const normalizedQuestion = question.toLowerCase();
  const hasBusinessYes = hasAnswer(game, "yes", /\b(business|entrepreneurship)\b/);

  if (
    hasAnswer(game, "no", /\b(entertainment|media)\b/) &&
    /\b(entertainment|music|acting|screen|social media|media personality|adult entertainment|signature work)\b/.test(
      normalizedQuestion
    )
  ) {
    return true;
  }

  if (hasAnswer(game, "no", /\b(music|musician|singer)\b/) && /\bmusic\b/.test(normalizedQuestion)) {
    return true;
  }

  if (
    hasAnswer(game, "no", /\b(sports|athletic competition|athlete)\b/) &&
    /\b(sport|athlete)\b/.test(normalizedQuestion)
  ) {
    return true;
  }

  if (
    hasAnswer(game, "no", /\b(politics|government)\b/) &&
    /\b(public office|politics|government)\b/.test(normalizedQuestion)
  ) {
    return true;
  }

  return (
    hasBusinessYes &&
    game.transcript.length >= 8 &&
    /\b(entertainment|music|acting|athlete|public office|historical figure)\b/.test(
      normalizedQuestion
    )
  );
}

function hasAnswer(game: GameState, answer: "yes" | "no" | "maybe", pattern: RegExp) {
  return game.transcript.some(
    (turn) => turn.answer === answer && pattern.test(turn.question.toLowerCase())
  );
}
