import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getOpenAIRuntimeStatus } from "./openai";

const ORIGINAL_ENV = process.env;

describe("OpenAI runtime defaults", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LLM_REASONING_EFFORT;
    delete process.env.OPENAI_REASONING_EFFORT;
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
});
