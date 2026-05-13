import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedOpeningAnswerState } from "../game/opening";

const parseMock = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("./logging", () => ({
  describeError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error)
  }),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn()
}));

vi.mock("./openai", () => ({
  getOpenAIRequestConfig: () => ({
    client: {
      responses: {
        parse: parseMock
      }
    },
    model: "gpt-5.5",
    reasoningEffort: "high",
    serviceTier: "priority"
  })
}));

describe("generateAiMove", () => {
  beforeEach(() => {
    parseMock.mockReset();
  });

  it("does not cap output tokens for high-reasoning structured moves", async () => {
    parseMock.mockResolvedValue({
      id: "resp-test",
      output_parsed: {
        action: "ask_question",
        question: "Are they mainly known for entertainment?",
        guess: null,
        shortRationale: null
      },
      service_tier: "priority",
      usage: null
    });

    const { generateAiMove } = await import("./game-master");

    await generateAiMove(createSharedOpeningAnswerState("yes"), "test-request");

    expect(parseMock).toHaveBeenCalledOnce();
    const request = parseMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).not.toHaveProperty("max_output_tokens");
    expect(request.reasoning).toEqual({ effort: "high" });
    expect(request.text).toEqual(
      expect.objectContaining({
        verbosity: "low",
        format: expect.any(Object)
      })
    );
    expect(request.store).toBe(true);
  });

  it("bypasses LiteLLM response caching only on retry attempts", async () => {
    parseMock.mockResolvedValue({
      id: "resp-retry-test",
      output_parsed: {
        action: "ask_question",
        question: "Were they famous before 2010?",
        guess: null,
        shortRationale: null
      },
      service_tier: "priority",
      usage: null
    });

    const { generateAiMove } = await import("./game-master");

    await generateAiMove(createSharedOpeningAnswerState("no"), "retry-request", 2);

    const request = parseMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).toMatchObject({
      cache: {
        "no-cache": true,
        "no-store": true
      }
    });
    expect(JSON.stringify(request.input)).toContain("<retry_attempt>2</retry_attempt>");
  });

  it("rebuilds from full state instead of continuing a stored response chain on retry", async () => {
    parseMock.mockResolvedValue({
      id: "resp-retry-chain-test",
      output_parsed: {
        action: "ask_question",
        question: "Were they famous before 2010?",
        guess: null,
        shortRationale: null
      },
      service_tier: "priority",
      usage: null
    });

    const { generateAiMove } = await import("./game-master");
    const state = {
      ...createSharedOpeningAnswerState("yes"),
      modelResponseId: "resp-poisoned"
    };

    await generateAiMove(state, "retry-chain-request", 2);

    const request = parseMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).not.toHaveProperty("previous_response_id");
    expect(JSON.stringify(request.input)).toContain("<game_state>");
  });
});
