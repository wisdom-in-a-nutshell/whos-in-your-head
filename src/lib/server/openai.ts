import "server-only";
import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_REASONING_EFFORT: OpenAIReasoningEffort = "medium";

const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
] as const;

export type OpenAIReasoningEffort = (typeof REASONING_EFFORTS)[number];

type OpenAIConfig = {
  apiKey?: string;
  baseURL?: string;
  model: string;
  reasoningEffort: OpenAIReasoningEffort;
};

export type OpenAIRuntimeStatus = {
  configured: boolean;
  baseUrlConfigured: boolean;
  model: string;
  reasoningEffort: OpenAIReasoningEffort;
  configurationError: string | null;
};

function readOpenAIConfig(): OpenAIConfig {
  const apiKey =
    process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const baseURL =
    process.env.LLM_API_ENDPOINT?.trim() || process.env.OPENAI_BASE_URL?.trim();
  const model =
    process.env.LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const reasoningEffort = readReasoningEffort();

  return {
    apiKey: apiKey || undefined,
    baseURL: baseURL || undefined,
    model,
    reasoningEffort
  };
}

export function getOpenAIRuntimeStatus(): OpenAIRuntimeStatus {
  try {
    const config = readOpenAIConfig();

    return {
      configured: Boolean(config.apiKey),
      baseUrlConfigured: Boolean(config.baseURL),
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      configurationError: null
    };
  } catch (error) {
    const apiKey =
      process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    const baseURL =
      process.env.LLM_API_ENDPOINT?.trim() || process.env.OPENAI_BASE_URL?.trim();
    const model =
      process.env.LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

    return {
      configured: Boolean(apiKey),
      baseUrlConfigured: Boolean(baseURL),
      model,
      reasoningEffort: DEFAULT_REASONING_EFFORT,
      configurationError:
        error instanceof Error ? error.message : "Unknown OpenAI configuration error."
    };
  }
}

export function getOpenAIClient(): OpenAI {
  const config = readOpenAIConfig();

  if (!config.apiKey) {
    throw new Error("LLM_API_KEY or OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

export function getOpenAIRequestConfig() {
  const config = readOpenAIConfig();

  return {
    client: getOpenAIClient(),
    model: config.model,
    reasoningEffort: config.reasoningEffort
  };
}

export async function pingOpenAI() {
  const client = getOpenAIClient();
  const models = await client.models.list();

  return {
    reachable: true,
    modelCount: models.data.length
  };
}

function readReasoningEffort(): OpenAIReasoningEffort {
  const raw =
    process.env.LLM_REASONING_EFFORT?.trim() ||
    process.env.OPENAI_REASONING_EFFORT?.trim();

  if (!raw) {
    return DEFAULT_REASONING_EFFORT;
  }

  if (REASONING_EFFORTS.includes(raw as OpenAIReasoningEffort)) {
    return raw as OpenAIReasoningEffort;
  }

  throw new Error(
    `OPENAI_REASONING_EFFORT must be one of: ${REASONING_EFFORTS.join(", ")}.`
  );
}
