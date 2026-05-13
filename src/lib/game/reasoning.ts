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

export function selectTurnReasoningEffort({
  lateGameReasoningEffort,
  questionCount
}: {
  lateGameReasoningEffort: GameReasoningEffort;
  questionCount: number;
}): GameReasoningEffort {
  if (questionCount < 9) {
    return "low";
  }

  if (questionCount < 14) {
    return "medium";
  }

  return lateGameReasoningEffort;
}
