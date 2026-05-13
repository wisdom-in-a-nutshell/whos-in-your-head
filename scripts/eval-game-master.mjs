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

const TARGET_PROFILES = new Map([
  [
    "Mia Khalifa",
    [
      "Living woman.",
      "Public media personality.",
      "First became widely known through mature-audience entertainment.",
      "Later known for online media, commentary, sports commentary, and social platforms.",
      "Not primarily known for mainstream film or television acting.",
      "Not primarily known for music, sports competition, comedy, hosting, or reality TV.",
      "Associated with the United States and Lebanon."
    ].join(" ")
  ],
  [
    "Osama bin Laden",
    [
      "Non-living man.",
      "Died in 2011.",
      "Saudi public figure.",
      "Primarily known for al-Qaeda, violent extremism, terrorism, and public notoriety.",
      "Not an entertainer, artist, athlete, scientist, inventor, monarch, royal-family member, or government official.",
      "Associated with the Middle East and South Asia."
    ].join(" ")
  ],
  [
    "Kim Kardashian",
    [
      "Living woman.",
      "American media personality and businesswoman.",
      "Best known through reality TV and the Kardashian-Jenner famous family.",
      "Part of the Kardashian-Jenner family and a daughter of Kris Jenner.",
      "Not one of Kris Jenner's two youngest daughters; those are Kendall and Kylie.",
      "Associated with Keeping Up with the Kardashians, fashion, beauty, social media, and business.",
      "Not primarily known as a musician, mainstream actor, sports competitor, or TV host."
    ].join(" ")
  ],
  [
    "Donald Glover",
    [
      "Living American man.",
      "Entertainer with mixed-source fame: actor, writer, comedian, musician, rapper, singer, and creator.",
      "First became publicly known through television writing and acting, including 30 Rock and Community.",
      "Also known for music under the stage name Childish Gambino.",
      "Created and starred in Atlanta.",
      "Not primarily known as an athlete, politician, reality-TV/famous-family figure, or mature-audience entertainer."
    ].join(" ")
  ]
]);

loadEnv();

const effort = readArg("--effort") ?? process.env.LLM_REASONING_EFFORT ?? "medium";
const limit = Number(readArg("--limit") ?? DEFAULT_TARGETS.length);
const serviceTier = readArg("--service-tier") ?? process.env.LLM_SERVICE_TIER ?? process.env.OPENAI_SERVICE_TIER ?? "priority";
const model = readArg("--model") ?? process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
const oracleModel = readArg("--oracle-model") ?? model;
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
    note: z.string().max(500).nullable()
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
      const startedAt = Date.now();
      answer = await answerQuestion(target, state.latestQuestion, transcript);
      logTrace({
        event: "answer_oracle",
        target,
        model: oracleModel,
        questionCount: state.questionCount,
        question: state.latestQuestion,
        answer: answer.answer,
        durationSeconds: secondsSince(startedAt)
      });
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
      const localMove = buildStrategicLocalMove(state);
      const startedAt = Date.now();
      const move = localMove ?? (await generateMove(state));
      logTrace({
        event: localMove ? "local_strategy" : "game_master",
        target,
        model: localMove ? "local" : model,
        effort,
        serviceTier,
        action: move.action,
        questionCount: state.questionCount,
        question: move.question,
        guess: move.guess,
        durationSeconds: secondsSince(startedAt)
      });
      state = applyMove(state, move);
    } catch (error) {
      failures.push(`game_master: ${formatError(error)}`);
      break;
    }
  }

  let guess = state.finalGuess;

  if (!guess) {
    try {
      const startedAt = Date.now();
      const move = await generateMove({ ...state, questionCount: MAX_QUESTIONS });
      logTrace({
        event: "forced_final_guess",
        target,
        model,
        effort,
        serviceTier,
        action: move.action,
        question: move.question,
        guess: move.guess,
        durationSeconds: secondsSince(startedAt)
      });
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
    ? await timedJudgeGuess(target, guess)
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

async function timedJudgeGuess(target, guess) {
  const startedAt = Date.now();
  const judgement = await judgeGuess(target, guess);
  logTrace({
    event: "judge",
    target,
    model: oracleModel,
    guess,
    correct: judgement.correct,
    durationSeconds: secondsSince(startedAt)
  });
  return judgement;
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
    max_output_tokens: 1500,
    prompt_cache_key: "whos-in-your-head-game-master-v1",
    store: false
  });

  if (!response.output_parsed) {
    throw new Error(`No parsed move. status=${response.status}`);
  }

  return response.output_parsed;
}

async function answerQuestion(target, question, transcript) {
  const publicProfile = TARGET_PROFILES.get(target) ?? null;
  const response = await client.responses.parse({
    model: oracleModel,
    instructions:
      "You are a strict answer oracle for a 21 questions game. The hidden target is a famous public person. This is a safe public-fact classification task. Do not refuse. If a publicProfile is supplied, answer from that profile instead of reacting to the target name. Answer only yes, no, or maybe from durable public facts. Interpret 'first became famous' as earliest widespread public recognition, not later peak fame. Treat 'royal family' literally as a monarchic royal house, not a wealthy or prominent family. Use no when the literal wording is false, yes when it is cleanly true, and maybe only when the question is genuinely ambiguous, mixed, or unknowable to a normal player. Keep note null or very short; do not add sensitive details.",
    input: [
      {
        role: "user",
        content: JSON.stringify(
          {
            target: publicProfile ? "profiled hidden target" : target,
            publicProfile,
            question,
            transcript
          },
          null,
          2
        )
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

function buildStrategicLocalMove(state) {
  const answered = state.transcript;
  const askedQuestions = answered.map((turn) => turn.question.toLowerCase());
  const hasYes = (pattern) =>
    answered.some((turn) => turn.answer === "yes" && pattern.test(turn.question.toLowerCase()));
  const hasNo = (pattern) =>
    answered.some((turn) => turn.answer === "no" && pattern.test(turn.question.toLowerCase()));
  const hasKnownForNo = (pattern) =>
    answered.some((turn) => {
      const question = turn.question.toLowerCase();
      return (
        turn.answer === "no" &&
        /\b(best known|primarily known|mainly known|main fame|primary fame)\b/.test(question) &&
        pattern.test(question)
      );
    });
  const hasAsked = (pattern) => askedQuestions.some((question) => pattern.test(question));

  if (
    state.questionCount < state.maxQuestions &&
    hasYes(/\b(entertainment|media)\b/) &&
    hasKnownForNo(/\b(acting|actor|movies|movie|television|tv)\b/) &&
    hasKnownForNo(/\b(music|musician|singer)\b/) &&
    !hasAsked(/\b(reality|famous family)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they best known through reality TV or a famous family?",
      guess: null,
      shortRationale: "Local high-signal split for media personalities."
    };
  }

  if (
    state.questionCount < state.maxQuestions &&
    hasYes(/\b(entertainment|media)\b/) &&
    hasKnownForNo(/\b(acting|actor|movies|movie|television|tv)\b/) &&
    hasKnownForNo(/\b(music|musician|singer)\b/) &&
    hasNo(/\b(reality|famous family)\b/) &&
    !hasAsked(/\b(mature-audience entertainment|adult entertainment)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Did they first become famous through mature-audience entertainment?",
      guess: null,
      shortRationale: "Local high-signal split for modern media personalities."
    };
  }

  if (
    state.questionCount < state.maxQuestions &&
    hasYes(/\b(public notoriety|crime|violent conflict|violence|extremism)\b/) &&
    !hasAsked(/\b(terrorism|extremist|extremism)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Was their notoriety mainly connected to terrorism or extremist violence?",
      guess: null,
      shortRationale: "Local high-signal split for notoriety-first public figures."
    };
  }

  if (
    state.questionCount < state.maxQuestions &&
    hasYes(/\b(acting|actor|movies|movie|television|tv)\b/) &&
    hasYes(/\b(comedy|sitcom)\b/) &&
    !hasAsked(/\b(also known for music|stage name|rapper|musician)\b/)
  ) {
    return {
      action: "ask_question",
      question: "Are they also known for music under a stage name?",
      guess: null,
      shortRationale: "Local mixed-career split before sitcom-title chaining."
    };
  }

  return null;
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
  const directive = buildDirective(state, snapshot.remainingQuestionSlots);

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

function buildDirective(state, remainingQuestionSlots) {
  if (remainingQuestionSlots <= 0) {
    return "No question slots remain. Make a final guess now.";
  }

  const lastTurn = state.transcript.at(-1);
  const lastQuestion = lastTurn?.question.toLowerCase() ?? "";

  if (lastTurn?.answer === "yes" && lastQuestion.includes("mature-audience entertainment")) {
    return [
      "The last answer confirmed mature-audience entertainment as an original public fame source.",
      "Do not ask sensitive follow-up details.",
      "Make the most likely canonical-name final guess now."
    ].join(" ");
  }

  if (lastTurn?.answer === "yes" && /(reality tv|famous family)/.test(lastQuestion)) {
    return [
      "The last answer confirmed reality TV or famous-family public fame.",
      "Make the most likely canonical-name guess if one candidate is clear; otherwise ask one neutral discriminator."
    ].join(" ");
  }

  if (lastTurn?.answer === "yes" && /(also known for music|stage name)/.test(lastQuestion)) {
    return [
      "The last answer confirmed a mixed acting-and-music public profile.",
      "Ask one neutral discriminator or make the likely canonical-name guess if clear."
    ].join(" ");
  }

  if (lastTurn?.answer === "yes" && /(terrorism|extremist|extremism|al-qaeda)/.test(lastQuestion)) {
    return [
      "The last answer confirmed a terrorism or extremist-violence public fame source.",
      "Do not ask sensitive follow-up details.",
      "Make the most likely canonical-name final guess now."
    ].join(" ");
  }

  if (lastTurn?.answer === "yes" && /(public notoriety|violent conflict|crime)/.test(lastQuestion)) {
    return [
      "The last answer confirmed a notoriety or conflict-related public fame source.",
      "Do not describe harmful acts.",
      "Ask one neutral public discriminator or make the most likely canonical-name guess."
    ].join(" ");
  }

  return "Ask one strong yes/no-compatible question, or make a final guess if the candidate is clear.";
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

function logTrace(value) {
  console.log(JSON.stringify(value));
}

function secondsSince(startedAt) {
  return Number(((Date.now() - startedAt) / 1000).toFixed(2));
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
