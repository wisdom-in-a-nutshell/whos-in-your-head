import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_SERVICE_TIER: AnthropicServiceTier = "auto";

const SERVICE_TIERS = ["auto", "standard_only"] as const;

export type AnthropicServiceTier = (typeof SERVICE_TIERS)[number];

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
  const apiKey =
    process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim();
  const baseURL =
    process.env.ANTHROPIC_BASE_URL?.trim() || process.env.CLAUDE_BASE_URL?.trim();
  const model =
    modelOverride ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    DEFAULT_MODEL;
  const serviceTier = readServiceTier();

  return {
    apiKey: apiKey || undefined,
    baseURL: baseURL || undefined,
    model,
    serviceTier
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
    const apiKey =
      process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim();
    const baseURL =
      process.env.ANTHROPIC_BASE_URL?.trim() || process.env.CLAUDE_BASE_URL?.trim();

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
    throw new Error("ANTHROPIC_API_KEY or CLAUDE_API_KEY is not configured.");
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

function readServiceTier(): AnthropicServiceTier {
  const raw =
    process.env.ANTHROPIC_SERVICE_TIER?.trim() ||
    process.env.CLAUDE_SERVICE_TIER?.trim();

  if (!raw) {
    return DEFAULT_SERVICE_TIER;
  }

  if (SERVICE_TIERS.includes(raw as AnthropicServiceTier)) {
    return raw as AnthropicServiceTier;
  }

  throw new Error(
    `ANTHROPIC_SERVICE_TIER or CLAUDE_SERVICE_TIER must be one of: ${SERVICE_TIERS.join(", ")}.`
  );
}
