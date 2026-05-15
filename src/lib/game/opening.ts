import type { AiMove, PlayerAnswer } from "./ai-move";
import type { GameReasoningEffort } from "./reasoning";
import { DEFAULT_GAME_MODEL, DEFAULT_GAME_REASONING_EFFORT } from "./state";
import type { GameModel } from "./state";
import type { GameState } from "./state";

export const OPENING_QUESTION = "Is this person alive?";

export const OPENING_MOVE: AiMove = {
  action: "ask_question",
  question: OPENING_QUESTION,
  guess: null,
  shortRationale: "Open with a broad split."
};

export const NON_LIVING_IDENTITY_BOUNDARY_QUESTION =
  "Was this a real person who actually lived, rather than a fictional, legendary, or screen-persona figure?";

export const NON_LIVING_IDENTITY_BOUNDARY_MOVE: AiMove = {
  action: "ask_question",
  question: NON_LIVING_IDENTITY_BOUNDARY_QUESTION,
  guess: null,
  shortRationale:
    "After Alive = No, separate real dead humans from person-like fictional or legendary targets."
};

export function isFirstOpeningAnswer(state: GameState): state is GameState & {
  transcript: [{ question: string; answer: PlayerAnswer }];
} {
  return (
    state.questionCount === 1 &&
    state.transcript.length === 1 &&
    state.transcript[0].question === OPENING_QUESTION &&
    state.latestQuestion === null &&
    state.finalGuess === null &&
    state.result === "unknown"
  );
}

export function readDeterministicOpeningFollowupMove(state: GameState): AiMove | null {
  if (!isFirstOpeningAnswer(state)) {
    return null;
  }

  if (state.transcript[0].answer === "no") {
    return NON_LIVING_IDENTITY_BOUNDARY_MOVE;
  }

  return null;
}

export function createSharedOpeningAnswerState(
  answer: PlayerAnswer,
  reasoningEffort: GameReasoningEffort = DEFAULT_GAME_REASONING_EFFORT,
  model: GameModel = DEFAULT_GAME_MODEL
): GameState {
  return {
    gameId: `shared-opening-${model}-${reasoningEffort}-${answer}`,
    phase: "asking",
    questionCount: 1,
    maxQuestions: 21,
    transcript: [
      {
        question: OPENING_QUESTION,
        answer
      }
    ],
    latestQuestion: null,
    finalGuess: null,
    result: "unknown",
    model,
    reasoningEffort,
    modelResponseId: null,
    modelResponseModel: null
  };
}
