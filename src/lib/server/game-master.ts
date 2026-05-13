import "server-only";
import type { ResponseUsage } from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import { aiMoveSchema, type AiMove } from "@/lib/game/ai-move";
import { buildGameMasterContinuationInput, buildGameMasterInput } from "@/lib/game/prompt";
import type { GameState } from "@/lib/game/state";
import { getOpenAIRequestConfig } from "./openai";

const AI_MOVE_FORMAT_NAME = "who_in_your_head_ai_move";
const PROMPT_CACHE_KEY = "whos-in-your-head-game-master-v1";
const GAME_MASTER_REQUEST_INSTRUCTIONS =
  "Follow the static game-master instructions in the input. Return only the structured move.";

export type GeneratedAiMove = {
  move: AiMove;
  requestedServiceTier: string;
  actualServiceTier: string | null;
  promptCacheKey: string | null;
  responseId: string | null;
  usage: ResponseUsage | null;
};

export async function generateAiMove(state: GameState): Promise<GeneratedAiMove> {
  const { client, model, reasoningEffort, serviceTier } = getOpenAIRequestConfig();

  const usesPreviousResponse = state.modelResponseId !== null;
  const response = await client.responses.parse({
    model,
    instructions: GAME_MASTER_REQUEST_INSTRUCTIONS,
    previous_response_id: state.modelResponseId ?? undefined,
    input: [
      {
        role: "user",
        content: usesPreviousResponse
          ? buildGameMasterContinuationInput(state)
          : buildGameMasterInput(state)
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
    max_output_tokens: 1500,
    prompt_cache_key: PROMPT_CACHE_KEY,
    prompt_cache_retention: "24h",
    store: true
  });

  const move = response.output_parsed;

  if (!move) {
    throw new Error("OpenAI returned no parsed game-master move.");
  }

  return {
    move,
    requestedServiceTier: serviceTier,
    actualServiceTier: response.service_tier ?? null,
    promptCacheKey: PROMPT_CACHE_KEY,
    responseId: response.id,
    usage: response.usage ?? null
  };
}
