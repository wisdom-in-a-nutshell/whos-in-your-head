import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedOpeningAnswerState } from "../game/opening";
import type { GameModel } from "../game/state";

const createMock = vi.fn();
const claudeParseMock = vi.fn();

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
  getOpenAIRuntimeStatus: () => ({
    configured: true,
    baseUrlConfigured: true,
    model: "gpt-5.5",
    fallbackModels: [],
    reasoningEffort: "high",
    serviceTier: "priority",
    configurationError: null
  }),
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

vi.mock("./anthropic", () => ({
  getAnthropicRequestConfig: (model: string) => ({
    client: {
      messages: {
        parse: claudeParseMock
      }
    },
    model,
    serviceTier: "auto"
  })
}));

describe("generateAiMove", () => {
  beforeEach(() => {
    createMock.mockReset();
    claudeParseMock.mockReset();
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
    const state = createSharedOpeningAnswerState("yes", "low", "gpt-5.4-mini");

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

  it("upgrades gpt-chat-latest games to gpt-5.5 from question 13 onward", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-late-upgrade-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they primarily known for work outside the United States?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredState(12, "gpt-chat-latest");

    const generated = await generateAiMove(state, "late-upgrade-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-5.5");
    expect(request).toMatchObject({
      model: "gpt-5.5"
    });
  });

  it("upgrades gpt-chat-latest early when the path has repeated uncertainty", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-uncertain-upgrade-test",
      outputText: JSON.stringify({
        action: "ask_question",
        question: "Are they mainly known for one iconic work?",
        guess: null,
        shortRationale: null
      })
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createAnsweredStateWithAnswers(
      ["yes", "yes", "no", "maybe", "yes", "no", "maybe", "yes"],
      "gpt-chat-latest"
    );

    const generated = await generateAiMove(state, "uncertain-upgrade-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-5.5");
    expect(request).toMatchObject({
      model: "gpt-5.5"
    });
  });

  it("upgrades gpt-chat-latest early when broad branches look exhausted", async () => {
    createMock.mockResolvedValue(createResponse({
      id: "resp-exhausted-upgrade-test",
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

    const generated = await generateAiMove(state, "exhausted-upgrade-request");
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-5.5");
    expect(request).toMatchObject({
      model: "gpt-5.5"
    });
  });

  it("keeps clean gpt-chat-latest paths on the fast model before question 13", async () => {
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

  it("does not continue a stored response chain across the late-game model switch", async () => {
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
      ...createAnsweredState(12, "gpt-chat-latest"),
      modelResponseId: "resp-chat-latest-chain",
      modelResponseModel: "gpt-chat-latest"
    };

    await generateAiMove(state, "late-switch-rebuild-request");

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).not.toHaveProperty("previous_response_id");
    expect(JSON.stringify(request.input)).toContain("<game_state>");
  });

  it("continues the stored response chain after the late-game model matches", async () => {
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
      ...createAnsweredState(13, "gpt-chat-latest"),
      modelResponseId: "resp-gpt-55-chain",
      modelResponseModel: "gpt-5.5"
    };

    await generateAiMove(state, "late-chain-request");

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).toMatchObject({
      model: "gpt-5.5",
      previous_response_id: "resp-gpt-55-chain"
    });
    expect(JSON.stringify(request.input)).not.toContain("<game_state>");
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
    const state = createAnsweredState(9, "gpt-5.4-mini");

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
    const state = createAnsweredState(17, "gpt-5.4-mini");

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
      "gpt-5.4-mini"
    );

    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("gpt-5.4-mini");
    expect(request).toMatchObject({
      model: "gpt-5.4-mini",
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
      "gpt-5.4-mini"
    );

    expect(generated.move).toEqual({
      action: "ask_question",
      question: "Were they primarily associated with the Middle East or the Islamic world?",
      guess: null,
      shortRationale: "Split the narrowed public-notoriety cluster geographically."
    });
  });

  it("uses Anthropic Messages natively for Claude-selected games", async () => {
    claudeParseMock.mockResolvedValue(createClaudeMessage({
      id: "msg-claude-native-test",
      model: "claude-sonnet-4-6",
      parsedOutput: {
        action: "ask_question",
        question: "Are they mainly known for entertainment?",
        guess: null,
        shortRationale: null
      }
    }));

    const { generateAiMove } = await import("./game-master");
    const state = createSharedOpeningAnswerState("yes", "high", "claude-sonnet-4-6");

    const generated = await generateAiMove(state, "claude-native-request");
    const request = claudeParseMock.mock.calls[0][0] as Record<string, unknown>;

    expect(createMock).not.toHaveBeenCalled();
    expect(generated.requestedModel).toBe("claude-sonnet-4-6");
    expect(generated.responseId).toBe("msg-claude-native-test");
    expect(request).toMatchObject({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        expect.objectContaining({
          role: "user"
        })
      ],
      thinking: {
        type: "adaptive"
      },
      service_tier: "auto"
    });
    expect(JSON.stringify(request.system)).toContain("cache_control");
    expect(JSON.stringify(request.output_config)).toContain("json_schema");
  });

  it("maps old Claude aliases to the supported native Claude model id", async () => {
    claudeParseMock.mockResolvedValue(createClaudeMessage({
      id: "msg-claude-alias-test",
      model: "claude-sonnet-4-6",
      parsedOutput: {
        action: "ask_question",
        question: "Were they primarily active before 2000?",
        guess: null,
        shortRationale: null
      }
    }));

    const { generateAiMove } = await import("./game-master");
    const generated = await generateAiMove(
      createSharedOpeningAnswerState("no"),
      "claude-alias-request",
      2,
      "claude-4.6-opus"
    );
    const request = claudeParseMock.mock.calls[0][0] as Record<string, unknown>;

    expect(generated.requestedModel).toBe("claude-sonnet-4-6");
    expect(request).toMatchObject({
      model: "claude-sonnet-4-6"
    });
    expect(request).not.toHaveProperty("previous_response_id");
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
    model: "gpt-5.5",
    service_tier: "priority",
    incomplete_details: null,
    error: null,
    usage: null
  };
}

function createClaudeMessage({
  id,
  model,
  parsedOutput
}: {
  id: string;
  model: string;
  parsedOutput: unknown;
}) {
  return {
    id,
    type: "message",
    role: "assistant",
    model,
    content: [
      {
        type: "text",
        text: JSON.stringify(parsedOutput),
        parsed_output: parsedOutput
      }
    ],
    parsed_output: parsedOutput,
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    usage: {
      input_tokens: 100,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 80,
      output_tokens: 30,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: "standard"
    }
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
