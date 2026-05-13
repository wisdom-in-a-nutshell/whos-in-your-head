import "server-only";
import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-5.5";

type OpenAIConfig = {
  apiKey?: string;
  baseURL?: string;
  model: string;
};

export type OpenAIRuntimeStatus = {
  configured: boolean;
  baseUrlConfigured: boolean;
  model: string;
};

function readOpenAIConfig(): OpenAIConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  return {
    apiKey: apiKey || undefined,
    baseURL: baseURL || undefined,
    model
  };
}

export function getOpenAIRuntimeStatus(): OpenAIRuntimeStatus {
  const config = readOpenAIConfig();

  return {
    configured: Boolean(config.apiKey),
    baseUrlConfigured: Boolean(config.baseURL),
    model: config.model
  };
}

export function getOpenAIClient(): OpenAI {
  const config = readOpenAIConfig();

  if (!config.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

export async function pingOpenAI() {
  const client = getOpenAIClient();
  const models = await client.models.list();

  return {
    reachable: true,
    modelCount: models.data.length
  };
}
