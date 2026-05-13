import { z } from "zod";

export const playerAnswerSchema = z.enum(["yes", "no", "maybe"]);

export const aiMoveSchema = z
  .object({
    action: z.enum(["ask_question", "make_guess"]),
    question: z.string().trim().min(1).max(180).nullable(),
    guess: z.string().trim().min(1).max(120).nullable(),
    shortRationale: z.string().trim().max(240).nullable()
  })
  .strict()
  .superRefine((move, context) => {
    if (move.action === "ask_question") {
      if (move.question === null) {
        context.addIssue({
          code: "custom",
          path: ["question"],
          message: "Question moves must include a question."
        });
      }

      if (move.guess !== null) {
        context.addIssue({
          code: "custom",
          path: ["guess"],
          message: "Question moves cannot include a guess."
        });
      }
    }

    if (move.action === "make_guess") {
      if (move.question !== null) {
        context.addIssue({
          code: "custom",
          path: ["question"],
          message: "Guess moves cannot include a question."
        });
      }

      if (move.guess === null) {
        context.addIssue({
          code: "custom",
          path: ["guess"],
          message: "Guess moves must include a guess."
        });
      }
    }
  });

export type PlayerAnswer = z.infer<typeof playerAnswerSchema>;
export type AiMove = z.infer<typeof aiMoveSchema>;
