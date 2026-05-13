import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getOpenAIRuntimeStatus } from "./openai";

const ORIGINAL_ENV = process.env;

describe("OpenAI runtime defaults", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LLM_REASONING_EFFORT;
    delete process.env.OPENAI_REASONING_EFFORT;
    delete process.env.LLM_REASONING_MIX;
    delete process.env.OPENAI_REASONING_MIX;
    delete process.env.LLM_FALLBACK_MODELS;
    delete process.env.OPENAI_FALLBACK_MODELS;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to high reasoning so local and production strategy match", () => {
    expect(getOpenAIRuntimeStatus().reasoningEffort).toBe("high");
  });

  it("reads a deduped fallback model chain without repeating the primary model", () => {
    process.env.LLM_MODEL = "gpt-5.5";
    process.env.LLM_FALLBACK_MODELS = "gpt-5.5, claude-4.6-opus, claude-4.6-opus";

    expect(getOpenAIRuntimeStatus().fallbackModels).toEqual(["claude-4.6-opus"]);
  });

  it("reports and samples a weighted reasoning mix", async () => {
    process.env.LLM_REASONING_MIX = "high:4, medium:1, low:1";
    const { selectGameReasoningEffort } = await import("./openai");

    expect(getOpenAIRuntimeStatus().reasoningMix).toEqual([
      { effort: "high", weight: 4 },
      { effort: "medium", weight: 1 },
      { effort: "low", weight: 1 }
    ]);
    expect(selectGameReasoningEffort(() => 0.1)).toBe("high");
    expect(selectGameReasoningEffort(() => 0.72)).toBe("medium");
    expect(selectGameReasoningEffort(() => 0.9)).toBe("low");
  });
});
