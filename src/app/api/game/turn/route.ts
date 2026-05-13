import { NextResponse } from "next/server";
import { z } from "zod";
import { playerAnswerSchema } from "@/lib/game/ai-move";

export const runtime = "nodejs";

const gameTurnRequestSchema = z.object({
  gameId: z.string().min(1).optional(),
  answer: playerAnswerSchema.optional()
});

export function GET() {
  return NextResponse.json({
    ok: true,
    status: "pending_design",
    message: "Game turn endpoint scaffold is ready."
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

  return NextResponse.json(
    {
      ok: false,
      status: "pending_design",
      message:
        "Core game logic is intentionally not implemented until UI/product design is finalized.",
      acceptedInput: parsed.data
    },
    { status: 501 }
  );
}
