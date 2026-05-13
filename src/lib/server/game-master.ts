import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { aiMoveSchema, type AiMove } from "@/lib/game/ai-move";
import { GAME_MASTER_INSTRUCTIONS, buildGameMasterInput } from "@/lib/game/prompt";
import type { GameState } from "@/lib/game/state";
import { getOpenAIRequestConfig } from "./openai";

const AI_MOVE_FORMAT_NAME = "who_in_your_head_ai_move";

export type GeneratedAiMove = {
  move: AiMove;
  requestedServiceTier: string;
  actualServiceTier: string | null;
};

export async function generateAiMove(state: GameState): Promise<GeneratedAiMove> {
  const { client, model, reasoningEffort, serviceTier } = getOpenAIRequestConfig();

  const response = await client.responses.parse({
    model,
    instructions: GAME_MASTER_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: buildGameMasterInput(state)
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
    max_output_tokens: 700,
    prompt_cache_key: "whos-in-your-head-game-master-v1",
    store: false
  });

  const move = response.output_parsed;

  if (!move) {
    throw new Error("OpenAI returned no parsed game-master move.");
  }

  return {
    move,
    requestedServiceTier: serviceTier,
    actualServiceTier: response.service_tier ?? null
  };
}
