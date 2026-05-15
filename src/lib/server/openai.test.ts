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

  it("reads only supported GPT fallback models without repeating the primary model", () => {
    process.env.LLM_MODEL = "gpt-chat-latest";
    process.env.LLM_FALLBACK_MODELS =
      "gpt-chat-latest, gpt-5.5, claude-sonnet-4-6, gemini-3.1-flash-lite, gpt-5.4-mini, gpt-5.4-mini";

    expect(getOpenAIRuntimeStatus().fallbackModels).toEqual(["gpt-5.4-mini"]);
  });

  it("falls unsupported primary model env back to GPT Chat Latest", () => {
    process.env.LLM_MODEL = "gpt-5.5";

    expect(getOpenAIRuntimeStatus().model).toBe("gpt-chat-latest");
  });

  it("does not expose retired random reasoning mix state", () => {
    const status = getOpenAIRuntimeStatus();

    expect(status.reasoningEffort).toBe("high");
    expect("reasoningMix" in status).toBe(false);
  });
});
