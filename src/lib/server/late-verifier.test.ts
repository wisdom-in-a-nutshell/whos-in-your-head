import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedOpeningAnswerState } from "@/lib/game/opening";
import type { GeneratedAiMove } from "./game-master";

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
    serviceTier: "priority"
  })
}));

describe("verifyLateAiMove", () => {
  beforeEach(() => {
    createMock.mockReset();
    delete process.env.LATE_VERIFIER_MODEL;
    delete process.env.LATE_VERIFIER_ENABLED;
  });

  it("can be explicitly disabled", async () => {
    process.env.LATE_VERIFIER_ENABLED = "false";
    const { verifyLateAiMove } = await import("./late-verifier");

    const result = await verifyLateAiMove(
      createAnsweredState(18),
      generatedGuess("Dr. Phil"),
      "disabled-request"
    );

    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns no override for early guesses", async () => {
    const { verifyLateAiMove } = await import("./late-verifier");

    const result = await verifyLateAiMove(
      createAnsweredState(15),
      generatedGuess("Dr. Phil"),
      "early-request"
    );

    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("uses structured output and GPT Chat Latest", async () => {
    createMock.mockResolvedValue(createResponse({
      outputText: JSON.stringify({
        candidates: [candidate("Dr. Phil")],
        verdict: "approve_guess",
        guess: null,
        question: null,
        shortRationale: null
      })
    }));

    const { verifyLateAiMove } = await import("./late-verifier");

    const result = await verifyLateAiMove(
      createAnsweredState(18),
      generatedGuess("Dr. Phil"),
      "configured-request"
    );
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(result).toBeNull();
    expect(request).toMatchObject({
      model: "gpt-chat-latest",
      instructions: expect.stringContaining("late-game verifier"),
      store: true,
      prompt_cache_key: "whos-in-your-head-late-verifier-v1"
    });
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request.text).toEqual(
      expect.objectContaining({
        format: expect.any(Object)
      })
    );
  });

  it("falls stale verifier model env back to GPT Chat Latest", async () => {
    process.env.LATE_VERIFIER_MODEL = "stale-model";
    createMock.mockResolvedValue(createResponse({
      outputText: JSON.stringify({
        candidates: [candidate("Dr. Phil")],
        verdict: "approve_guess",
        guess: null,
        question: null,
        shortRationale: null
      })
    }));

    const { verifyLateAiMove } = await import("./late-verifier");

    await verifyLateAiMove(
      createAnsweredState(18),
      generatedGuess("Dr. Phil"),
      "unsupported-config-request"
    );
    const request = createMock.mock.calls[0][0] as Record<string, unknown>;

    expect(request).toMatchObject({
      model: "gpt-chat-latest"
    });
  });

  it("can return a replacement question", async () => {
    createMock.mockResolvedValue(createResponse({
      outputText: JSON.stringify({
        candidates: [candidate("Dr. Phil"), candidate("Dr. Oz")],
        verdict: "ask_question",
        guess: null,
        question: "Does this person have a medical background?",
        shortRationale: "Separate the two likely doctors."
      })
    }));

    const { verifyLateAiMove } = await import("./late-verifier");

    const result = await verifyLateAiMove(
      createAnsweredState(20),
      generatedGuess("Dr. Phil"),
      "question-request"
    );

    expect(result).toMatchObject({
      requestedModel: "gpt-chat-latest",
      move: {
        action: "ask_question",
        question: "Does this person have a medical background?",
        guess: null
      },
      responseId: "resp-verifier"
    });
  });

  it("fails open on invalid verifier output", async () => {
    createMock.mockResolvedValue(createResponse({
      outputText: JSON.stringify({
        candidates: [],
        verdict: "ask_question",
        guess: "Dr. Oz",
        question: null,
        shortRationale: null
      })
    }));

    const { verifyLateAiMove } = await import("./late-verifier");

    await expect(
      verifyLateAiMove(createAnsweredState(18), generatedGuess("Dr. Phil"))
    ).resolves.toBeNull();
  });
});

function generatedGuess(guess: string): GeneratedAiMove {
  return {
    move: {
      action: "make_guess",
      question: null,
      guess,
      shortRationale: null
    },
    requestedModel: "gpt-chat-latest",
    actualModel: "gpt-chat-latest",
    reasoningEffort: "high",
    requestedServiceTier: "priority",
    actualServiceTier: "priority",
    promptCacheKey: "test",
    responseId: "resp-primary",
    usage: null,
    durationMs: 100
  };
}

function candidate(name: string) {
  return {
    name,
    fit: "plausible",
    supportingEvidence: ["Fits the broad transcript."],
    noisyOrConflictingEvidence: [],
    separatingQuestion: null
  };
}

function createResponse({ outputText }: { outputText: string }) {
  return {
    id: "resp-verifier",
    model: "gpt-chat-latest",
    status: "completed",
    output_text: outputText,
    output: [],
    usage: {
      input_tokens: 120,
      input_tokens_details: {
        cached_tokens: 80
      },
      output_tokens: 40,
      output_tokens_details: {
        reasoning_tokens: 10
      },
      total_tokens: 160
    },
    service_tier: "priority"
  };
}

function createAnsweredState(questionCount: number) {
  const answers = Array.from({ length: questionCount }, (_, index) => ({
    question: `Is this test question ${index + 1}?`,
    answer: index % 2 === 0 ? "yes" : "no"
  })) as ReturnType<typeof createSharedOpeningAnswerState>["transcript"];

  return {
    ...createSharedOpeningAnswerState("yes", "high", "gpt-chat-latest"),
    questionCount,
    transcript: answers,
    latestQuestion: null
  };
}
