import { describe, expect, it } from "vitest";
import { aiMoveSchema, playerAnswerSchema } from "./ai-move";

describe("playerAnswerSchema", () => {
  it("accepts the app-owned answer controls", () => {
    expect(playerAnswerSchema.parse("yes")).toBe("yes");
    expect(playerAnswerSchema.parse("no")).toBe("no");
    expect(playerAnswerSchema.parse("maybe")).toBe("maybe");
  });
});

describe("aiMoveSchema", () => {
  it("accepts a question move", () => {
    expect(
      aiMoveSchema.parse({
        action: "ask_question",
        question: "Are they alive?",
        guess: null
      })
    ).toEqual({
      action: "ask_question",
      question: "Are they alive?",
      guess: null
    });
  });

  it("accepts a guess move", () => {
    expect(
      aiMoveSchema.parse({
        action: "make_guess",
        question: null,
        guess: "Taylor Swift"
      })
    ).toEqual({
      action: "make_guess",
      question: null,
      guess: "Taylor Swift"
    });
  });
});
