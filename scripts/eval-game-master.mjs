import fs from "node:fs";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const MAX_QUESTIONS = 21;
const AI_MOVE_FORMAT_NAME = "who_in_your_head_eval_move";

const DEFAULT_TARGETS = [
  "Taylor Swift",
  "Mia Khalifa",
  "Osama bin Laden",
  "Shah Rukh Khan",
  "Bad Bunny",
  "Kim Kardashian",
  "Donald Glover",
  "Arnold Schwarzenegger",
  "Queen Elizabeth II",
  "Princess Diana",
  "Marie Curie",
  "Ada Lovelace",
  "Frida Kahlo",
  "Banksy",
  "Satoshi Nakamoto",
  "Cristiano Ronaldo",
  "Barack Obama",
  "Elon Musk",
  "Oprah Winfrey",
  "Greta Thunberg",
  "Lionel Messi",
  "MrBeast",
  "Zendaya",
  "Albert Einstein",
  "Beyonce"
];

loadEnv();

const effort = readArg("--effort") ?? process.env.LLM_REASONING_EFFORT ?? "medium";
const limit = Number(readArg("--limit") ?? DEFAULT_TARGETS.length);
const serviceTier = readArg("--service-tier") ?? process.env.LLM_SERVICE_TIER ?? process.env.OPENAI_SERVICE_TIER ?? "priority";
const model = readArg("--model") ?? process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
const oracleModel = readArg("--oracle-model") ?? "gpt-5.4-mini";
const requestTimeoutMs = Number(readArg("--timeout-ms") ?? "45000");
const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.LLM_API_ENDPOINT || process.env.OPENAI_BASE_URL;
const targets = readTargets().slice(0, limit);

if (!apiKey) {
  throw new Error("LLM_API_KEY or OPENAI_API_KEY is required.");
}

const client = new OpenAI({
  apiKey,
  baseURL,
  maxRetries: 0,
  timeout: requestTimeoutMs
});

const gameMasterInstructions = readGameMasterInstructions();

const AiMoveSchema = z
  .object({
    action: z.enum(["ask_question", "make_guess"]),
    question: z.string().trim().min(1).max(180).nullable(),
    guess: z.string().trim().min(1).max(120).nullable(),
    shortRationale: z.string().trim().max(240).nullable()
  })
  .strict();

const AnswerSchema = z
  .object({
    answer: z.enum(["yes", "no", "maybe"]),
    note: z.string().max(500)
  })
  .strict();

const JudgeSchema = z
  .object({
    correct: z.boolean(),
    note: z.string().max(500)
  })
  .strict();

console.log(
  JSON.stringify(
    {
      endpoint: baseURL,
      model,
      effort,
      serviceTier,
      oracleModel,
      requestTimeoutMs,
      games: targets.length
    },
    null,
    2
  )
);

const results = [];

for (const target of targets) {
  console.log(JSON.stringify({ event: "start", target }));
  try {
    const result = await playGame(target);
    results.push(result);
    console.log(formatResult(result));
  } catch (error) {
    const result = {
      target,
      guess: null,
      correct: false,
      judgement: "Eval runner failed before producing a judgement.",
      questionCount: 0,
      failures: [formatError(error)],
      transcript: []
    };
    results.push(result);
    console.log(formatResult(result));
  }
}

console.log(formatSummary(results));

async function playGame(target) {
  let state = createInitialGameState();
  state = applyQuestion(state, "Is this person alive?");

  const transcript = [];
  const failures = [];

  while (state.phase === "asking" && state.questionCount <= MAX_QUESTIONS) {
    let answer;
    try {
      answer = await answerQuestion(target, state.latestQuestion, transcript);
    } catch (error) {
      failures.push(`answer_oracle: ${formatError(error)}`);
      break;
    }

    transcript.push({ question: state.latestQuestion, answer: answer.answer, note: answer.note });
    state = recordAnswer(state, answer.answer);

    if (state.questionCount >= MAX_QUESTIONS) {
      break;
    }

    try {
      const move = await generateMove(state);
      state = applyMove(state, move);
    } catch (error) {
      failures.push(`game_master: ${formatError(error)}`);
      break;
    }
  }

  let guess = state.finalGuess;

  if (!guess) {
    try {
      const move = await generateMove({ ...state, questionCount: MAX_QUESTIONS });
      if (move.action === "make_guess") {
        state = applyMove(state, move);
        guess = state.finalGuess;
      } else {
        failures.push("game_master: forced final move returned a question.");
      }
    } catch (error) {
      failures.push(`final_guess: ${formatError(error)}`);
    }
  }

  const judgement = guess
    ? await judgeGuess(target, guess)
    : { correct: false, note: "No final guess." };

  return {
    target,
    guess,
    correct: judgement.correct,
    judgement: judgement.note,
    questionCount: state.questionCount,
    failures,
    transcript
  };
}

async function generateMove(state) {
  const response = await client.responses.parse({
    model,
    instructions: gameMasterInstructions,
    input: [
      {
        role: "user",
        content: buildGameMasterInput(state)
      }
    ],
    reasoning: {
      effort
    },
    text: {
      verbosity: "low",
      format: zodTextFormat(AiMoveSchema, AI_MOVE_FORMAT_NAME, {
        description: "One game-master move for a 21-questions famous-person game."
      })
    },
    service_tier: serviceTier,
    max_output_tokens: 700,
    prompt_cache_key: "whos-in-your-head-game-master-v1",
    store: false
  });

  if (!response.output_parsed) {
    throw new Error(`No parsed move. status=${response.status}`);
  }

  return response.output_parsed;
}

async function answerQuestion(target, question, transcript) {
  const response = await client.responses.parse({
    model: oracleModel,
    instructions:
      "You are a strict answer oracle for a 21 questions game. The hidden target is a famous public person. Answer only from durable public facts. Use maybe when the wording is ambiguous, mixed, or not a clean yes/no.",
    input: [
      {
        role: "user",
        content: JSON.stringify({ target, question, transcript }, null, 2)
      }
    ],
    text: {
      verbosity: "low",
      format: zodTextFormat(AnswerSchema, "answer_oracle")
    },
    max_output_tokens: 220,
    store: false
  });

  if (!response.output_parsed) {
    throw new Error("Answer oracle returned no parsed answer.");
  }

  return response.output_parsed;
}

async function judgeGuess(target, guess) {
  try {
    const response = await client.responses.parse({
      model: oracleModel,
      instructions:
        "Judge whether a final guess names the same famous public person as the hidden target. Be strict about identity, but allow minor spelling or accent differences.",
      input: [
        {
          role: "user",
          content: JSON.stringify({ target, guess }, null, 2)
        }
      ],
      text: {
        verbosity: "low",
        format: zodTextFormat(JudgeSchema, "guess_judge")
      },
      max_output_tokens: 160,
      store: false
    });

    if (!response.output_parsed) {
      return { correct: normalizeName(target) === normalizeName(guess), note: "Fallback string comparison." };
    }

    return response.output_parsed;
  } catch (error) {
    return {
      correct: normalizeName(target) === normalizeName(guess),
      note: `Judge failed; used fallback string comparison. ${formatError(error)}`
    };
  }
}

function createInitialGameState() {
  return {
    gameId: randomUUID(),
    phase: "asking",
    questionCount: 0,
    maxQuestions: MAX_QUESTIONS,
    transcript: [],
    latestQuestion: null,
    finalGuess: null,
    result: "unknown"
  };
}

function applyQuestion(state, question) {
  return {
    ...state,
    phase: "asking",
    questionCount: state.questionCount + 1,
    latestQuestion: normalizeQuestion(question)
  };
}

function recordAnswer(state, answer) {
  return {
    ...state,
    transcript: [...state.transcript, { question: state.latestQuestion, answer }],
    latestQuestion: null
  };
}

function applyMove(state, move) {
  if (move.action === "ask_question") {
    if (!move.question) throw new Error("Question move missing question.");
    return applyQuestion(state, move.question);
  }

  if (!move.guess) throw new Error("Guess move missing guess.");
  return {
    ...state,
    phase: "guessing",
    latestQuestion: null,
    finalGuess: move.guess
  };
}

function buildGameMasterInput(state) {
  const snapshot = {
    gameId: state.gameId,
    phase: state.phase,
    questionCountAsked: state.questionCount,
    answeredQuestionCount: state.transcript.length,
    maxQuestions: state.maxQuestions,
    remainingQuestionSlots: Math.max(0, state.maxQuestions - state.questionCount),
    latestUnansweredQuestion: state.latestQuestion,
    lastAnswer: state.transcript.at(-1)?.answer ?? null,
    transcript: state.transcript
  };
  const directive =
    snapshot.remainingQuestionSlots <= 0
      ? "No question slots remain. Make a final guess now."
      : "Ask one strong yes/no-compatible question, or make a final guess if the candidate is clear.";

  return [
    "Use this game state as the complete source of truth.",
    "",
    "<game_state>",
    JSON.stringify(snapshot, null, 2),
    "</game_state>",
    "",
    `<directive>${directive}</directive>`
  ].join("\n");
}

function readGameMasterInstructions() {
  const source = fs.readFileSync("src/lib/game/prompt.ts", "utf8");
  const match = source.match(/export const GAME_MASTER_INSTRUCTIONS = `([\s\S]*?)`\.trim\(\);/);
  if (!match) throw new Error("Could not read GAME_MASTER_INSTRUCTIONS.");
  return match[1];
}

function readTargets() {
  const rawTargets = readArg("--targets");
  if (!rawTargets) return DEFAULT_TARGETS;
  return rawTargets
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);
}

function normalizeQuestion(question) {
  const compacted = question.replace(/\s+/g, " ").trim();
  return compacted.endsWith("?") ? compacted : `${compacted}?`;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatResult(result) {
  return JSON.stringify({
    target: result.target,
    guess: result.guess,
    correct: result.correct,
    questionCount: result.questionCount,
    failures: result.failures,
    lastQuestions: result.transcript.slice(-4)
  });
}

function formatSummary(results) {
  const correct = results.filter((result) => result.correct).length;
  const completed = results.filter((result) => result.guess).length;
  const failed = results.filter((result) => result.failures.length > 0).length;
  const averageQuestions =
    results.reduce((total, result) => total + result.questionCount, 0) / Math.max(1, results.length);

  return JSON.stringify(
    {
      summary: {
        correct,
        completed,
        failed,
        total: results.length,
        averageQuestions: Number(averageQuestions.toFixed(1))
      },
      misses: results
        .filter((result) => !result.correct)
        .map((result) => ({
          target: result.target,
          guess: result.guess,
          questionCount: result.questionCount,
          failures: result.failures,
          lastQuestions: result.transcript.slice(-6)
        }))
    },
    null,
    2
  );
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function readArg(name) {
  const prefix = `${name}=`;
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
      process.env[key] ||= value;
    }
  }
}
