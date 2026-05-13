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
  const strategicMove = buildStrategicLocalMove(game);

  if (strategicMove) {
    return {
      generated: {
        move: strategicMove,
        requestedServiceTier: "local_strategy",
        actualServiceTier: null
      },
      nextGame: applyAiMove(game, strategicMove)
    };
  }

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
        actualServiceTier: generated.actualServiceTier
      }
    })
  );
}

function buildStrategicLocalMove(game: GameState): AiMove | null {
  const answered = game.transcript;
  const askedQuestions = answered.map((turn) => turn.question.toLowerCase());
  const hasYes = (pattern: RegExp) =>
    answered.some((turn) => turn.answer === "yes" && pattern.test(turn.question.toLowerCase()));
  const hasNo = (pattern: RegExp) =>
    answered.some((turn) => turn.answer === "no" && pattern.test(turn.question.toLowerCase()));
  const hasKnownForNo = (pattern: RegExp) =>
    answered.some((turn) => {
      const question = turn.question.toLowerCase();
      const isNarrowSubtypeQuestion =
        /\b(english-language|english language|spanish-language|spanish language|latin|country music|rock music|r&b|soul music|reggaeton|latin urban|instrumentalist|composer|dj|team sport|combat sports|professional wrestling|olympics|tennis|golf|motorsports|auto racing)\b/.test(
          question
        );
      return (
        turn.answer === "no" &&
        !isNarrowSubtypeQuestion &&
        /\b(best known|primarily known|mainly known|known for|primarily famous|mainly famous|main fame|primary fame|first became famous|first become famous|famous through|known through)\b/.test(
          question
        ) &&
        pattern.test(question)
      );
    });
  const hasAsked = (pattern: RegExp) => askedQuestions.some((question) => pattern.test(question));

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(entertainment|media)\b/) &&
    hasKnownForNo(/\b(acting|actor|movies|movie|television|tv)\b/) &&
    hasKnownForNo(/\b(music|musician|singer)\b/) &&
    !hasAsked(/\b(reality|famous family)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they best known through reality TV or a famous family?",
      guess: null,
      shortRationale: "Local high-signal split for media personalities."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(entertainment|media)\b/) &&
    hasKnownForNo(/\b(acting|actor|movies|movie|television|tv)\b/) &&
    hasKnownForNo(/\b(music|musician|singer)\b/) &&
    hasNo(/\b(reality|famous family)\b/) &&
    !hasAsked(/\b(mature-audience entertainment|adult entertainment)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Did they first become famous through mature-audience entertainment?",
      guess: null,
      shortRationale: "Local high-signal split for modern media personalities."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(kardashian-jenner|kardashian jenner)\b/) &&
    !hasAsked(/\b(public last name|last name kardashian|last name jenner)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Is their public last name Kardashian?",
      guess: null,
      shortRationale: "Local Kardashian-Jenner split before guessing."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(public last name kardashian|last name kardashian)\b/) &&
    !hasAsked(/\b(skims)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they closely associated with SKIMS?",
      guess: null,
      shortRationale: "Local signature-brand split inside the Kardashian cluster."
    };
  }

  if (
    hasYes(/\b(skims)\b/) &&
    !hasAsked(/\b(kim kardashian)\b/)
  ) {
    return {
      action: "make_guess",
      question: null,
      guess: "Kim Kardashian",
      shortRationale: "Local canonical guess from a signature Kardashian-family clue."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(music|musician|singer|song|album)\b/) &&
    (hasNo(/\b(united states|american|u\.s\.|usa|english-language|english language)\b/) ||
      hasAsked(/\b(country music|rock music|r&b|soul music|instrumentalist|composer|dj)\b/)) &&
    !hasAsked(/\b(latin|spanish-language|spanish language|reggaeton|latin urban)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they primarily associated with Latin music?",
      guess: null,
      shortRationale: "Local global-music split before genre checklisting."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(latin music|latin or spanish-language culture)\b/) &&
    !hasAsked(/\b(reggaeton|latin urban)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they primarily known for reggaeton or Latin urban music?",
      guess: null,
      shortRationale: "Local high-signal split for contemporary Latin musicians."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(reggaeton|latin urban)\b/) &&
    !hasAsked(/\b(puerto rican|puerto rico)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they Puerto Rican?",
      guess: null,
      shortRationale: "Local high-signal split for reggaeton stars."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(sports|athletic competition|athlete)\b/) &&
    hasNo(/\b(team sport)\b/) &&
    !hasAsked(/\b(bodybuilding|bodybuilder|fitness)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Did they first become famous through bodybuilding or fitness?",
      guess: null,
      shortRationale: "Local high-signal split for individual-sport celebrities."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(bodybuilding|bodybuilder|fitness)\b/) &&
    !hasAsked(/\b(hollywood|action movie|action film|actor)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Did they later become a major Hollywood action star?",
      guess: null,
      shortRationale: "Local celebrity crossover split after bodybuilding."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(public notoriety|crime|violent conflict|violence|extremism)\b/) &&
    !hasAsked(/\b(terrorism|extremist|extremism)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Was their notoriety mainly connected to terrorism or extremist violence?",
      guess: null,
      shortRationale: "Local high-signal split for notoriety-first public figures."
    };
  }

  if (
    game.questionCount < game.maxQuestions &&
    hasYes(/\b(acting|actor|movies|movie|television|tv)\b/) &&
    hasYes(/\b(comedy|sitcom)\b/) &&
    !hasAsked(/\b(also known for music|stage name|rapper|musician)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they also known for music under a stage name?",
      guess: null,
      shortRationale: "Local mixed-career split before sitcom-title chaining."
    };
  }

  return null;
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

  if (/\b(reggaeton|latin urban|puerto rican)\b/.test(yesAnswers)) {
    return "Bad Bunny";
  }

  if (/\b(adult entertainment|mature-audience entertainment)\b/.test(yesAnswers)) {
    return "Mia Khalifa";
  }

  if (/\b(public notoriety|violent conflict|extremism|terrorism|al-qaeda)\b/.test(yesAnswers)) {
    return "Osama bin Laden";
  }

  if (/\b(music|singer|song|album|pop)\b/.test(yesAnswers)) {
    if (/\b(latin|spanish-language|spanish language)\b/.test(yesAnswers)) {
      return "Bad Bunny";
    }

    return "Taylor Swift";
  }

  if (/\b(bodybuilding|bodybuilder|fitness)\b/.test(yesAnswers)) {
    return "Arnold Schwarzenegger";
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
