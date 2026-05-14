import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SERVICE_TIER: AnthropicServiceTier = "auto";

export type AnthropicServiceTier = "auto";

type AnthropicConfig = {
  apiKey?: string;
  baseURL?: string;
  model: string;
  serviceTier: AnthropicServiceTier;
};

export type AnthropicRuntimeStatus = {
  configured: boolean;
  baseUrlConfigured: boolean;
  model: string;
  serviceTier: AnthropicServiceTier;
  configurationError: string | null;
};

function readAnthropicConfig(modelOverride?: string): AnthropicConfig {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = normalizeBaseURL(process.env.LLM_API_ENDPOINT?.trim());
  const model = modelOverride || DEFAULT_MODEL;

  return {
    apiKey: apiKey || undefined,
    baseURL: baseURL || undefined,
    model,
    serviceTier: DEFAULT_SERVICE_TIER
  };
}

export function getAnthropicRuntimeStatus(modelOverride?: string): AnthropicRuntimeStatus {
  try {
    const config = readAnthropicConfig(modelOverride);

    return {
      configured: Boolean(config.apiKey),
      baseUrlConfigured: Boolean(config.baseURL),
      model: config.model,
      serviceTier: config.serviceTier,
      configurationError: null
    };
  } catch (error) {
    const apiKey = process.env.LLM_API_KEY?.trim();
    const baseURL = normalizeBaseURL(process.env.LLM_API_ENDPOINT?.trim());

    return {
      configured: Boolean(apiKey),
      baseUrlConfigured: Boolean(baseURL),
      model: modelOverride || DEFAULT_MODEL,
      serviceTier: DEFAULT_SERVICE_TIER,
      configurationError:
        error instanceof Error
          ? error.message
          : "Unknown Anthropic configuration error."
    };
  }
}

export function getAnthropicClient(): Anthropic {
  const config = readAnthropicConfig();

  if (!config.apiKey) {
    throw new Error("LLM_API_KEY is not configured.");
  }

  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });
}

export function getAnthropicRequestConfig(modelOverride?: string) {
  const config = readAnthropicConfig(modelOverride);

  return {
    client: getAnthropicClient(),
    model: config.model,
    serviceTier: config.serviceTier
  };
}

function normalizeBaseURL(baseURL: string | undefined) {
  if (!baseURL) {
    return undefined;
  }

  return baseURL.replace(/\/+$/, "").replace(/\/v1$/, "");
}
