import { describe, expect, it } from "vitest";
import {
  applyAiMove,
  createInitialGameState,
  finalizeGuess,
  GameRuleError,
  gameTurnRequestSchema,
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
    expect(state.model).toBe("gpt-chat-latest");
    expect(state.reasoningEffort).toBe("high");
    expect(state.modelResponseId).toBeNull();
    expect(state.modelResponseModel).toBeNull();
  });

  it("keeps the assigned model on the game state", () => {
    const state = createInitialGameState("high", "gpt-5.4-mini");

    expect(state.model).toBe("gpt-5.4-mini");
    expect(
      applyAiMove(state, {
        action: "ask_question",
        question: "Are they alive?",
        guess: null,
        shortRationale: null
      }).model
    ).toBe("gpt-5.4-mini");
  });

  it("silently falls stale Gemini and Claude start models back to GPT Chat Latest", () => {
    const parsed = gameTurnRequestSchema.parse({
      action: "start",
      model: "gemini-3.1-flash-lite"
    });

    expect(parsed.action).toBe("start");
    if (parsed.action !== "start") {
      throw new Error("Expected a start action.");
    }

    expect(parsed.model).toBe("gpt-chat-latest");

    const claudeParsed = gameTurnRequestSchema.parse({
      action: "start",
      model: "claude-sonnet-4-6"
    });

    expect(claudeParsed.action).toBe("start");
    if (claudeParsed.action !== "start") {
      throw new Error("Expected a start action.");
    }

    expect(claudeParsed.model).toBe("gpt-chat-latest");
  });

  it("defaults start requests to GPT Chat Latest", () => {
    const parsed = gameTurnRequestSchema.parse({
      action: "start"
    });

    expect(parsed.action).toBe("start");
    if (parsed.action !== "start") {
      throw new Error("Expected a start action.");
    }

    expect(parsed.model).toBe("gpt-chat-latest");
  });

  it("silently falls unknown start models back to GPT Chat Latest", () => {
    const parsed = gameTurnRequestSchema.parse({
      action: "start",
      model: "chat"
    });

    expect(parsed.action).toBe("start");
    if (parsed.action !== "start") {
      throw new Error("Expected a start action.");
    }

    expect(parsed.model).toBe("gpt-chat-latest");
  });

  it("silently falls unknown state models back to GPT Chat Latest", () => {
    const parsed = gameTurnRequestSchema.parse({
      action: "answer",
      state: {
        ...createInitialGameState(),
        model: "chat",
        latestQuestion: "Is this person alive?",
        questionCount: 1
      },
      answer: "yes"
    });

    expect(parsed.action).toBe("answer");
    if (parsed.action !== "answer") {
      throw new Error("Expected an answer action.");
    }

    expect(parsed.state.model).toBe("gpt-chat-latest");
  });

  it("keeps the assigned reasoning effort on the game state", () => {
    const state = createInitialGameState("low");

    expect(state.reasoningEffort).toBe("low");
    expect(
      applyAiMove(state, {
        action: "ask_question",
        question: "Are they alive?",
        guess: null,
        shortRationale: null
      }).reasoningEffort
    ).toBe("low");
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

  it("accepts a reported actual answer after a missed guess", () => {
    const result = finalizeGuess(
      applyAiMove(createInitialGameState(), {
        action: "make_guess",
        question: null,
        guess: "Charles Darwin",
        shortRationale: null
      }),
      false
    );

    const parsed = gameTurnRequestSchema.parse({
      action: "report_actual_answer",
      state: result,
      actualAnswer: "  Gregor Mendel  "
    });

    expect(parsed.action).toBe("report_actual_answer");

    if (parsed.action === "report_actual_answer") {
      expect(parsed.actualAnswer).toBe("Gregor Mendel");
    }
  });
});
