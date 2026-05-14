import { z } from "zod";

export const playerAnswerSchema = z.enum(["yes", "no", "maybe"]);

function createAiMoveSchema(shortRationaleMaxLength: number) {
  return z.object({
    action: z
      .enum(["ask_question", "make_guess"])
      .describe("Whether the game master is asking one question or making a final guess."),
    question: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .nullable()
      .describe("The single yes/no/maybe question when action is ask_question; otherwise null."),
    guess: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .nullable()
      .describe("One canonical public name when action is make_guess; otherwise null."),
    shortRationale: z
      .string()
      .trim()
      .max(shortRationaleMaxLength)
      .nullable()
      .describe("A short private debug note about why this move was chosen, or null.")
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
}

export const aiMoveSchema = createAiMoveSchema(240);
export const aiMoveProviderOutputSchema = createAiMoveSchema(2000);

export type PlayerAnswer = z.infer<typeof playerAnswerSchema>;
export type AiMove = z.infer<typeof aiMoveSchema>;
