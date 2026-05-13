import { z } from "zod";

export const reasoningEffortValues = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
] as const;

export const gameReasoningEffortSchema = z.enum(reasoningEffortValues);

export type GameReasoningEffort = z.infer<typeof gameReasoningEffortSchema>;
