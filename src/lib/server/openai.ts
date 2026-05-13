import "server-only";
import OpenAI from "openai";
import {
  gameReasoningEffortSchema,
  reasoningEffortValues,
  type GameReasoningEffort
} from "@/lib/game/reasoning";

const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_REASONING_EFFORT: OpenAIReasoningEffort = "high";
const DEFAULT_SERVICE_TIER: OpenAIServiceTier = "priority";
const DEFAULT_REASONING_MIX = "";

const SERVICE_TIERS = ["auto", "default", "priority"] as const;

export type OpenAIReasoningEffort = GameReasoningEffort;
export type OpenAIServiceTier = (typeof SERVICE_TIERS)[number];

export type ReasoningMixEntry = {
  effort: OpenAIReasoningEffort;
  weight: number;
};

type OpenAIConfig = {
  apiKey?: string;
  baseURL?: string;
  model: string;
  fallbackModels: string[];
  reasoningEffort: OpenAIReasoningEffort;
  serviceTier: OpenAIServiceTier;
};

export type OpenAIRuntimeStatus = {
  configured: boolean;
  baseUrlConfigured: boolean;
  model: string;
  fallbackModels: string[];
  reasoningEffort: OpenAIReasoningEffort;
  reasoningMix: ReasoningMixEntry[];
  serviceTier: OpenAIServiceTier;
  configurationError: string | null;
};

function readOpenAIConfig(
  reasoningEffortOverride?: OpenAIReasoningEffort
): OpenAIConfig {
  const apiKey =
    process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const baseURL =
    process.env.LLM_API_ENDPOINT?.trim() || process.env.OPENAI_BASE_URL?.trim();
  const model =
    process.env.LLM_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const fallbackModels = readFallbackModels(model);
  const reasoningEffort = reasoningEffortOverride ?? readReasoningEffort();
  const serviceTier = readServiceTier();

  return {
    apiKey: apiKey || undefined,
    baseURL: baseURL || undefined,
    model,
    fallbackModels,
    reasoningEffort,
    serviceTier
  };
}

export function getOpenAIRuntimeStatus(): OpenAIRuntimeStatus {
  try {
    const config = readOpenAIConfig();

    return {
      configured: Boolean(config.apiKey),
      baseUrlConfigured: Boolean(config.baseURL),
      model: config.model,
      fallbackModels: config.fallbackModels,
      reasoningEffort: config.reasoningEffort,
      reasoningMix: readReasoningMix(),
      serviceTier: config.serviceTier,
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
      fallbackModels: [],
      reasoningEffort: DEFAULT_REASONING_EFFORT,
      reasoningMix: [],
      serviceTier: DEFAULT_SERVICE_TIER,
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

export function getOpenAIRequestConfig(
  reasoningEffortOverride?: OpenAIReasoningEffort
) {
  const config = readOpenAIConfig(reasoningEffortOverride);

  return {
    client: getOpenAIClient(),
    model: config.model,
    fallbackModels: config.fallbackModels,
    reasoningEffort: config.reasoningEffort,
    serviceTier: config.serviceTier
  };
}

export function getOpenAIModelFallbacks() {
  return readOpenAIConfig().fallbackModels;
}

export function selectGameReasoningEffort(random = Math.random): OpenAIReasoningEffort {
  const mix = readReasoningMix();

  if (mix.length === 0) {
    return readReasoningEffort();
  }

  const totalWeight = mix.reduce((total, entry) => total + entry.weight, 0);
  let cursor = random() * totalWeight;

  for (const entry of mix) {
    cursor -= entry.weight;

    if (cursor <= 0) {
      return entry.effort;
    }
  }

  return mix.at(-1)?.effort ?? readReasoningEffort();
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

  const parsed = gameReasoningEffortSchema.safeParse(raw);

  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(
    `LLM_REASONING_EFFORT or OPENAI_REASONING_EFFORT must be one of: ${reasoningEffortValues.join(", ")}.`
  );
}

function readReasoningMix(): ReasoningMixEntry[] {
  const raw =
    process.env.LLM_REASONING_MIX?.trim() ||
    process.env.OPENAI_REASONING_MIX?.trim() ||
    DEFAULT_REASONING_MIX;

  if (!raw) {
    return [];
  }

  return raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawEffort, rawWeight] = entry.split(":").map((part) => part.trim());
      const parsedEffort = gameReasoningEffortSchema.safeParse(rawEffort);
      const weight = rawWeight === undefined ? 1 : Number(rawWeight);

      if (!parsedEffort.success || !Number.isFinite(weight) || weight <= 0) {
        throw new Error(
          "LLM_REASONING_MIX must look like high:2,medium:1,low:1 using supported reasoning efforts and positive weights."
        );
      }

      return {
        effort: parsedEffort.data,
        weight
      };
    });
}

function readServiceTier(): OpenAIServiceTier {
  const raw =
    process.env.LLM_SERVICE_TIER?.trim() || process.env.OPENAI_SERVICE_TIER?.trim();

  if (!raw) {
    return DEFAULT_SERVICE_TIER;
  }

  if (SERVICE_TIERS.includes(raw as OpenAIServiceTier)) {
    return raw as OpenAIServiceTier;
  }

  throw new Error(
    `LLM_SERVICE_TIER or OPENAI_SERVICE_TIER must be one of: ${SERVICE_TIERS.join(", ")}.`
  );
}

function readFallbackModels(primaryModel: string): string[] {
  const raw =
    process.env.LLM_FALLBACK_MODELS?.trim() ||
    process.env.OPENAI_FALLBACK_MODELS?.trim();

  if (!raw) {
    return [];
  }

  const seen = new Set<string>();

  return raw
    .split(/[,\n]/)
    .map((model) => model.trim())
    .filter((model) => {
      if (!model || model === primaryModel || seen.has(model)) {
        return false;
      }

      seen.add(model);
      return true;
    });
}
