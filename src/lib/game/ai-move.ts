import { z } from "zod";

export const playerAnswerSchema = z.enum(["yes", "no", "maybe"]);

export const aiMoveSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ask_question"),
    question: z.string().min(1),
    guess: z.null(),
    shortRationale: z.string().max(240).optional()
  }),
  z.object({
    action: z.literal("make_guess"),
    question: z.null(),
    guess: z.string().min(1),
    shortRationale: z.string().max(240).optional()
  })
]);

export type PlayerAnswer = z.infer<typeof playerAnswerSchema>;
export type AiMove = z.infer<typeof aiMoveSchema>;
