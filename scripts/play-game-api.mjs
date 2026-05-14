#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_STATE_FILE = "tmp/api-play-state.json";
const ANSWERS = new Set(["yes", "no", "maybe"]);

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? "show";
const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
const stateFile = args.stateFile ?? DEFAULT_STATE_FILE;

try {
  if (command === "start") {
    await startGame();
  } else if (command === "answer") {
    await answerGame(args._[1]);
  } else if (command === "judge") {
    await judgeGuess(args._[1]);
  } else if (command === "show") {
    await showGame();
  } else if (command === "reset") {
    await resetGame();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    ) + "\n"
  );
  process.exitCode = 1;
}

async function startGame() {
  const data = await postTurn({
    action: "start",
    ...(args.model ? { model: args.model } : {})
  });
  await saveState(data.game);
  printTurn(data, "started");
}

async function answerGame(answer) {
  if (!ANSWERS.has(answer)) {
    throw new Error("Usage: npm run play:api -- answer yes|no|maybe");
  }

  const game = await loadState();
  const data = await postTurn({
    action: "answer",
    state: game,
    answer
  });

  await saveState(data.game);
  printTurn(data, "answered", { answer });
}

async function judgeGuess(value) {
  if (value !== "correct" && value !== "incorrect") {
    throw new Error("Usage: npm run play:api -- judge correct|incorrect");
  }

  const game = await loadState();
  const data = await postTurn({
    action: "judge_guess",
    state: game,
    correct: value === "correct"
  });

  await saveState(data.game);
  printTurn(data, "judged", { correct: value === "correct" });
}

async function showGame() {
  const game = await loadState();
  printGame(game, "current");
}

async function resetGame() {
  await rm(stateFile, { force: true });
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        event: "reset",
        stateFile
      },
      null,
      2
    ) + "\n"
  );
}

async function postTurn(body) {
  const response = await fetch(`${baseUrl}/api/game/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  return data;
}

async function loadState() {
  const contents = await readFile(stateFile, "utf8").catch(() => null);

  if (!contents) {
    throw new Error("No saved API game. Run `npm run play:api -- start` first.");
  }

  return JSON.parse(contents);
}

async function saveState(game) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(game, null, 2)}\n`);
}

function printTurn(data, event, extra = {}) {
  printGame(data.game, event, {
    ...extra,
    move: data.move ?? null,
    runtime: data.runtime ?? null
  });
}

function printGame(game, event, extra = {}) {
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        event,
        baseUrl,
        stateFile,
        game: summarizeGame(game),
        ...extra
      },
      null,
      2
    ) + "\n"
  );
}

function summarizeGame(game) {
  return {
    gameId: game.gameId,
    phase: game.phase,
    questionCount: game.questionCount,
    model: game.model,
    reasoningEffort: game.reasoningEffort,
    transcriptLength: game.transcript.length,
    latestQuestion: game.latestQuestion,
    finalGuess: game.finalGuess,
    result: game.result,
    lastTurn: game.transcript.at(-1) ?? null,
    modelResponseId: game.modelResponseId
  };
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--base-url") {
      parsed.baseUrl = rawArgs[index + 1];
      index += 1;
    } else if (arg === "--state-file") {
      parsed.stateFile = rawArgs[index + 1];
      index += 1;
    } else if (arg === "--model") {
      parsed.model = rawArgs[index + 1];
      index += 1;
    } else {
      parsed._.push(arg);
    }
  }

  return parsed;
}
