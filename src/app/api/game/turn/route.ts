import { NextResponse } from "next/server";
import {
  applyAiMove,
  createInitialGameState,
  finalizeGuess,
  GameRuleError,
  gameTurnRequestSchema,
  recordPlayerAnswer
} from "@/lib/game/state";
import { getOpenAIRuntimeStatus } from "@/lib/server/openai";
import { generateAiMove } from "@/lib/server/game-master";
import type { AiMove } from "@/lib/game/ai-move";

export const runtime = "nodejs";

const OPENING_MOVE: AiMove = {
  action: "ask_question",
  question: "Is this person alive?",
  guess: null,
  shortRationale: "Open with a broad split."
};

export function GET() {
  return NextResponse.json({
    ok: true,
    status: "ready",
    message: "POST start, answer, or judge_guess actions to drive a game turn."
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = gameTurnRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid game turn request.",
        issues: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.action === "judge_guess") {
      return NextResponse.json({
        ok: true,
        game: finalizeGuess(parsed.data.state, parsed.data.correct)
      });
    }

    if (parsed.data.action === "start") {
      const nextGame = applyAiMove(createInitialGameState(), OPENING_MOVE);

      return NextResponse.json({
        ok: true,
        game: nextGame,
        move: OPENING_MOVE,
        runtime: {
          source: "local_opening_question"
        }
      });
    }

    const status = getOpenAIRuntimeStatus();

    if (status.configurationError) {
      return NextResponse.json(
        {
          ok: false,
          code: "openai_configuration_error",
          error: status.configurationError,
          openai: status
        },
        { status: 503 }
      );
    }

    if (!status.configured) {
      return NextResponse.json(
        {
          ok: false,
          code: "openai_not_configured",
          error: "OPENAI_API_KEY is not configured.",
          openai: status
        },
        { status: 503 }
      );
    }

    const game = recordPlayerAnswer(parsed.data.state, parsed.data.answer);
    const generated = await generateAiMove(game);
    const move = generated.move;
    const nextGame = applyAiMove(game, move);

    return NextResponse.json({
      ok: true,
      game: nextGame,
      move,
      runtime: {
        requestedServiceTier: generated.requestedServiceTier,
        actualServiceTier: generated.actualServiceTier
      }
    });
  } catch (error) {
    const isRuleError = error instanceof GameRuleError;

    return NextResponse.json(
      {
        ok: false,
        code: isRuleError ? "game_rule_error" : "game_master_error",
        error:
          error instanceof Error
            ? error.message
            : "The game master could not produce a valid move."
      },
      { status: isRuleError ? 409 : 502 }
    );
  }
}
