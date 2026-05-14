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

  if (!parsed.success || parsed.data.state.phase !== "result") {
    logWarn("game_share_invalid_request", {
      requestId,
      issues: parsed.success ? null : parsed.error.flatten()
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
    state: parsed.data.state,
    method: parsed.data.method,
    routeDurationMs: Date.now() - startedAt
  });

  return NextResponse.json({
    ok: true
  });
}
