import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getOpenAIClient, getOpenAIRuntimeStatus } from "./openai";

const ORIGINAL_ENV = process.env;

describe("OpenAI runtime defaults", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LLM_REASONING_EFFORT;
    delete process.env.OPENAI_REASONING_EFFORT;
    delete process.env.LLM_FALLBACK_MODELS;
    delete process.env.OPENAI_FALLBACK_MODELS;
    delete process.env.LLM_REQUEST_TIMEOUT_MS;
    delete process.env.OPENAI_REQUEST_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to high reasoning so local and production strategy match", () => {
    expect(getOpenAIRuntimeStatus().reasoningEffort).toBe("high");
  });

  it("does not expose fallback model configuration", () => {
    process.env.LLM_MODEL = "gpt-chat-latest";
    process.env.LLM_FALLBACK_MODELS = "gpt-chat-latest, stale-model";

    expect("fallbackModels" in getOpenAIRuntimeStatus()).toBe(false);
  });

  it("falls unsupported primary model env back to GPT Chat Latest", () => {
    process.env.LLM_MODEL = "stale-model";

    expect(getOpenAIRuntimeStatus().model).toBe("gpt-chat-latest");
  });

  it("does not expose retired random reasoning mix state", () => {
    const status = getOpenAIRuntimeStatus();

    expect(status.reasoningEffort).toBe("high");
    expect("reasoningMix" in status).toBe(false);
  });

  it("caps request timeout and uses route-level retries instead of SDK retries", () => {
    process.env.LLM_API_KEY = "test-key";

    const status = getOpenAIRuntimeStatus();
    const client = getOpenAIClient();

    expect(status.requestTimeoutMs).toBe(20000);
    expect(status.maxRetries).toBe(0);
    expect(client.timeout).toBe(20000);
    expect(client.maxRetries).toBe(0);
  });

  it("accepts a bounded request timeout override", () => {
    process.env.LLM_REQUEST_TIMEOUT_MS = "15000";

    expect(getOpenAIRuntimeStatus().requestTimeoutMs).toBe(15000);
  });

  it("rejects unsafe request timeout overrides", () => {
    process.env.LLM_REQUEST_TIMEOUT_MS = "120000";

    expect(getOpenAIRuntimeStatus().configurationError).toContain(
      "must be an integer between 5000 and 60000"
    );
  });
});
