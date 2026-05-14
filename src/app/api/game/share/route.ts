import { NextResponse } from "next/server";
import { z } from "zod";
import { gameStateSchema } from "@/lib/game/state";
import { recordGameShareTelemetry } from "@/lib/server/game-telemetry";
import { logWarn } from "@/lib/server/logging";

export const runtime = "nodejs";

const gameShareRequestSchema = z
  .object({
    state: gameStateSchema,
    method: z.enum(["native", "copy"])
  })
  .strict();

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const body = await request.json().catch(() => null);
  const parsed = gameShareRequestSchema.safeParse(body);

  if (!parsed.success) {
    logWarn("game_share_invalid_request", {
      requestId,
      issues: parsed.error.flatten()
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Invalid share event."
      },
      { status: 400 }
    );
  }

  const state = parsed.data.state;

  if (
    state.phase !== "result" ||
    state.result === "unknown" ||
    !state.finalGuess
  ) {
    logWarn("game_share_invalid_request", {
      requestId,
      issues: null
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Invalid share event."
      },
      { status: 400 }
    );
  }

  recordGameShareTelemetry({
    requestId,
    state,
    method: parsed.data.method,
    routeDurationMs: Date.now() - startedAt
  });

  return NextResponse.json({
    ok: true
  });
}
