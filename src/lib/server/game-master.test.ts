import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedOpeningAnswerState } from "../game/opening";

const createMock = vi.fn();

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
        create: createMock
      }
    },
    model: "gpt-5.5",
    reasoningEffort: "high",
    serviceTier: "priority"
  })
}));

describe("generateAiMove", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("does not cap output tokens for high-reasoning structured moves", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they mainly known for entertainment?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");

    await generateAiMove(createSharedOpeningAnswerState("yes"), "test-request");

    expect(createMock).toHaveBeenCalledOnce();
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

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
    createMock.mockResolvedValue(createResponse({
      id: "resp-retry-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Were they famous before 2010?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");

    await generateAiMove(createSharedOpeningAnswerState("no"), "retry-request", 2);

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).toMatchObject({
      cache: {
        "no-cache": true,
        "no-store": true
      }
    });
    expect(JSON.stringify(request.input)).toContain("<retry_attempt>2</retry_attempt>");
  });

  it("rebuilds from full state instead of continuing a stored response chain on retry", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-retry-chain-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Were they famous before 2010?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = {
      ...createSharedOpeningAnswerState("yes"),
      modelResponseId: "resp-poisoned"
    };

    await generateAiMove(state, "retry-chain-request", 2);

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).not.toHaveProperty("previous_response_id");
    expect(JSON.stringify(request.input)).toContain("<game_state>");
  });

  it("throws a typed error for incomplete content-filter responses", async () => {
    createMock.mockResolvedValue({
      ...createResponse({
        id: "resp-content-filter-test",
        outputText: "I'm sorry, but I cannot assist with that request."
      }),
      status: "incomplete",
      incomplete_details: {
        reason: "content_filter"
      }
    });

    const {
      generateAiMove,
      isContentFilterIncompleteResponseError
    } = await import("./game-master");

    await expect(
      generateAiMove(createSharedOpeningAnswerState("no"), "content-filter-request")
    ).rejects.toSatisfy(isContentFilterIncompleteResponseError);
  });

  it("can request a configured fallback model while rebuilding from full state", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-fallback-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Were they mainly known outside the United States?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = {
      ...createSharedOpeningAnswerState("no"),
      modelResponseId: "resp-primary-filtered"
    };

    const generated = await generateAiMove(
      state,
      "fallback-request",
      2,
      "claude-4.6-opus"
    );

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("claude-4.6-opus");
    expect(request).toMatchObject({
      model: "claude-4.6-opus",
      cache: {
        "no-cache": true,
        "no-store": true
      }
    });
    expect(request).not.toHaveProperty("previous_response_id");
    expect(JSON.stringify(request.input)).toContain("<game_state>");
  });
});

function createResponse({ id, outputText }: { id: string; outputText: string }) {
  return {
    id,
    output_text: outputText,
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: outputText
          }
        ]
      }
    ],
    status: "completed",
    model: "gpt-5.5",
    service_tier: "priority",
    incomplete_details: null,
    error: null,
    usage: null
  };
}
