import { describe, expect, it } from "vitest";
import { selectTurnReasoningEffort } from "./reasoning";

describe("turn reasoning schedule", () => {
  it("respects deliberately cheap game profiles", () => {
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "minimal",
        questionCount: 12
      })
    ).toBe("minimal");
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "low",
        questionCount: 18
      })
    ).toBe("low");
  });

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
        questionCount: 16
      })
    ).toBe("medium");
  });

  it("uses the configured late-game effort after question sixteen", () => {
    expect(
      selectTurnReasoningEffort({
        lateGameReasoningEffort: "high",
        questionCount: 17
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
