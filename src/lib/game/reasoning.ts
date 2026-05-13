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
  if (
    lateGameReasoningEffort === "none" ||
    lateGameReasoningEffort === "minimal" ||
    lateGameReasoningEffort === "low"
  ) {
    return lateGameReasoningEffort;
  }

  if (questionCount < 9) {
    return "low";
  }

  if (questionCount < 17) {
    return "medium";
  }

  return lateGameReasoningEffort;
}
