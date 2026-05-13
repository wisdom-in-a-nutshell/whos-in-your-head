import { NextResponse } from "next/server";
import { getPublicGameStats } from "@/lib/server/game-telemetry";
import { describeError, logWarn } from "@/lib/server/logging";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stats = await getPublicGameStats();

    return NextResponse.json({
      ok: true,
      stats
    });
  } catch (error) {
    logWarn("game_stats_failed", {
      error: describeError(error)
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Stats are unavailable."
      },
      { status: 503 }
    );
  }
}
