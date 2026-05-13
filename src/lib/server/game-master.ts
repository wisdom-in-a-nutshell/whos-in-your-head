import "server-only";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseUsage
} from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import { aiMoveSchema, type AiMove, type PlayerAnswer } from "@/lib/game/ai-move";
import { createSharedOpeningAnswerState } from "@/lib/game/opening";
import { buildGameMasterContinuationInput, buildGameMasterInput } from "@/lib/game/prompt";
import type { GameState } from "@/lib/game/state";
import { describeError, logError, logInfo, logWarn } from "./logging";
import { getOpenAIRequestConfig } from "./openai";

const AI_MOVE_FORMAT_NAME = "who_in_your_head_ai_move";
const PROMPT_CACHE_KEY = "whos-in-your-head-game-master-v1";
const GAME_MASTER_REQUEST_INSTRUCTIONS =
  "Follow the static game-master instructions in the input. Return only the structured move.";
const OPENING_WARMUP_ANSWERS: PlayerAnswer[] = ["yes", "no"];
const OUTPUT_PREVIEW_CHARACTERS = 220;

const openingWarmups = new Map<PlayerAnswer, Promise<GeneratedAiMove>>();
const warmedOpenings = new Map<PlayerAnswer, GeneratedAiMove>();

export type GeneratedAiMove = {
  move: AiMove;
  requestedServiceTier: string;
  actualServiceTier: string | null;
  promptCacheKey: string | null;
  responseId: string | null;
  usage: ResponseUsage | null;
};

type LiteLLMCacheControls = {
  cache?: {
    "no-cache"?: boolean;
    "no-store"?: boolean;
  };
};

type GameMasterResponseRequest = ResponseCreateParamsNonStreaming & LiteLLMCacheControls;

export function warmOpeningMoveResponses() {
  for (const answer of OPENING_WARMUP_ANSWERS) {
    warmOpeningMoveResponse(answer);
  }
}

export function readWarmedOpeningMove(answer: PlayerAnswer): GeneratedAiMove | null {
  return warmedOpenings.get(answer) ?? null;
}

export async function generateAiMove(
  state: GameState,
  requestId?: string,
  retryAttempt = 1
): Promise<GeneratedAiMove> {
  const { client, model, reasoningEffort, serviceTier } = getOpenAIRequestConfig();

  const bypassResponseCache = retryAttempt > 1;
  const usesPreviousResponse = state.modelResponseId !== null && !bypassResponseCache;
  const startedAt = Date.now();

  logInfo("game_master_request_started", {
    requestId,
    gameId: state.gameId,
    questionCount: state.questionCount,
    transcriptLength: state.transcript.length,
    model,
    reasoningEffort,
    requestedServiceTier: serviceTier,
    promptCacheKey: PROMPT_CACHE_KEY,
    retryAttempt,
    bypassResponseCache,
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
      reasoning: {
        effort: reasoningEffort
      },
      text: {
        verbosity: "low",
        format: zodTextFormat(aiMoveSchema, AI_MOVE_FORMAT_NAME, {
          description:
            "The next game-master move: either one yes/no-compatible question or one final famous-person guess."
        })
      },
      service_tier: serviceTier,
      prompt_cache_key: PROMPT_CACHE_KEY,
      prompt_cache_retention: "24h",
      store: true,
      ...(bypassResponseCache
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
        reasoningEffort,
        requestedServiceTier: serviceTier,
        retryAttempt,
        bypassResponseCache,
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
    bypassResponseCache
  });

  logInfo("game_master_request_succeeded", {
    requestId,
    gameId: state.gameId,
    responseId: response.id,
    durationMs: Date.now() - startedAt,
    actualServiceTier: response.service_tier ?? null,
    retryAttempt,
    bypassResponseCache,
    moveAction: move.action,
    question: move.question,
    guess: move.guess,
    usage: summarizeResponseUsage(response.usage ?? null)
  });

  return {
    move,
    requestedServiceTier: serviceTier,
    actualServiceTier: response.service_tier ?? null,
    promptCacheKey: PROMPT_CACHE_KEY,
    responseId: response.id,
    usage: response.usage ?? null
  };
}

function parseGameMasterMove(
  response: Response,
  context: {
    requestId?: string;
    gameId: string;
    durationMs: number;
    retryAttempt: number;
    bypassResponseCache: boolean;
  }
): AiMove {
  const outputText = response.output_text.trim();
  const responseSummary = summarizeResponse(response);

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

function warmOpeningMoveResponse(answer: PlayerAnswer) {
  if (warmedOpenings.has(answer) || openingWarmups.has(answer)) {
    return;
  }

  const warmup = generateAiMove(
    createSharedOpeningAnswerState(answer),
    `opening-warmup-${answer}`
  )
    .then((generated) => {
      warmedOpenings.set(answer, generated);
      logInfo("opening_warmup_succeeded", {
        answer,
        responseId: generated.responseId,
        usage: summarizeResponseUsage(generated.usage)
      });
      return generated;
    })
    .catch((error: unknown) => {
      logWarn("opening_warmup_failed", {
        answer,
        error: describeError(error)
      });
      openingWarmups.delete(answer);
      throw error;
    });

  openingWarmups.set(answer, warmup);
  void warmup.catch(() => undefined);
}

function summarizeResponseUsage(usage: ResponseUsage | null) {
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
    outputTypes: response.output.map((item) => item.type),
    usage: summarizeResponseUsage(response.usage ?? null)
  };
}

function previewOutput(outputText: string) {
  return outputText.replace(/\s+/g, " ").slice(0, OUTPUT_PREVIEW_CHARACTERS);
}
