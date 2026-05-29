import { z } from "zod";
import { aiMoveSchema, type AiMove } from "./ai-move";
import { buildModelGameSnapshot, type GameState } from "./state";

const LATE_VERIFIER_START_AFTER_QUESTIONS = 16;

export const lateVerifierCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    fit: z.enum(["strong", "plausible", "weak"]),
    supportingEvidence: z.array(z.string().trim().min(1).max(160)).max(4),
    noisyOrConflictingEvidence: z.array(z.string().trim().min(1).max(160)).max(4),
    separatingQuestion: z.string().trim().min(1).max(180).nullable()
  })
  .strict();

export const lateVerificationSchema = z
  .object({
    candidates: z.array(lateVerifierCandidateSchema).min(1).max(6),
    verdict: z.enum(["approve_guess", "replace_guess", "ask_question"]),
    guess: z.string().trim().min(1).max(120).nullable(),
    question: z.string().trim().min(1).max(180).nullable(),
    shortRationale: z.string().trim().max(240).nullable()
  })
  .strict()
  .superRefine((verification, context) => {
    if (verification.verdict === "approve_guess") {
      if (verification.guess !== null || verification.question !== null) {
        context.addIssue({
          code: "custom",
          message: "Approved guesses cannot include replacement moves."
        });
      }
    }

    if (verification.verdict === "replace_guess") {
      if (verification.guess === null || verification.question !== null) {
        context.addIssue({
          code: "custom",
          message: "Replacement guesses must include only a guess."
        });
      }
    }

    if (verification.verdict === "ask_question") {
      if (verification.question === null || verification.guess !== null) {
        context.addIssue({
          code: "custom",
          message: "Question verdicts must include only a question."
        });
      }
    }
  });

export type LateVerification = z.infer<typeof lateVerificationSchema>;

export const LATE_VERIFIER_FORMAT_NAME = "who_in_your_head_late_verification";

export const LATE_VERIFIER_INSTRUCTIONS = [
  "You are a late-game verifier for Who's In Your Head.",
  "The main game master has proposed a final guess. Your job is not to play a new game.",
  "Privately build a small candidate board from the transcript, reject candidates that clearly contradict hard answers, and catch adjacent-person mistakes.",
  "Before approving, rank the proposed guess against nearby high-fame alternatives that share the same broad cluster.",
  "Do not approve a broadly plausible guess when another candidate better matches recent hard guardrails for role, source, medium, region, era, platform, or organization.",
  "Treat Maybe and a single conflicting answer as weak evidence, not absolute proof.",
  "If the proposed guess fits best, approve it.",
  "If another candidate clearly fits better and no useful question remains, replace the guess.",
  "If question slots remain and the transcript still contains a nearby-candidate collision, ask one yes/no question that separates the top candidates.",
  "Never ask for free text, initials, hints, or a category.",
  "Every replacement question must be answerable with yes, no, or maybe and start with a direct yes/no auxiliary.",
  "Return only the structured verification."
].join("\n");

export function shouldRunLateVerifier(state: GameState, move: AiMove) {
  return (
    state.model === "gpt-chat-latest" &&
    move.action === "make_guess" &&
    state.questionCount >= LATE_VERIFIER_START_AFTER_QUESTIONS
  );
}

export function buildLateVerifierInput(state: GameState, proposedMove: AiMove) {
  const remainingQuestionSlots = Math.max(0, state.maxQuestions - state.questionCount);

  return [
    "<game_state>",
    JSON.stringify(buildModelGameSnapshot(state), null, 2),
    "</game_state>",
    "",
    "<proposed_move>",
    JSON.stringify(proposedMove, null, 2),
    "</proposed_move>",
    "",
    `Remaining question slots: ${remainingQuestionSlots}.`,
    remainingQuestionSlots > 0
      ? "If the proposed guess is premature and a single discriminator would help, use verdict ask_question."
      : "No question slots remain. Use only approve_guess or replace_guess.",
    "Prefer fixing obvious nearby-person or constraint-violation mistakes over making clever obscure substitutions."
  ].join("\n");
}

export function lateVerificationToMove(
  verification: LateVerification,
  originalMove: AiMove,
  state: GameState
): AiMove | null {
  if (verification.verdict === "approve_guess") {
    return null;
  }

  if (verification.verdict === "ask_question") {
    if (state.questionCount >= state.maxQuestions || verification.question === null) {
      return null;
    }

    return aiMoveSchema.parse({
      action: "ask_question",
      question: verification.question,
      guess: null,
      shortRationale: verification.shortRationale
    });
  }

  if (verification.guess === null) {
    return null;
  }

  if (originalMove.action === "make_guess" && verification.guess === originalMove.guess) {
    return null;
  }

  return aiMoveSchema.parse({
    action: "make_guess",
    question: null,
    guess: verification.guess,
    shortRationale: verification.shortRationale
  });
}
