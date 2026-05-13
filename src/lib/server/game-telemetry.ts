import "server-only";
import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import type { PlayerAnswer } from "@/lib/game/ai-move";
import type { GameState } from "@/lib/game/state";
import type { GeneratedAiMove } from "./game-master";
import { describeError, logInfo, logWarn } from "./logging";

const DEFAULT_DB_NAME = "content_production";
const RESULTS_COLLECTION = "whiyh_game_results";
const EVENTS_COLLECTION = "whiyh_game_events";
const FAILURES_COLLECTION = "whiyh_game_failures";
const CONNECTION_TIMEOUT_MS = 2500;
const DEFAULT_ABANDON_AFTER_MINUTES = 20;

type RuntimeSnapshot = {
  source: string;
  requestedModel: string | null;
  actualModel: string | null;
  requestedServiceTier: string | null;
  actualServiceTier: string | null;
  promptCacheKey: string | null;
  responseId: string | null;
  modelDurationMs: number | null;
  usage: ReturnType<typeof summarizeUsage>;
};

export type PublicGameStats = {
  startedGames: number;
  totalGames: number;
  correctGames: number;
  incorrectGames: number;
  abandonedGames: number;
  activeGames: number;
  completionRate: number | null;
  correctRate: number | null;
  averageQuestions: number | null;
  averageRoundDurationMs: number | null;
  averageResultDurationMs: number | null;
  totalTurns: number;
  averageTurnDurationMs: number | null;
  averageModelDurationMs: number | null;
  averageReasoningTokens: number | null;
  averageCachedTokens: number | null;
  fallbackGames: number;
  fallbackTurns: number;
  modelStats: PublicModelStats[];
};

export type PublicModelStats = {
  model: string;
  turns: number;
  guesses: number;
  fallbackTurns: number;
  averageTurnDurationMs: number | null;
  averageModelDurationMs: number | null;
  averageReasoningTokens: number | null;
  averageCachedTokens: number | null;
};

let clientPromise: Promise<MongoClient> | null = null;
let indexesPromise: Promise<void> | null = null;

export function isGameTelemetryEnabled() {
  if (process.env.GAME_TELEMETRY_ENABLED?.trim().toLowerCase() === "false") {
    return false;
  }

  return Boolean(getMongoUri());
}

export function recordGameStartedTelemetry({
  requestId,
  game,
  routeDurationMs
}: {
  requestId: string;
  game: GameState;
  routeDurationMs: number;
}) {
  void writeTelemetry("game_started", async (db) => {
    await eventsCollection(db).insertOne({
      eventType: "game_started",
      requestId,
      gameId: game.gameId,
      createdAt: new Date(),
      questionCount: game.questionCount,
      routeDurationMs
    });
  });
}

export function recordGameTurnTelemetry({
  requestId,
  game,
  answer,
  generated,
  nextGame,
  source,
  routeDurationMs
}: {
  requestId: string;
  game: GameState;
  answer: PlayerAnswer;
  generated: GeneratedAiMove;
  nextGame: GameState;
  source: string;
  routeDurationMs: number;
}) {
  void writeTelemetry("game_turn", async (db) => {
    await eventsCollection(db).insertOne({
      eventType: "game_turn",
      requestId,
      gameId: game.gameId,
      createdAt: new Date(),
      answer,
      answerPath: buildAnswerPath(game),
      answeredQuestionCount: game.transcript.length,
      questionCount: nextGame.questionCount,
      latestQuestion: game.transcript.at(-1)?.question ?? null,
      move: {
        action: generated.move.action,
        question: generated.move.question,
        guess: generated.move.guess
      },
      nextPhase: nextGame.phase,
      finalGuess: nextGame.finalGuess,
      routeDurationMs,
      runtime: buildRuntimeSnapshot(source, generated)
    });
  });
}

export function recordGameResultTelemetry({
  requestId,
  state,
  correct,
  resultGame,
  routeDurationMs
}: {
  requestId: string;
  state: GameState;
  correct: boolean;
  resultGame: GameState;
  routeDurationMs: number;
}) {
  void writeTelemetry("game_result", async (db) => {
    const now = new Date();
    const startedAt = await eventsCollection(db).findOne(
      {
        gameId: state.gameId,
        eventType: "game_started"
      },
      {
        sort: {
          createdAt: 1
        },
        projection: {
          createdAt: 1
        }
      }
    );
    const roundDurationMs =
      startedAt?.createdAt instanceof Date
        ? now.getTime() - startedAt.createdAt.getTime()
        : null;
    const document = {
      gameId: state.gameId,
      completedAt: now,
      updatedAt: now,
      correct,
      questionCount: state.questionCount,
      finalGuess: state.finalGuess,
      answerPath: buildAnswerPath(state),
      transcript: state.transcript,
      roundDurationMs,
      routeDurationMs,
      result: resultGame.result
    };

    const [turnSummary, finalGuessEvent] = await Promise.all([
      getGameTurnSummary(db, state.gameId),
      eventsCollection(db).findOne(
        {
          gameId: state.gameId,
          eventType: "game_turn",
          "move.action": "make_guess"
        },
        {
          sort: {
            createdAt: -1
          }
        }
      )
    ]);

    await resultsCollection(db).updateOne(
      { gameId: state.gameId },
      {
        $set: {
          ...document,
          telemetry: turnSummary,
          finalModel:
            typeof finalGuessEvent?.runtime === "object" &&
            finalGuessEvent.runtime !== null &&
            "actualModel" in finalGuessEvent.runtime
              ? finalGuessEvent.runtime.actualModel
              : null,
          finalMoveSource:
            typeof finalGuessEvent?.runtime === "object" &&
            finalGuessEvent.runtime !== null &&
            "source" in finalGuessEvent.runtime
              ? finalGuessEvent.runtime.source
              : null
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      { upsert: true }
    );

    await eventsCollection(db).insertOne({
      eventType: "game_result",
      requestId,
      gameId: state.gameId,
      createdAt: now,
      correct,
      questionCount: state.questionCount,
      finalGuess: state.finalGuess,
      answerPath: buildAnswerPath(state),
      roundDurationMs,
      routeDurationMs
    });
  });
}

export function recordGameFailureTelemetry({
  requestId,
  action,
  state,
  code,
  error,
  routeDurationMs,
  body
}: {
  requestId: string;
  action: string | null;
  state: GameState | null;
  code: string;
  error: unknown;
  routeDurationMs: number;
  body?: unknown;
}) {
  void writeTelemetry("game_failure", async (db) => {
    await failuresCollection(db).insertOne({
      eventType: "game_failure",
      requestId,
      gameId: state?.gameId ?? null,
      createdAt: new Date(),
      action,
      code,
      error: describeError(error),
      phase: state?.phase ?? null,
      questionCount: state?.questionCount ?? null,
      latestQuestion: state?.latestQuestion ?? null,
      finalGuess: state?.finalGuess ?? null,
      answerPath: state ? buildAnswerPath(state) : null,
      transcript: state?.transcript ?? null,
      routeDurationMs,
      body: sanitizeFailureBody(body)
    });
  });
}

export async function getPublicGameStats(): Promise<PublicGameStats | null> {
  if (!isGameTelemetryEnabled()) {
    return null;
  }

  const db = await getTelemetryDb();
  await ensureIndexes(db);

  const stats = await resultsCollection(db)
    .aggregate<{
      totalGames: number;
      correctGames: number;
      incorrectGames: number;
      averageQuestions: number | null;
      averageRoundDurationMs: number | null;
      averageDurationMs: number | null;
    }>([
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          correctGames: {
            $sum: {
              $cond: ["$correct", 1, 0]
            }
          },
          incorrectGames: {
            $sum: {
              $cond: ["$correct", 0, 1]
            }
          },
          averageQuestions: { $avg: "$questionCount" },
          averageRoundDurationMs: { $avg: "$roundDurationMs" },
          averageDurationMs: { $avg: "$routeDurationMs" }
        }
      }
    ])
    .next();

  if (!stats) {
    const abandonmentStats = await getAbandonmentStats(db);

    return {
      startedGames: abandonmentStats.startedGames,
      totalGames: 0,
      correctGames: 0,
      incorrectGames: 0,
      abandonedGames: abandonmentStats.abandonedGames,
      activeGames: abandonmentStats.activeGames,
      completionRate: null,
      correctRate: null,
      averageQuestions: null,
      averageRoundDurationMs: null,
      averageResultDurationMs: null,
      totalTurns: 0,
      averageTurnDurationMs: null,
      averageModelDurationMs: null,
      averageReasoningTokens: null,
      averageCachedTokens: null,
      fallbackGames: 0,
      fallbackTurns: 0,
      modelStats: []
    };
  }

  const [
    fallbackGameIds,
    turnStats,
    fallbackTurns,
    abandonmentStats,
    modelStats
  ] = await Promise.all([
    eventsCollection(db)
      .distinct("gameId", {
        "runtime.source": "model_move_content_filter_fallback"
      })
      .then((gameIds) => gameIds.length),
    eventsCollection(db)
      .aggregate<{
        totalTurns: number;
        averageTurnDurationMs: number | null;
        averageModelDurationMs: number | null;
        averageReasoningTokens: number | null;
        averageCachedTokens: number | null;
      }>([
        {
          $match: {
            eventType: "game_turn"
          }
        },
        {
          $group: {
            _id: null,
            totalTurns: { $sum: 1 },
            averageTurnDurationMs: { $avg: "$routeDurationMs" },
            averageModelDurationMs: { $avg: "$runtime.modelDurationMs" },
            averageReasoningTokens: { $avg: "$runtime.usage.reasoningTokens" },
            averageCachedTokens: { $avg: "$runtime.usage.cachedTokens" }
          }
        }
      ])
      .next(),
    eventsCollection(db).countDocuments({
      "runtime.source": "model_move_content_filter_fallback"
    }),
    getAbandonmentStats(db),
    getPublicModelStats(db)
  ]);

  return {
    startedGames: abandonmentStats.startedGames,
    totalGames: stats.totalGames,
    correctGames: stats.correctGames,
    incorrectGames: stats.incorrectGames,
    abandonedGames: abandonmentStats.abandonedGames,
    activeGames: abandonmentStats.activeGames,
    completionRate:
      abandonmentStats.startedGames > 0
        ? round(stats.totalGames / abandonmentStats.startedGames, 4)
        : null,
    correctRate:
      stats.totalGames > 0 ? round(stats.correctGames / stats.totalGames, 4) : null,
    averageQuestions:
      stats.averageQuestions === null ? null : round(stats.averageQuestions, 2),
    averageRoundDurationMs:
      stats.averageRoundDurationMs === null
        ? null
        : Math.round(stats.averageRoundDurationMs),
    averageResultDurationMs:
      stats.averageDurationMs === null ? null : Math.round(stats.averageDurationMs),
    totalTurns: turnStats?.totalTurns ?? 0,
    averageTurnDurationMs:
      turnStats?.averageTurnDurationMs == null
        ? null
        : Math.round(turnStats.averageTurnDurationMs),
    averageModelDurationMs:
      turnStats?.averageModelDurationMs == null
        ? null
        : Math.round(turnStats.averageModelDurationMs),
    averageReasoningTokens:
      turnStats?.averageReasoningTokens == null
        ? null
        : Math.round(turnStats.averageReasoningTokens),
    averageCachedTokens:
      turnStats?.averageCachedTokens == null
        ? null
        : Math.round(turnStats.averageCachedTokens),
    fallbackGames: fallbackGameIds,
    fallbackTurns,
    modelStats
  };
}

async function getGameTurnSummary(db: Db, gameId: string) {
  const [summary] = await eventsCollection(db)
    .aggregate<{
      turnCount: number;
      fallbackTurnCount: number;
      totalInputTokens: number;
      totalCachedTokens: number;
      totalOutputTokens: number;
      totalReasoningTokens: number;
      totalTokens: number;
      averageTurnDurationMs: number | null;
      averageModelDurationMs: number | null;
    }>([
      {
        $match: {
          gameId,
          eventType: "game_turn"
        }
      },
      {
        $group: {
          _id: null,
          turnCount: { $sum: 1 },
          fallbackTurnCount: {
            $sum: {
              $cond: [
                { $eq: ["$runtime.source", "model_move_content_filter_fallback"] },
                1,
                0
              ]
            }
          },
          totalInputTokens: { $sum: "$runtime.usage.inputTokens" },
          totalCachedTokens: { $sum: "$runtime.usage.cachedTokens" },
          totalOutputTokens: { $sum: "$runtime.usage.outputTokens" },
          totalReasoningTokens: { $sum: "$runtime.usage.reasoningTokens" },
          totalTokens: { $sum: "$runtime.usage.totalTokens" },
          averageTurnDurationMs: { $avg: "$routeDurationMs" },
          averageModelDurationMs: { $avg: "$runtime.modelDurationMs" }
        }
      }
    ])
    .toArray();

  return (
    summary ?? {
      turnCount: 0,
      fallbackTurnCount: 0,
      totalInputTokens: 0,
      totalCachedTokens: 0,
      totalOutputTokens: 0,
      totalReasoningTokens: 0,
      totalTokens: 0,
      averageTurnDurationMs: null,
      averageModelDurationMs: null
    }
  );
}

async function getPublicModelStats(db: Db): Promise<PublicModelStats[]> {
  return eventsCollection(db)
    .aggregate<PublicModelStats>([
      {
        $match: {
          eventType: "game_turn"
        }
      },
      {
        $group: {
          _id: {
            $ifNull: ["$runtime.actualModel", "$runtime.requestedModel"]
          },
          turns: { $sum: 1 },
          guesses: {
            $sum: {
              $cond: [{ $eq: ["$move.action", "make_guess"] }, 1, 0]
            }
          },
          fallbackTurns: {
            $sum: {
              $cond: [
                { $eq: ["$runtime.source", "model_move_content_filter_fallback"] },
                1,
                0
              ]
            }
          },
          averageTurnDurationMs: { $avg: "$routeDurationMs" },
          averageModelDurationMs: { $avg: "$runtime.modelDurationMs" },
          averageReasoningTokens: { $avg: "$runtime.usage.reasoningTokens" },
          averageCachedTokens: { $avg: "$runtime.usage.cachedTokens" }
        }
      },
      {
        $project: {
          _id: 0,
          model: {
            $ifNull: ["$_id", "unknown"]
          },
          turns: 1,
          guesses: 1,
          fallbackTurns: 1,
          averageTurnDurationMs: { $round: ["$averageTurnDurationMs", 0] },
          averageModelDurationMs: { $round: ["$averageModelDurationMs", 0] },
          averageReasoningTokens: { $round: ["$averageReasoningTokens", 0] },
          averageCachedTokens: { $round: ["$averageCachedTokens", 0] }
        }
      },
      {
        $sort: {
          turns: -1,
          model: 1
        }
      }
    ])
    .toArray();
}

async function getAbandonmentStats(db: Db) {
  const abandonAfterMs = readAbandonAfterMinutes() * 60 * 1000;
  const cutoff = new Date(Date.now() - abandonAfterMs);
  const completedGameIds = new Set(
    await resultsCollection(db).distinct("gameId", {})
  );
  const startedGames = await eventsCollection(db)
    .aggregate<{
      gameId: string;
      lastEventAt: Date;
    }>([
      {
        $match: {
          gameId: {
            $ne: null
          }
        }
      },
      {
        $group: {
          _id: "$gameId",
          lastEventAt: {
            $max: "$createdAt"
          }
        }
      },
      {
        $project: {
          _id: 0,
          gameId: "$_id",
          lastEventAt: 1
        }
      }
    ])
    .toArray();

  let abandonedGames = 0;
  let activeGames = 0;

  for (const startedGame of startedGames) {
    if (completedGameIds.has(startedGame.gameId)) {
      continue;
    }

    if (startedGame.lastEventAt < cutoff) {
      abandonedGames += 1;
    } else {
      activeGames += 1;
    }
  }

  return {
    startedGames: startedGames.length,
    abandonedGames,
    activeGames
  };
}

function buildRuntimeSnapshot(source: string, generated: GeneratedAiMove): RuntimeSnapshot {
  return {
    source,
    requestedModel: generated.requestedModel,
    actualModel: generated.actualModel,
    requestedServiceTier: generated.requestedServiceTier,
    actualServiceTier: generated.actualServiceTier,
    promptCacheKey: generated.promptCacheKey,
    responseId: generated.responseId,
    modelDurationMs: generated.durationMs,
    usage: summarizeUsage(generated.usage)
  };
}

function summarizeUsage(usage: GeneratedAiMove["usage"]) {
  if (!usage) {
    return null;
  }

  return {
    inputTokens: usage.input_tokens,
    cachedTokens: usage.input_tokens_details.cached_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    totalTokens: usage.total_tokens
  };
}

function buildAnswerPath(state: GameState) {
  return state.transcript
    .map((turn) => {
      if (turn.answer === "yes") {
        return "Y";
      }

      if (turn.answer === "no") {
        return "N";
      }

      return "M";
    })
    .join("");
}

async function writeTelemetry(name: string, writer: (db: Db) => Promise<void>) {
  if (!isGameTelemetryEnabled()) {
    return;
  }

  try {
    const db = await getTelemetryDb();
    await ensureIndexes(db);
    await writer(db);
  } catch (error) {
    logWarn("game_telemetry_write_failed", {
      name,
      error: describeError(error)
    });
  }
}

async function getTelemetryDb(): Promise<Db> {
  const uri = getMongoUri();

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!clientPromise) {
    clientPromise = MongoClient.connect(uri, {
      appName: "whos-in-your-head",
      retryWrites: false,
      maxIdleTimeMS: 120000,
      connectTimeoutMS: CONNECTION_TIMEOUT_MS,
      serverSelectionTimeoutMS: CONNECTION_TIMEOUT_MS,
      tlsAllowInvalidCertificates:
        process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES === "true"
    });
  }

  const client = await clientPromise;
  return client.db(getDbName());
}

async function ensureIndexes(db: Db) {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      resultsCollection(db).createIndex({ gameId: 1 }, { unique: true }),
      resultsCollection(db).createIndex({ completedAt: -1 }),
      eventsCollection(db).createIndex({ gameId: 1, createdAt: 1 }),
      eventsCollection(db).createIndex({ createdAt: -1 }),
      failuresCollection(db).createIndex({ gameId: 1, createdAt: 1 }),
      failuresCollection(db).createIndex({ createdAt: -1 })
    ]).then(() => undefined);
  }

  return indexesPromise;
}

function resultsCollection(db: Db): Collection<Document> {
  return db.collection(RESULTS_COLLECTION);
}

function eventsCollection(db: Db): Collection<Document> {
  return db.collection(EVENTS_COLLECTION);
}

function failuresCollection(db: Db): Collection<Document> {
  return db.collection(FAILURES_COLLECTION);
}

function getMongoUri() {
  return process.env.MONGODB_URI?.trim() || "";
}

function getDbName() {
  return (
    process.env.GAME_TELEMETRY_MONGODB_DB?.trim() ||
    process.env.MONGODB_DB_NAME?.trim() ||
    DEFAULT_DB_NAME
  );
}

function readAbandonAfterMinutes() {
  const raw = process.env.GAME_STATS_ABANDON_AFTER_MINUTES?.trim();
  const value = raw ? Number(raw) : DEFAULT_ABANDON_AFTER_MINUTES;

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_ABANDON_AFTER_MINUTES;
  }

  return value;
}

function sanitizeFailureBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;

  return {
    action: typeof record.action === "string" ? record.action : null,
    answer: typeof record.answer === "string" ? record.answer : null,
    correct: typeof record.correct === "boolean" ? record.correct : null
  };
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function logGameTelemetryStatus() {
  logInfo("game_telemetry_status", {
    enabled: isGameTelemetryEnabled(),
    dbName: getDbName(),
    resultsCollection: RESULTS_COLLECTION,
    eventsCollection: EVENTS_COLLECTION,
    failuresCollection: FAILURES_COLLECTION
  });
}
