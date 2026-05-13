import { describe, expect, it } from "vitest";
import { selectTurnReasoningEffort } from "./reasoning";

describe("turn reasoning schedule", () => {
  it("uses low reasoning for the first eight answered-question states", () => {
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "high",
        questionCount: 1
      })
    ).toBe("low");
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "high",
        questionCount: 8
      })
    ).toBe("low");
  });

  it("uses medium reasoning for the middle narrowing turns", () => {
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "high",
        questionCount: 9
      })
    ).toBe("medium");
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "high",
        questionCount: 13
      })
    ).toBe("medium");
  });

  it("uses the configured late-game effort after question thirteen", () => {
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "high",
        questionCount: 14
      })
    ).toBe("high");
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "xhigh",
        questionCount: 18
      })
    ).toBe("xhigh");
  });
});
