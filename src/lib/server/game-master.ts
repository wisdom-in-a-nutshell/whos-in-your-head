import "server-only";
import type { Message, Usage as AnthropicUsage } from "@anthropic-ai/sdk/resources/messages/messages";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseUsage
} from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import { aiMoveSchema, type AiMove, type PlayerAnswer } from "@/lib/game/ai-move";
import { createSharedOpeningAnswerState } from "@/lib/game/opening";
import {
  buildGameMasterContinuationInput,
  buildGameMasterInput,
  buildGameMasterStateInput,
  GAME_MASTER_INSTRUCTIONS
} from "@/lib/game/prompt";
import {
  selectTurnReasoningEffort,
  type GameReasoningEffort
} from "@/lib/game/reasoning";
import { DEFAULT_GAME_MODEL, type GameModel, type GameState } from "@/lib/game/state";
import { getAnthropicRequestConfig } from "./anthropic";
import { describeError, logError, logInfo, logWarn } from "./logging";
import { getOpenAIRequestConfig, getOpenAIRuntimeStatus } from "./openai";

const AI_MOVE_FORMAT_NAME = "who_in_your_head_ai_move";
const PROMPT_CACHE_KEY = "whos-in-your-head-game-master-v1";
const GAME_MASTER_REQUEST_INSTRUCTIONS =
  "Follow the static game-master instructions in the input. Return only the structured move.";
const OPENING_WARMUP_ANSWERS: PlayerAnswer[] = ["yes", "no"];
const OUTPUT_PREVIEW_CHARACTERS = 220;
const DISABLE_LITELLM_RESPONSE_CACHE = true;
const LATE_GAME_UPGRADE_START_AFTER_QUESTIONS = 18;
const LATE_GAME_UPGRADE_MODEL = "gpt-5.5";
const EARLY_UPGRADE_MIN_QUESTIONS_FOR_UNCERTAINTY = 8;
const EARLY_UPGRADE_MAYBE_COUNT = 3;
const EARLY_UPGRADE_RECENT_ANSWER_WINDOW = 6;
const EARLY_UPGRADE_RECENT_MAYBE_COUNT = 2;
const CLAUDE_MAX_OUTPUT_TOKENS = 8192;
const CLAUDE_PROMPT_CACHE_TTL = "5m";

const CLAUDE_MODEL_ALIASES = new Map<string, string>([
  ["claude-opus-4-6", "claude-sonnet-4-6"],
  ["claude-4.6-opus", "claude-sonnet-4-6"],
  ["claude-4.6-sonnet", "claude-sonnet-4-6"]
]);

const openingWarmups = new Map<string, Promise<GeneratedAiMove>>();
const warmedOpenings = new Map<string, GeneratedAiMove>();

export type GeneratedAiMove = {
  move: AiMove;
  requestedModel: string;
  actualModel: string | null;
  reasoningEffort: GameReasoningEffort;
  requestedServiceTier: string;
  actualServiceTier: string | null;
  promptCacheKey: string | null;
  responseId: string | null;
  usage: GameMasterUsage | null;
  durationMs: number;
};

export type GameMasterUsage = {
  input_tokens: number;
  input_tokens_details: {
    cached_tokens: number;
  };
  output_tokens: number;
  output_tokens_details: {
    reasoning_tokens: number;
  };
  total_tokens: number;
};

type LiteLLMCacheControls = {
  cache?: {
    "no-cache"?: boolean;
    "no-store"?: boolean;
  };
};

type LiteLLMReasoningControls = {
  reasoning_effort?: "medium" | "high";
};

type GameMasterResponseRequest = ResponseCreateParamsNonStreaming &
  LiteLLMCacheControls &
  LiteLLMReasoningControls;

export class ContentFilterIncompleteResponseError extends Error {
  constructor(
    readonly responseId: string | null,
    readonly model: string | null
  ) {
    super("OpenAI returned an incomplete content-filtered game-master response.");
    this.name = "ContentFilterIncompleteResponseError";
  }
}

export function isContentFilterIncompleteResponseError(
  error: unknown
): error is ContentFilterIncompleteResponseError {
  return error instanceof ContentFilterIncompleteResponseError;
}

export function warmOpeningMoveResponses() {
  warmOpeningMoveResponsesForReasoning("high", DEFAULT_GAME_MODEL);
}

export function warmOpeningMoveResponsesForReasoning(
  reasoningEffort: GameReasoningEffort,
  model: GameModel
) {
  for (const answer of OPENING_WARMUP_ANSWERS) {
    warmOpeningMoveResponse(answer, reasoningEffort, model);
  }
}

export function readWarmedOpeningMove(
  answer: PlayerAnswer,
  reasoningEffort: GameReasoningEffort,
  model: GameModel
): GeneratedAiMove | null {
  return warmedOpenings.get(warmupKey(answer, reasoningEffort, model)) ?? null;
}

export async function generateAiMove(
  state: GameState,
  requestId?: string,
  retryAttempt = 1,
  modelOverride?: string
): Promise<GeneratedAiMove> {
  const configuredModel = getOpenAIRuntimeStatus().model;
  const { model, escalationReason } = selectGameMasterModel(
    state,
    configuredModel,
    modelOverride
  );

  if (isClaudeModel(model)) {
    return generateClaudeAiMove(state, requestId, retryAttempt, model, escalationReason);
  }

  return generateOpenAIAiMove(state, requestId, retryAttempt, model, escalationReason);
}

async function generateOpenAIAiMove(
  state: GameState,
  requestId: string | undefined,
  retryAttempt: number,
  model: string,
  escalationReason: string | null
): Promise<GeneratedAiMove> {
  const reasoningEffort = selectOpenAICompatibleReasoningEffort(model, state);
  const {
    client,
    model: configuredModel,
    serviceTier
  } = getOpenAIRequestConfig(reasoningEffort);

  const rebuildFromFullState = retryAttempt > 1;
  const responseChainModelMatches = state.modelResponseModel === model;
  const usesPreviousResponse =
    state.modelResponseId !== null && !rebuildFromFullState && responseChainModelMatches;
  const startedAt = Date.now();

  logInfo("game_master_request_started", {
    requestId,
    gameId: state.gameId,
    questionCount: state.questionCount,
    transcriptLength: state.transcript.length,
    model,
    configuredModel,
    escalationReason,
    storedResponseModel: state.modelResponseModel,
    responseChainModelMatches,
    modelOverride: null,
    gameReasoningEffort: state.reasoningEffort,
    reasoningEffort,
    requestedServiceTier: serviceTier,
    promptCacheKey: PROMPT_CACHE_KEY,
    retryAttempt,
    disableLiteLLMResponseCache: DISABLE_LITELLM_RESPONSE_CACHE,
    rebuildFromFullState,
    usesPreviousResponse,
    hasModelResponseId: state.modelResponseId !== null,
    latestAnswer: state.transcript.at(-1)?.answer ?? null
  });

  const responseRequest: GameMasterResponseRequest = {
    model,
    instructions: GAME_MASTER_REQUEST_INSTRUCTIONS,
    ...(usesPreviousResponse
      ? { previous_response_id: state.modelResponseId ?? undefined }
      : {}),
    input: [
      {
        role: "user",
        content: usesPreviousResponse
          ? buildGameMasterContinuationInput(state, retryAttempt)
          : buildGameMasterInput(state, retryAttempt)
      }
    ],
    text: {
        format: zodTextFormat(aiMoveSchema, AI_MOVE_FORMAT_NAME, {
        description:
          "The next game-master move: either one yes/no-compatible question or one final famous-person guess."
      })
    },
    service_tier: serviceTier,
    ...(isGeminiModel(model)
      ? {
          reasoning_effort: toGeminiThinkingEffort(state)
        }
      : {}),
    prompt_cache_key: PROMPT_CACHE_KEY,
    prompt_cache_retention: "24h",
    store: true,
    ...(DISABLE_LITELLM_RESPONSE_CACHE
      ? {
          cache: {
            "no-cache": true,
            "no-store": true
          }
        }
      : {})
  };

  const response = await client.responses
    .create(responseRequest)
    .catch((error: unknown) => {
      logError("game_master_request_failed", {
        requestId,
        gameId: state.gameId,
        questionCount: state.questionCount,
        transcriptLength: state.transcript.length,
        model,
        configuredModel,
        escalationReason,
        storedResponseModel: state.modelResponseModel,
        responseChainModelMatches,
        modelOverride: null,
        gameReasoningEffort: state.reasoningEffort,
        reasoningEffort,
        requestedServiceTier: serviceTier,
        retryAttempt,
        disableLiteLLMResponseCache: DISABLE_LITELLM_RESPONSE_CACHE,
        rebuildFromFullState,
        usesPreviousResponse,
        durationMs: Date.now() - startedAt,
        error: describeError(error)
      });
      throw error;
    });

  const move = parseGameMasterMove(response, {
    requestId,
    gameId: state.gameId,
    durationMs: Date.now() - startedAt,
    retryAttempt,
    bypassResponseCache: DISABLE_LITELLM_RESPONSE_CACHE,
    rebuildFromFullState
  });

  logInfo("game_master_request_succeeded", {
    requestId,
    gameId: state.gameId,
    responseId: response.id,
    durationMs: Date.now() - startedAt,
    requestedModel: model,
    actualModel: response.model ?? null,
    escalationReason,
    storedResponseModel: state.modelResponseModel,
    responseChainModelMatches,
    reasoningEffort,
    actualServiceTier: response.service_tier ?? null,
    retryAttempt,
    disableLiteLLMResponseCache: DISABLE_LITELLM_RESPONSE_CACHE,
    rebuildFromFullState,
    moveAction: move.action,
    question: move.question,
    guess: move.guess,
    usage: summarizeResponseUsage(normalizeOpenAIUsage(response.usage ?? null))
  });

  return {
    move,
    requestedModel: model,
    actualModel: response.model ?? null,
    reasoningEffort,
    requestedServiceTier: serviceTier,
    actualServiceTier: response.service_tier ?? null,
    promptCacheKey: PROMPT_CACHE_KEY,
    responseId: response.id,
    usage: normalizeOpenAIUsage(response.usage ?? null),
    durationMs: Date.now() - startedAt
  };
}

async function generateClaudeAiMove(
  state: GameState,
  requestId: string | undefined,
  retryAttempt: number,
  model: string,
  escalationReason: string | null
): Promise<GeneratedAiMove> {
  const reasoningEffort = selectTurnReasoningEffort({
    lateGameReasoningEffort: state.reasoningEffort,
    questionCount: state.questionCount
  });
  const {
    client,
    model: configuredModel,
    serviceTier
  } = getAnthropicRequestConfig(model);
  const startedAt = Date.now();

  logInfo("game_master_claude_request_started", {
    requestId,
    gameId: state.gameId,
    questionCount: state.questionCount,
    transcriptLength: state.transcript.length,
    model,
    configuredModel,
    escalationReason,
    gameReasoningEffort: state.reasoningEffort,
    reasoningEffort,
    requestedServiceTier: serviceTier,
    retryAttempt,
    latestAnswer: state.transcript.at(-1)?.answer ?? null
  });

  const response = await client.messages
    .parse({
      model: configuredModel,
      max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
      system: [
        {
          type: "text",
          text: [
            GAME_MASTER_INSTRUCTIONS,
            "",
            GAME_MASTER_REQUEST_INSTRUCTIONS
          ].join("\n"),
          cache_control: {
            type: "ephemeral",
            ttl: CLAUDE_PROMPT_CACHE_TTL
          }
        }
      ],
      messages: [
        {
          role: "user",
          content: buildGameMasterStateInput(state, retryAttempt)
        }
      ],
      thinking: {
        type: "adaptive"
      },
      output_config: {
        effort: toClaudeEffort(reasoningEffort, configuredModel),
        format: zodOutputFormat(aiMoveSchema)
      },
      service_tier: serviceTier,
      metadata: {
        user_id: state.gameId
      }
    })
    .catch((error: unknown) => {
      logError("game_master_claude_request_failed", {
        requestId,
        gameId: state.gameId,
        questionCount: state.questionCount,
        transcriptLength: state.transcript.length,
        model,
        configuredModel,
        escalationReason,
        gameReasoningEffort: state.reasoningEffort,
        reasoningEffort,
        requestedServiceTier: serviceTier,
        retryAttempt,
        durationMs: Date.now() - startedAt,
        error: describeError(error)
      });
      throw error;
    });

  const move = parseClaudeGameMasterMove(response, {
    requestId,
    gameId: state.gameId,
    durationMs: Date.now() - startedAt,
    retryAttempt
  });

  logInfo("game_master_claude_request_succeeded", {
    requestId,
    gameId: state.gameId,
    responseId: response.id,
    durationMs: Date.now() - startedAt,
    requestedModel: model,
    actualModel: response.model ?? null,
    escalationReason,
    reasoningEffort,
    actualServiceTier: response.usage.service_tier ?? null,
    retryAttempt,
    stopReason: response.stop_reason,
    moveAction: move.action,
    question: move.question,
    guess: move.guess,
    usage: summarizeResponseUsage(normalizeAnthropicUsage(response.usage))
  });

  return {
    move,
    requestedModel: model,
    actualModel: response.model ?? null,
    reasoningEffort,
    requestedServiceTier: serviceTier,
    actualServiceTier: response.usage.service_tier ?? null,
    promptCacheKey: "anthropic-cache-control",
    responseId: response.id,
    usage: normalizeAnthropicUsage(response.usage),
    durationMs: Date.now() - startedAt
  };
}

function selectGameMasterModel(
  state: GameState,
  configuredModel: string,
  modelOverride?: string
) {
  if (modelOverride) {
    return {
      model: normalizeGameMasterModel(modelOverride),
      escalationReason: null
    };
  }

  const selectedModel = normalizeGameMasterModel(state.model ?? configuredModel);

  if (selectedModel !== "gpt-chat-latest") {
    return {
      model: selectedModel,
      escalationReason: null
    };
  }

  const escalationReason = getRecommendedProfileEscalationReason(state);

  if (escalationReason !== null) {
    return {
      model: LATE_GAME_UPGRADE_MODEL,
      escalationReason
    };
  }

  return {
    model: selectedModel,
    escalationReason: null
  };
}

function getRecommendedProfileEscalationReason(state: GameState): string | null {
  if (state.questionCount >= LATE_GAME_UPGRADE_START_AFTER_QUESTIONS) {
    return "late_game";
  }

  const answers = state.transcript.map((turn) => turn.answer);
  const maybeCount = answers.filter((answer) => answer === "maybe").length;
  const recentAnswers = answers.slice(-EARLY_UPGRADE_RECENT_ANSWER_WINDOW);
  const recentMaybeCount = recentAnswers.filter((answer) => answer === "maybe").length;
  const lastAnswer = recentAnswers.at(-1) ?? null;

  if (
    state.questionCount >= EARLY_UPGRADE_MIN_QUESTIONS_FOR_UNCERTAINTY &&
    maybeCount >= EARLY_UPGRADE_MAYBE_COUNT &&
    (recentMaybeCount >= EARLY_UPGRADE_RECENT_MAYBE_COUNT || lastAnswer === "maybe")
  ) {
    return "uncertain_path";
  }

  return null;
}

function parseGameMasterMove(
  response: Response,
  context: {
    requestId?: string;
    gameId: string;
    durationMs: number;
    retryAttempt: number;
    bypassResponseCache: boolean;
    rebuildFromFullState: boolean;
  }
): AiMove {
  const outputText = extractResponseOutputText(response).trim();
  const responseSummary = summarizeResponse(response);

  if (
    response.status === "incomplete" &&
    response.incomplete_details?.reason === "content_filter"
  ) {
    logError("game_master_content_filter_incomplete", {
      ...context,
      ...responseSummary,
      outputPreview: previewOutput(outputText)
    });
    throw new ContentFilterIncompleteResponseError(response.id ?? null, response.model ?? null);
  }

  if (!outputText) {
    logError("game_master_parse_empty", {
      ...context,
      ...responseSummary
    });
    throw new Error("OpenAI returned no parsed game-master move.");
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(outputText);
  } catch (error) {
    logError("game_master_parse_invalid_json", {
      ...context,
      ...responseSummary,
      outputPreview: previewOutput(outputText),
      error: describeError(error)
    });
    throw error;
  }

  parsedJson = trimPrivateRationale(parsedJson);
  const parsedMove = aiMoveSchema.safeParse(parsedJson);

  if (!parsedMove.success) {
    logError("game_master_parse_invalid_schema", {
      ...context,
      ...responseSummary,
      outputPreview: previewOutput(outputText),
      issues: parsedMove.error.flatten()
    });
    throw new Error("OpenAI returned a game-master move that did not match the schema.");
  }

  return parsedMove.data;
}

function parseClaudeGameMasterMove(
  response: Message & { parsed_output?: AiMove | null },
  context: {
    requestId?: string;
    gameId: string;
    durationMs: number;
    retryAttempt: number;
  }
): AiMove {
  if (response.stop_reason === "refusal") {
    logError("game_master_claude_refusal", {
      ...context,
      responseId: response.id,
      responseModel: response.model,
      stopDetails: response.stop_details ?? null,
      outputPreview: previewOutput(extractClaudeOutputText(response)),
      usage: summarizeResponseUsage(normalizeAnthropicUsage(response.usage))
    });
    throw new Error("Claude refused to produce a game-master move.");
  }

  if (response.stop_reason === "max_tokens") {
    logError("game_master_claude_max_tokens", {
      ...context,
      responseId: response.id,
      responseModel: response.model,
      outputPreview: previewOutput(extractClaudeOutputText(response)),
      usage: summarizeResponseUsage(normalizeAnthropicUsage(response.usage))
    });
    throw new Error("Claude stopped before finishing a game-master move.");
  }

  const parsed = response.parsed_output ?? null;

  if (!parsed) {
    logError("game_master_claude_parse_empty", {
      ...context,
      responseId: response.id,
      responseModel: response.model,
      stopReason: response.stop_reason,
      outputPreview: previewOutput(extractClaudeOutputText(response)),
      usage: summarizeResponseUsage(normalizeAnthropicUsage(response.usage))
    });
    throw new Error("Claude returned no parsed game-master move.");
  }

  return aiMoveSchema.parse(trimPrivateRationale(parsed));
}

function trimPrivateRationale(value: unknown) {
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.shortRationale !== "string" ||
    record.shortRationale.length <= 240
  ) {
    return value;
  }

  return {
    ...record,
    shortRationale: record.shortRationale.slice(0, 240)
  };
}

function isClaudeModel(model: string) {
  return normalizeGameMasterModel(model).startsWith("claude-");
}

function isGeminiModel(model: string) {
  return normalizeGameMasterModel(model).startsWith("gemini-");
}

function normalizeGameMasterModel(model: string) {
  return CLAUDE_MODEL_ALIASES.get(model) ?? model;
}

function selectOpenAICompatibleReasoningEffort(model: string, state: GameState) {
  if (isGeminiModel(model)) {
    return selectGeminiThinkingEffort(state);
  }

  return selectTurnReasoningEffort({
    lateGameReasoningEffort: state.reasoningEffort,
    questionCount: state.questionCount
  });
}

function toGeminiThinkingEffort(state: GameState): "medium" | "high" {
  return selectGeminiThinkingEffort(state);
}

function selectGeminiThinkingEffort(state: GameState): "medium" | "high" {
  return state.questionCount >= 12 ? "high" : "medium";
}

function toClaudeEffort(reasoningEffort: GameReasoningEffort, model: string) {
  if (
    reasoningEffort === "none" ||
    reasoningEffort === "minimal" ||
    reasoningEffort === "low"
  ) {
    return "low";
  }

  if (reasoningEffort === "medium") {
    return "medium";
  }

  if (reasoningEffort === "xhigh") {
    return model.includes("opus") ? "xhigh" : "high";
  }

  return "high";
}

function normalizeOpenAIUsage(usage: ResponseUsage | null): GameMasterUsage | null {
  if (!usage) {
    return null;
  }

  return {
    input_tokens: usage.input_tokens,
    input_tokens_details: {
      cached_tokens: usage.input_tokens_details.cached_tokens
    },
    output_tokens: usage.output_tokens,
    output_tokens_details: {
      reasoning_tokens: usage.output_tokens_details.reasoning_tokens
    },
    total_tokens: usage.total_tokens
  };
}

function normalizeAnthropicUsage(usage: AnthropicUsage): GameMasterUsage {
  const cachedTokens = usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const inputTokens = usage.input_tokens + cacheCreationTokens + cachedTokens;

  return {
    input_tokens: inputTokens,
    input_tokens_details: {
      cached_tokens: cachedTokens
    },
    output_tokens: usage.output_tokens,
    output_tokens_details: {
      reasoning_tokens: 0
    },
    total_tokens: inputTokens + usage.output_tokens
  };
}

function warmOpeningMoveResponse(
  answer: PlayerAnswer,
  reasoningEffort: GameReasoningEffort,
  model: GameModel
) {
  const key = warmupKey(answer, reasoningEffort, model);

  if (warmedOpenings.has(key) || openingWarmups.has(key)) {
    return;
  }

  const warmup = generateAiMove(
    createSharedOpeningAnswerState(answer, reasoningEffort, model),
    `opening-warmup-${model}-${reasoningEffort}-${answer}`
  )
    .then((generated) => {
      warmedOpenings.set(key, generated);
      logInfo("opening_warmup_succeeded", {
        answer,
        lateGameReasoningEffort: reasoningEffort,
        reasoningEffort: generated.reasoningEffort,
        responseId: generated.responseId,
        usage: summarizeResponseUsage(generated.usage)
      });
      return generated;
    })
    .catch((error: unknown) => {
      logWarn("opening_warmup_failed", {
        answer,
        reasoningEffort,
        error: describeError(error)
      });
      openingWarmups.delete(key);
      throw error;
    });

  openingWarmups.set(key, warmup);
  void warmup.catch(() => undefined);
}

function warmupKey(answer: PlayerAnswer, reasoningEffort: GameReasoningEffort, model: GameModel) {
  return `${model}:${reasoningEffort}:${answer}`;
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

function summarizeResponse(response: Response) {
  return {
    responseId: response.id,
    responseStatus: response.status ?? null,
    responseModel: response.model,
    actualServiceTier: response.service_tier ?? null,
    incompleteDetails: response.incomplete_details ?? null,
    responseError: response.error ?? null,
    outputTypes: response.output?.map((item) => item.type) ?? [],
    usage: summarizeResponseUsage(normalizeOpenAIUsage(response.usage ?? null))
  };
}

function previewOutput(outputText: string) {
  return outputText.replace(/\s+/g, " ").slice(0, OUTPUT_PREVIEW_CHARACTERS);
}

function extractResponseOutputText(response: Response): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const chatCompletionContent = extractChatCompletionMessageContent(response);

  if (chatCompletionContent) {
    return chatCompletionContent;
  }

  const outputItems = Array.isArray(response.output) ? response.output : [];
  const textParts: string[] = [];

  for (const item of outputItems) {
    if (item.type !== "message" || !("content" in item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        typeof content === "object" &&
        content !== null &&
        "text" in content &&
        typeof content.text === "string"
      ) {
        textParts.push(content.text);
      }
    }
  }

  return textParts.join("\n");
}

function extractClaudeOutputText(response: Message): string {
  const textParts: string[] = [];

  for (const item of response.content) {
    if (item.type === "text") {
      textParts.push(item.text);
    }
  }

  return textParts.join("\n");
}

function extractChatCompletionMessageContent(response: Response): string | null {
  const choices = (response as { choices?: unknown }).choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null || !("message" in choice)) {
      continue;
    }

    const message = choice.message;

    if (
      typeof message === "object" &&
      message !== null &&
      "content" in message &&
      typeof message.content === "string" &&
      message.content.trim()
    ) {
      return message.content;
    }
  }

  return null;
}
