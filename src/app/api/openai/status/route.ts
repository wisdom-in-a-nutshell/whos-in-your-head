import { NextResponse } from "next/server";
import {
  getOpenAIRuntimeStatus,
  pingOpenAI
} from "@/lib/server/openai";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const status = getOpenAIRuntimeStatus();
  const url = new URL(request.url);
  const shouldCheckConnection = url.searchParams.get("check") === "1";

  if (!shouldCheckConnection) {
    return NextResponse.json({
      ok: status.configurationError === null,
      openai: status
    });
  }

  if (status.configurationError) {
    return NextResponse.json(
      {
        ok: false,
        openai: status,
        error: status.configurationError
      },
      { status: 400 }
    );
  }

  if (!status.configured) {
    return NextResponse.json(
      {
        ok: false,
        openai: status,
        error: "OPENAI_API_KEY is not configured."
      },
      { status: 400 }
    );
  }

  try {
    const check = await pingOpenAI();

    return NextResponse.json({
      ok: true,
      openai: status,
      check
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        openai: status,
        error: "OpenAI connection check failed.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}
