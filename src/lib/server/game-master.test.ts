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
    model: "gpt-chat-latest",
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

  it("tracks low reasoning for early turns without sending request controls", async () => {
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
    const state = createSharedOpeningAnswerState("yes", "low", "gpt-chat-latest");

    const generated = await generateAiMove(state, "low-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.reasoningEffort).toBe("low");
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

  it("keeps gpt-chat-latest as the model after question 19", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-late-single-model-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they primarily known for work outside the United States?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredState(18, "gpt-chat-latest");

    const generated = await generateAiMove(state, "late-single-model-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-chat-latest");
    expect(request).toMatchObject({
      model: "gpt-chat-latest"
    });
  });

  it("keeps gpt-chat-latest on uncertain paths", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-uncertain-single-model-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they mainly known for one iconic work?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredStateWithAnswers(
      ["yes", "yes", "no", "maybe", "yes", "no", "maybe", "yes", "maybe"],
      "gpt-chat-latest"
    );

    const generated = await generateAiMove(state, "uncertain-single-model-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-chat-latest");
    expect(request).toMatchObject({
      model: "gpt-chat-latest"
    });
  });

  it("keeps gpt-chat-latest when branches look exhausted", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-exhausted-single-model-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Is their fame tied to one unusual public event?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredStateWithAnswers(
      ["yes", "no", "no", "no", "no", "no", "no", "no", "no", "yes"],
      "gpt-chat-latest"
    );

    const generated = await generateAiMove(state, "exhausted-single-model-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-chat-latest");
    expect(request).toMatchObject({
      model: "gpt-chat-latest"
    });
  });

  it("keeps clean gpt-chat-latest paths before question 19", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-clean-fast-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they primarily known outside the United States?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredStateWithAnswers(
      ["yes", "yes", "yes", "no", "yes", "no", "yes", "yes", "no", "yes"],
      "gpt-chat-latest"
    );

    const generated = await generateAiMove(state, "clean-fast-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-chat-latest");
    expect(request).toMatchObject({
      model: "gpt-chat-latest"
    });
  });

  it("continues a stored response chain during late-game turns when the model stays the same", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-late-switch-rebuild-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they primarily known for work outside the United States?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = {
      ...createAnsweredState(18, "gpt-chat-latest"),
      modelResponseId: "resp-chat-latest-chain",
      modelResponseModel: "gpt-chat-latest"
    };

    await generateAiMove(state, "late-switch-rebuild-request");

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).toMatchObject({
      model: "gpt-chat-latest",
      previous_response_id: "resp-chat-latest-chain"
    });
    expect(JSON.stringify(request.input)).not.toContain("<game_state>");
  });

  it("rebuilds from full state when the stored response chain model does not match", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-late-chain-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Were they primarily active before 2000?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = {
      ...createAnsweredState(18, "gpt-chat-latest"),
      modelResponseId: "resp-stale-chain",
      modelResponseModel: "stale-model"
    };

    await generateAiMove(state, "late-chain-request");

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).not.toHaveProperty("previous_response_id");
    expect(JSON.stringify(request.input)).toContain("<game_state>");
  });

  it("tracks medium reasoning for middle turns without sending request controls", async () => {
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
    const state = createAnsweredState(9, "gpt-chat-latest");

    const generated = await generateAiMove(state, "medium-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.reasoningEffort).toBe("medium");
    expect(request).not.toHaveProperty("reasoning");
  });

  it("tracks the configured late-game reasoning effort without sending request controls", async () => {
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
    const state = createAnsweredState(17, "gpt-chat-latest");

    const generated = await generateAiMove(state, "high-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.reasoningEffort).toBe("high");
    expect(request).not.toHaveProperty("reasoning");
  });

  it("bypasses LiteLLM response caching on every game-master call", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-cache-bypass-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Were they famous before 2010?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");

    await generateAiMove(createSharedOpeningAnswerState("no"), "cache-bypass-request");

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).toMatchObject({
      cache: {
        "no-cache": true,
        "no-store": true
      }
    });
    expect(JSON.stringify(request.input)).not.toContain("<retry_attempt>");
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

  it("normalizes stale stored model values while rebuilding from full state", async () => {
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
      model: "stale-model" as GameModel,
      modelResponseId: "resp-primary-filtered"
    };

    const generated = await generateAiMove(state, "fallback-request", 2);

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-chat-latest");
    expect(request).toMatchObject({
      model: "gpt-chat-latest",
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

  it("prefers chat message content over reasoning text in compatible responses", async () => {
    const outputText = JSON.stringify({
      action: "ask_question",
      question: "Were they primarily associated with the Middle East or the Islamic world?",
      guess: null,
      shortRationale: "Split the narrowed public-notoriety cluster geographically."
    });
    const response = {
      ...createResponse({
        id: "resp-chat-content-test",
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
      "chat-content-request",
      2
    );

    expect(generated.move).toEqual({
      action: "ask_question",
      question: "Were they primarily associated with the Middle East or the Islamic world?",
      guess: null,
      shortRationale: "Split the narrowed public-notoriety cluster geographically."
    });
  });

  it("trims an overlong private rationale instead of failing an otherwise valid move", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-long-rationale-test",
      outputText: JSON.stringify({
        action: "make_guess",
        question: null,
        guess: "Richard Ayoade",
        shortRationale: "x".repeat(260)
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const generated = await generateAiMove(
      createSharedOpeningAnswerState("yes"),
      "long-rationale-request"
    );

    expect(generated.move).toEqual({
      action: "make_guess",
      question: null,
      guess: "Richard Ayoade",
      shortRationale: "x".repeat(240)
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
    model: "gpt-chat-latest",
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

function createAnsweredStateWithAnswers(
  answers: Array<"yes" | "no" | "maybe">,
  model: GameModel = "gpt-chat-latest"
) {
  return {
    ...createSharedOpeningAnswerState(answers[0] ?? "yes", "high", model),
    questionCount: answers.length,
    transcript: answers.map((answer, index) => ({
      question: `Was clue ${index + 1} true?`,
      answer
    }))
  } as ReturnType<typeof createSharedOpeningAnswerState>;
}
