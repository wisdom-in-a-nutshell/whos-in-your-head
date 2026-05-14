import { z } from "zod";
import {
  aiMoveSchema,
  playerAnswerSchema,
  type AiMove,
  type PlayerAnswer
} from "./ai-move";
import { gameReasoningEffortSchema, type GameReasoningEffort } from "./reasoning";

export const MAX_QUESTIONS = 21;
export const DEFAULT_GAME_REASONING_EFFORT: GameReasoningEffort = "high";
export const gameModelValues = [
  "gpt-chat-latest",
  "gpt-5.4-mini",
  "claude-sonnet-4-6",
  "claude-opus-4-6"
] as const;
export const DEFAULT_GAME_MODEL = "gpt-chat-latest";

export const gamePhaseSchema = z.enum(["asking", "guessing", "result"]);
export const gameResultSchema = z.enum(["unknown", "correct", "incorrect"]);
export const actualAnswerSchema = z.string().trim().min(1).max(160);
export const gameModelSchema = z.enum(gameModelValues);

export const answeredTurnSchema = z.object({
  question: z.string().trim().min(1).max(180),
  answer: playerAnswerSchema
});

export const gameStateSchema = z
  .object({
    gameId: z.string().trim().min(1),
    phase: gamePhaseSchema,
    questionCount: z.number().int().min(0).max(MAX_QUESTIONS),
    maxQuestions: z.literal(MAX_QUESTIONS),
    transcript: z.array(answeredTurnSchema).max(MAX_QUESTIONS),
    latestQuestion: z.string().trim().min(1).max(180).nullable(),
    finalGuess: z.string().trim().min(1).max(120).nullable(),
    result: gameResultSchema,
    model: gameModelSchema.default(DEFAULT_GAME_MODEL),
    reasoningEffort: gameReasoningEffortSchema.default(DEFAULT_GAME_REASONING_EFFORT),
    modelResponseId: z.string().trim().min(1).nullable(),
    modelResponseModel: z.string().trim().min(1).nullable().default(null)
  })
  .strict();

export const gameTurnRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    model: gameModelSchema.default(DEFAULT_GAME_MODEL)
  }),
  z.object({
    action: z.literal("answer"),
    state: gameStateSchema,
    answer: playerAnswerSchema
  }),
  z.object({
    action: z.literal("judge_guess"),
    state: gameStateSchema,
    correct: z.boolean()
  }),
  z.object({
    action: z.literal("report_actual_answer"),
    state: gameStateSchema,
    actualAnswer: actualAnswerSchema
  })
]);

export type GamePhase = z.infer<typeof gamePhaseSchema>;
export type GameResult = z.infer<typeof gameResultSchema>;
export type AnsweredTurn = z.infer<typeof answeredTurnSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type GameModel = z.infer<typeof gameModelSchema>;
export type GameTurnRequest = z.infer<typeof gameTurnRequestSchema>;

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

export function createInitialGameState(
  reasoningEffort: GameReasoningEffort = DEFAULT_GAME_REASONING_EFFORT,
  model: GameModel = DEFAULT_GAME_MODEL
): GameState {
  return {
    gameId: crypto.randomUUID(),
    phase: "asking",
    questionCount: 0,
    maxQuestions: MAX_QUESTIONS,
    transcript: [],
    latestQuestion: null,
    finalGuess: null,
    result: "unknown",
    model,
    reasoningEffort,
    modelResponseId: null,
    modelResponseModel: null
  };
}

export function recordPlayerAnswer(
  state: GameState,
  answer: PlayerAnswer
): GameState {
  const parsedState = gameStateSchema.parse(state);

  if (parsedState.phase !== "asking" || parsedState.latestQuestion === null) {
    throw new GameRuleError("There is no active question to answer.");
  }

  if (parsedState.transcript.length !== parsedState.questionCount - 1) {
    throw new GameRuleError("The supplied game state has an inconsistent turn count.");
  }

  return {
    ...parsedState,
    transcript: [
      ...parsedState.transcript,
      {
        question: parsedState.latestQuestion,
        answer
      }
    ],
    latestQuestion: null
  };
}

export function applyAiMove(state: GameState, move: AiMove): GameState {
  const parsedState = gameStateSchema.parse(state);
  const parsedMove = aiMoveSchema.parse(move);

  if (parsedState.result !== "unknown") {
    throw new GameRuleError("This game is already finished.");
  }

  if (parsedMove.action === "ask_question") {
    if (parsedState.questionCount >= parsedState.maxQuestions) {
      throw new GameRuleError("The AI cannot ask more than 21 questions.");
    }

    if (parsedMove.question === null) {
      throw new GameRuleError("Question move did not include a question.");
    }

    const question = normalizeQuestion(parsedMove.question);
    assertQuestionAllowed(question);

    return {
      ...parsedState,
      phase: "asking",
      questionCount: parsedState.questionCount + 1,
      latestQuestion: question,
      finalGuess: null
    };
  }

  if (parsedMove.guess === null) {
    throw new GameRuleError("Guess move did not include a guess.");
  }

  return {
    ...parsedState,
    phase: "guessing",
    latestQuestion: null,
    finalGuess: normalizeGuess(parsedMove.guess)
  };
}

export function finalizeGuess(state: GameState, correct: boolean): GameState {
  const parsedState = gameStateSchema.parse(state);

  if (parsedState.phase !== "guessing" || parsedState.finalGuess === null) {
    throw new GameRuleError("There is no final guess to judge.");
  }

  return {
    ...parsedState,
    phase: "result",
    result: correct ? "correct" : "incorrect"
  };
}

export function buildModelGameSnapshot(state: GameState) {
  const answeredQuestionCount = state.transcript.length;
  const remainingQuestionSlots = Math.max(0, state.maxQuestions - state.questionCount);

  return {
    gameId: state.gameId,
    phase: state.phase,
    questionCountAsked: state.questionCount,
    answeredQuestionCount,
    maxQuestions: state.maxQuestions,
    remainingQuestionSlots,
    latestUnansweredQuestion: state.latestQuestion,
    lastAnswer: state.transcript.at(-1)?.answer ?? null,
    model: state.model,
    reasoningEffort: state.reasoningEffort,
    transcript: state.transcript
  };
}

export function attachModelResponseId(
  state: GameState,
  modelResponseId: string | null,
  modelResponseModel: string | null = null
): GameState {
  return gameStateSchema.parse({
    ...state,
    modelResponseId,
    modelResponseModel: modelResponseId === null ? null : modelResponseModel
  });
}

function normalizeQuestion(question: string): string {
  const compacted = question.replace(/\s+/g, " ").trim();
  return compacted.endsWith("?") ? compacted : `${compacted}?`;
}

function normalizeGuess(guess: string): string {
  return guess.replace(/\s+/g, " ").trim();
}

function assertQuestionAllowed(question: string) {
  if (question.length > 180) {
    throw new GameRuleError("The AI question is too long.");
  }

  if ((question.match(/\?/g) ?? []).length !== 1) {
    throw new GameRuleError("The AI must ask exactly one question.");
  }

  const startsLikeYesNoQuestion =
    /^(am|are|is|was|were|do|does|did|has|have|had|can|could|would|will|should)\b/i.test(
      question
    );

  if (!startsLikeYesNoQuestion) {
    throw new GameRuleError("The AI question must be answerable with yes, no, or maybe.");
  }
}
