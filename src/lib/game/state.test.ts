import { describe, expect, it } from "vitest";
import {
  applyAiMove,
  createInitialGameState,
  finalizeGuess,
  GameRuleError,
  recordPlayerAnswer
} from "./state";

describe("game state transitions", () => {
  it("starts with inspectable empty game state", () => {
    const state = createInitialGameState();

    expect(state.phase).toBe("asking");
    expect(state.questionCount).toBe(0);
    expect(state.maxQuestions).toBe(21);
    expect(state.transcript).toEqual([]);
    expect(state.latestQuestion).toBeNull();
    expect(state.finalGuess).toBeNull();
    expect(state.result).toBe("unknown");
    expect(state.modelResponseId).toBeNull();
  });

  it("applies an AI question and records the player's answer", () => {
    const state = applyAiMove(createInitialGameState(), {
      action: "ask_question",
      question: "Are they alive?",
      guess: null,
      shortRationale: null
    });

    expect(state.questionCount).toBe(1);
    expect(state.latestQuestion).toBe("Are they alive?");

    const answered = recordPlayerAnswer(state, "yes");

    expect(answered.transcript).toEqual([
      {
        question: "Are they alive?",
        answer: "yes"
      }
    ]);
    expect(answered.latestQuestion).toBeNull();
  });

  it("blocks open-ended AI questions", () => {
    expect(() =>
      applyAiMove(createInitialGameState(), {
        action: "ask_question",
        question: "What are they known for?",
        guess: null,
        shortRationale: null
      })
    ).toThrow(GameRuleError);
  });

  it("enforces the 21 question limit before another question can be asked", () => {
    let state = createInitialGameState();

    for (let index = 0; index < 21; index += 1) {
      state = applyAiMove(state, {
        action: "ask_question",
        question: `Are they clue number ${index + 1}?`,
        guess: null,
        shortRationale: null
      });

      state = recordPlayerAnswer(state, "no");
    }

    expect(() =>
      applyAiMove(state, {
        action: "ask_question",
        question: "Are they still available?",
        guess: null,
        shortRationale: null
      })
    ).toThrow(GameRuleError);
  });

  it("accepts a final guess and result judgment", () => {
    const guessing = applyAiMove(createInitialGameState(), {
      action: "make_guess",
      question: null,
      guess: "Zendaya",
      shortRationale: "Early demo guess."
    });

    expect(guessing.phase).toBe("guessing");
    expect(guessing.finalGuess).toBe("Zendaya");

    const result = finalizeGuess(guessing, true);

    expect(result.phase).toBe("result");
    expect(result.result).toBe("correct");
  });
});
