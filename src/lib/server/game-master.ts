import "server-only";
import { zodTextFormat } from "openai/helpers/zod";
import { aiMoveSchema, type AiMove } from "@/lib/game/ai-move";
import { GAME_MASTER_INSTRUCTIONS, buildGameMasterInput } from "@/lib/game/prompt";
import type { GameState } from "@/lib/game/state";
import { getOpenAIRequestConfig } from "./openai";

const AI_MOVE_FORMAT_NAME = "who_in_your_head_ai_move";

export async function generateAiMove(state: GameState): Promise<AiMove> {
  const { client, model, reasoningEffort } = getOpenAIRequestConfig();

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
    max_output_tokens: 700,
    prompt_cache_key: "whos-in-your-head-game-master-v1",
    store: false
  });

  const move = response.output_parsed;

  if (!move) {
    throw new Error("OpenAI returned no parsed game-master move.");
  }

  return move;
}
