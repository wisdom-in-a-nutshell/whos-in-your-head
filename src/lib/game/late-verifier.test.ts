import { describe, expect, it } from "vitest";
import {
  buildLateVerifierInput,
  lateVerificationSchema,
  lateVerificationToMove,
  shouldRunLateVerifier
} from "./late-verifier";
import { createSharedOpeningAnswerState } from "./opening";
import type { AiMove } from "./ai-move";

describe("late verifier", () => {
  it("runs only for late GPT final guesses", () => {
    const guess: AiMove = {
      action: "make_guess",
      question: null,
      guess: "Dr. Phil",
      shortRationale: null
    };

    expect(shouldRunLateVerifier(createAnsweredState(15), guess)).toBe(false);
    expect(shouldRunLateVerifier(createAnsweredState(16), guess)).toBe(true);
    expect(
      shouldRunLateVerifier(createAnsweredState(16, "gpt-5.4-mini"), guess)
    ).toBe(false);
    expect(
      shouldRunLateVerifier(createAnsweredState(16), {
        action: "ask_question",
        question: "Is this person alive?",
        guess: null,
        shortRationale: null
      })
    ).toBe(false);
  });

  it("validates verdict-specific replacement fields", () => {
    expect(() =>
      lateVerificationSchema.parse({
        candidates: [candidate("Dr. Oz")],
        verdict: "ask_question",
        guess: null,
        question: "Does this person have a medical background?",
        shortRationale: null
      })
    ).not.toThrow();

    expect(() =>
      lateVerificationSchema.parse({
        candidates: [candidate("Dr. Oz")],
        verdict: "ask_question",
        guess: "Dr. Oz",
        question: null,
        shortRationale: null
      })
    ).toThrow();
  });

  it("can convert an approved verification into no override", () => {
    const move: AiMove = {
      action: "make_guess",
      question: null,
      guess: "Dr. Phil",
      shortRationale: null
    };

    expect(
      lateVerificationToMove(
        lateVerificationSchema.parse({
          candidates: [candidate("Dr. Phil")],
          verdict: "approve_guess",
          guess: null,
          question: null,
          shortRationale: null
        }),
        move,
        createAnsweredState(18)
      )
    ).toBeNull();
  });

  it("can replace a late guess with a discriminator question when slots remain", () => {
    const replacement = lateVerificationToMove(
      lateVerificationSchema.parse({
        candidates: [candidate("Dr. Phil"), candidate("Dr. Oz")],
        verdict: "ask_question",
        guess: null,
        question: "Does this person have a medical background?",
        shortRationale: "Separate Dr. Oz from Dr. Phil."
      }),
      {
        action: "make_guess",
        question: null,
        guess: "Dr. Phil",
        shortRationale: null
      },
      createAnsweredState(20)
    );

    expect(replacement).toMatchObject({
      action: "ask_question",
      question: "Does this person have a medical background?"
    });
  });

  it("does not ask another question when no slots remain", () => {
    const replacement = lateVerificationToMove(
      lateVerificationSchema.parse({
        candidates: [candidate("Dr. Phil"), candidate("Dr. Oz")],
        verdict: "ask_question",
        guess: null,
        question: "Does this person have a medical background?",
        shortRationale: null
      }),
      {
        action: "make_guess",
        question: null,
        guess: "Dr. Phil",
        shortRationale: null
      },
      createAnsweredState(21)
    );

    expect(replacement).toBeNull();
  });

  it("includes the transcript and proposed move in the verifier input", () => {
    const input = buildLateVerifierInput(createAnsweredState(18), {
      action: "make_guess",
      question: null,
      guess: "Drake",
      shortRationale: null
    });

    expect(input).toContain("<game_state>");
    expect(input).toContain("<proposed_move>");
    expect(input).toContain("Drake");
    expect(input).toContain("Remaining question slots");
  });
});

function candidate(name: string) {
  return {
    name,
    fit: "plausible",
    supportingEvidence: ["Fits the broad transcript."],
    noisyOrConflictingEvidence: [],
    separatingQuestion: null
  };
}

function createAnsweredState(
  questionCount: number,
  model: "gpt-chat-latest" | "gpt-5.4-mini" = "gpt-chat-latest"
) {
  const answers = Array.from({ length: questionCount }, (_, index) => ({
    question: `Is this test question ${index + 1}?`,
    answer: index % 3 === 0 ? "yes" : index % 3 === 1 ? "no" : "maybe"
  })) as ReturnType<typeof createSharedOpeningAnswerState>["transcript"];

  return {
    ...createSharedOpeningAnswerState("yes", "high", model),
    questionCount,
    transcript: answers,
    latestQuestion: null
  };
}
