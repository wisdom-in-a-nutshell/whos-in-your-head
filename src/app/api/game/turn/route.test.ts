import { describe, expect, it, vi } from "vitest";
import { applyAiMove, createInitialGameState } from "@/lib/game/state";
import { OPENING_MOVE } from "@/lib/game/opening";

vi.mock("server-only", () => ({}));

import { buildAnswerTurnReplayKey, shouldTryContentFilterFallback } from "./route";

describe("game turn retry policy", () => {
  it("retries the primary model before trying content-filter fallbacks", () => {
    expect(shouldTryContentFilterFallback(1, 2)).toBe(false);
    expect(shouldTryContentFilterFallback(2, 2)).toBe(true);
  });
});

describe("answer turn replay keys", () => {
  it("matches duplicate submissions for the same state and answer", () => {
    const state = applyAiMove(createInitialGameState(), OPENING_MOVE);

    expect(buildAnswerTurnReplayKey(state, "yes")).toBe(
      buildAnswerTurnReplayKey(state, "yes")
    );
  });

  it("separates different answers for the same state", () => {
    const state = applyAiMove(createInitialGameState(), OPENING_MOVE);

    expect(buildAnswerTurnReplayKey(state, "yes")).not.toBe(
      buildAnswerTurnReplayKey(state, "no")
    );
  });

  it("separates stale and advanced states", () => {
    const state = applyAiMove(createInitialGameState(), OPENING_MOVE);
    const advancedState = {
      ...state,
      transcript: [
        {
          question: state.latestQuestion ?? "Is this person alive?",
          answer: "yes" as const
        }
      ],
      latestQuestion: null
    };

    expect(buildAnswerTurnReplayKey(state, "yes")).not.toBe(
      buildAnswerTurnReplayKey(advancedState, "yes")
    );
  });
});
