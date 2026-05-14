import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedOpeningAnswerState } from "../game/opening";
import type { GameModel } from "../game/state";

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

  it("does not cap output tokens for structured moves", async () => {
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
    expect(request).not.toHaveProperty("reasoning");
    expect(request.text).toEqual(
      expect.objectContaining({
        format: expect.any(Object)
      })
    );
    expect(request.text).not.toEqual(
      expect.objectContaining({
        verbosity: expect.any(String)
      })
    );
    expect(request.store).toBe(true);
  });

  it("sends low reasoning controls for mini early turns", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-low-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they mainly known for entertainment?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createSharedOpeningAnswerState("yes", "low", "gpt-5.4-mini");

    const generated = await generateAiMove(state, "low-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.reasoningEffort).toBe("low");
    expect(request.reasoning).toEqual({ effort: "low" });
    expect(request.text).toEqual(
      expect.objectContaining({
        verbosity: "low",
        format: expect.any(Object)
      })
    );
  });

  it("uses the selected game model for normal model moves", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-model-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they mainly known for entertainment?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createSharedOpeningAnswerState("yes", "low", "gpt-chat-latest");

    const generated = await generateAiMove(state, "model-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-chat-latest");
    expect(request).toMatchObject({
      model: "gpt-chat-latest"
    });
    expect(request).not.toHaveProperty("reasoning");
    expect(request.text).toEqual(
      expect.objectContaining({
        format: expect.any(Object)
      })
    );
    expect(request.text).not.toEqual(
      expect.objectContaining({
        verbosity: expect.any(String)
      })
    );
  });

  it("sends medium reasoning controls for mini middle turns", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-medium-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Were they primarily known for science?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredState(9, "gpt-5.4-mini");

    const generated = await generateAiMove(state, "medium-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.reasoningEffort).toBe("medium");
    expect(request.reasoning).toEqual({ effort: "medium" });
  });

  it("sends the configured late-game reasoning controls for mini", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-high-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Were they connected to genetics?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredState(17, "gpt-5.4-mini");

    const generated = await generateAiMove(state, "high-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.reasoningEffort).toBe("high");
    expect(request.reasoning).toEqual({ effort: "high" });
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

  it("parses structured text from response output when output_text is unavailable", async () => {
    const outputText = JSON.stringify({
      action: "ask_question",
      question: "Were they mainly known outside the United States?",
      guess: null,
      shortRationale: null
    });
    const response = createResponse({
      id: "resp-output-content-test",
      outputText
    });
    delete (response as { output_text?: string }).output_text;
    createMock.mockResolvedValue(response);

    const { generateAiMove } = await import("./game-master");
    const generated = await generateAiMove(
      createSharedOpeningAnswerState("no"),
      "output-content-request"
    );

    expect(generated.move).toEqual({
      action: "ask_question",
      question: "Were they mainly known outside the United States?",
      guess: null,
      shortRationale: null
    });
  });

  it("prefers chat message content over reasoning text in fallback responses", async () => {
    const outputText = JSON.stringify({
      action: "ask_question",
      question: "Were they primarily associated with the Middle East or the Islamic world?",
      guess: null,
      shortRationale: "Split the narrowed public-notoriety cluster geographically."
    });
    const response = {
      ...createResponse({
        id: "resp-chat-fallback-test",
        outputText: "Let me analyze the transcript first..."
      }),
      output_text: undefined,
      choices: [
        {
          message: {
            content: outputText
          }
        }
      ]
    };
    createMock.mockResolvedValue(response);

    const { generateAiMove } = await import("./game-master");
    const generated = await generateAiMove(
      createSharedOpeningAnswerState("no"),
      "chat-fallback-request",
      2,
      "claude-4.6-opus"
    );

    expect(generated.move).toEqual({
      action: "ask_question",
      question: "Were they primarily associated with the Middle East or the Islamic world?",
      guess: null,
      shortRationale: "Split the narrowed public-notoriety cluster geographically."
    });
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

function createAnsweredState(questionCount: number, model: GameModel = "gpt-chat-latest") {
  return {
    ...createSharedOpeningAnswerState("yes", "high", model),
    questionCount,
    transcript: Array.from({ length: questionCount }, (_, index) => ({
      question: `Was clue ${index + 1} true?`,
      answer: index % 2 === 0 ? "yes" : "no"
    }))
  } as ReturnType<typeof createSharedOpeningAnswerState>;
}
