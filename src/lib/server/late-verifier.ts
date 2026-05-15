import "server-only";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseUsage
} from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import {
  buildLateVerifierInput,
  lateVerificationSchema,
  lateVerificationToMove,
  LATE_VERIFIER_FORMAT_NAME,
  LATE_VERIFIER_INSTRUCTIONS,
  shouldRunLateVerifier
} from "@/lib/game/late-verifier";
import type { GameState } from "@/lib/game/state";
import { describeError, logError, logInfo, logWarn } from "./logging";
import { getOpenAIRequestConfig } from "./openai";
import type { GeneratedAiMove, GameMasterUsage } from "./game-master";

const DEFAULT_LATE_VERIFIER_MODEL = "gpt-chat-latest";
const PROMPT_CACHE_KEY = "whos-in-your-head-late-verifier-v1";

type LiteLLMCacheControls = {
  cache?: {
    "no-cache"?: boolean;
    "no-store"?: boolean;
  };
};

type LateVerifierRequest = ResponseCreateParamsNonStreaming & LiteLLMCacheControls;

export async function verifyLateAiMove(
  state: GameState,
  proposed: GeneratedAiMove,
  requestId?: string
): Promise<GeneratedAiMove | null> {
  if (!isLateVerifierEnabled() || !shouldRunLateVerifier(state, proposed.move)) {
    return null;
  }

  const model = readLateVerifierModel();
  const { client, serviceTier } = getOpenAIRequestConfig("high");
  const startedAt = Date.now();

  logInfo("late_verifier_request_started", {
    requestId,
    gameId: state.gameId,
    questionCount: state.questionCount,
    proposedGuess: proposed.move.guess,
    verifierModel: model,
    proposedModel: proposed.requestedModel
  });

  const request: LateVerifierRequest = {
    model,
    instructions: LATE_VERIFIER_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: buildLateVerifierInput(state, proposed.move)
      }
    ],
    text: {
      format: zodTextFormat(lateVerificationSchema, LATE_VERIFIER_FORMAT_NAME, {
        description:
          "Late-game verification of a proposed final guess, with optional replacement question or guess."
      })
    },
    service_tier: serviceTier,
    prompt_cache_key: PROMPT_CACHE_KEY,
    prompt_cache_retention: "24h",
    store: true,
    cache: {
      "no-cache": true,
      "no-store": true
    }
  };

  try {
    const response = await client.responses.create(request);
    const verification = parseLateVerification(response);
    const move = lateVerificationToMove(verification, proposed.move, state);

    logInfo("late_verifier_request_succeeded", {
      requestId,
      gameId: state.gameId,
      questionCount: state.questionCount,
      verifierModel: model,
      responseId: response.id,
      verdict: verification.verdict,
      candidateCount: verification.candidates.length,
      proposedGuess: proposed.move.guess,
      replacementGuess: move?.guess ?? null,
      replacementQuestion: move?.question ?? null,
      durationMs: Date.now() - startedAt,
      usage: summarizeResponseUsage(normalizeOpenAIUsage(response.usage ?? null))
    });

    if (move === null) {
      return null;
    }

    return {
      move,
      requestedModel: model,
      actualModel: response.model ?? null,
      reasoningEffort: "high",
      requestedServiceTier: serviceTier,
      actualServiceTier: response.service_tier ?? null,
      promptCacheKey: PROMPT_CACHE_KEY,
      responseId: response.id ?? null,
      usage: normalizeOpenAIUsage(response.usage ?? null),
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    logWarn("late_verifier_request_failed_open", {
      requestId,
      gameId: state.gameId,
      questionCount: state.questionCount,
      verifierModel: model,
      proposedGuess: proposed.move.guess,
      durationMs: Date.now() - startedAt,
      error: describeError(error)
    });
    return null;
  }
}

function isLateVerifierEnabled() {
  return process.env.LATE_VERIFIER_ENABLED?.trim().toLowerCase() === "true";
}

function readLateVerifierModel() {
  const model = process.env.LATE_VERIFIER_MODEL?.trim();

  if (model === "gpt-chat-latest" || model === "gpt-5.4-mini") {
    return model;
  }

  return DEFAULT_LATE_VERIFIER_MODEL;
}

function parseLateVerification(response: Response) {
  const outputText = extractResponseOutputText(response).trim();

  if (
    response.status === "incomplete" ||
    response.status === "failed" ||
    response.status === "cancelled"
  ) {
    logError("late_verifier_incomplete", {
      responseId: response.id,
      responseModel: response.model,
      status: response.status,
      incompleteDetails: response.incomplete_details ?? null,
      outputPreview: previewOutput(outputText)
    });
    throw new Error("Late verifier did not complete.");
  }

  if (!outputText) {
    throw new Error("Late verifier returned no output.");
  }

  return lateVerificationSchema.parse(JSON.parse(outputText));
}

function extractResponseOutputText(response: Response) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const outputItems = (response.output ?? []) as Array<{
    content?: Array<{ text?: unknown }>;
  }>;

  return outputItems
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((content) => {
      if (
        typeof content === "object" &&
        content !== null &&
        "text" in content &&
        typeof content.text === "string"
      ) {
        return content.text;
      }

      return "";
    })
    .join("");
}

function normalizeOpenAIUsage(usage: ResponseUsage | null): GameMasterUsage | null {
  if (!usage) {
    return null;
  }

  return {
    input_tokens: usage.input_tokens ?? 0,
    input_tokens_details: {
      cached_tokens: usage.input_tokens_details?.cached_tokens ?? 0
    },
    output_tokens: usage.output_tokens ?? 0,
    output_tokens_details: {
      reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? 0
    },
    total_tokens: usage.total_tokens ?? 0
  };
}

function summarizeResponseUsage(usage: GameMasterUsage | null) {
  if (!usage) {
    return null;
  }

  return {
    inputTokens: usage.input_tokens,
    cachedTokens: usage.input_tokens_details.cached_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    totalTokens: usage.total_tokens
  };
}

function previewOutput(text: string) {
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}
