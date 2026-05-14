import "server-only";
import {
  MongoClient,
  type Collection,
  type CreateIndexesOptions,
  type Db,
  type Document,
  type IndexSpecification
} from "mongodb";
import type { PlayerAnswer } from "@/lib/game/ai-move";
import type { GameState } from "@/lib/game/state";
import type { GeneratedAiMove } from "./game-master";
import { describeError, logInfo, logWarn } from "./logging";

const DEFAULT_DB_NAME = "content_production";
const RESULTS_COLLECTION = "whiyh_game_results";
const EVENTS_COLLECTION = "whiyh_game_events";
const FAILURES_COLLECTION = "whiyh_game_failures";
const CONNECTION_TIMEOUT_MS = 2500;
const DEFAULT_ABANDON_AFTER_MINUTES = 5;
const TREND_BUCKET_MINUTES = 10;
const TREND_BUCKET_COUNT = 12;
const PUBLIC_STATS_CACHE_TTL_MS = 15000;
const PUBLIC_STATS_STALE_TTL_MS = 5 * 60 * 1000;

type RuntimeSnapshot = {
  source: string;
  requestedModel: string | null;
  actualModel: string | null;
  reasoningEffort: string | null;
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
  reportedMisses: number;
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
  trendStats: PublicTrendStats[];
};

export type PublicTrendStats = {
  label: string;
  bucketStart: string;
  startedGames: number;
  completedGames: number;
  correctGames: number;
  incorrectGames: number;
  reportedMisses: number;
  droppedGames: number;
  correctRate: number | null;
  missRate: number | null;
  dropRate: number | null;
};

export type PublicModelStats = {
  model: string;
  reasoningEffort: string;
  turns: number;
  guesses: number;
  completedGames: number;
  correctGames: number;
  correctRate: number | null;
  fallbackTurns: number;
  averageTurnDurationMs: number | null;
  averageModelDurationMs: number | null;
  averageReasoningTokens: number | null;
  averageCachedTokens: number | null;
};

let clientPromise: Promise<MongoClient> | null = null;
let indexesPromise: Promise<void> | null = null;
let publicStatsCache:
  | {
      expiresAt: number;
      staleAt: number;
      value: PublicGameStats | null;
    }
  | null = null;
let publicStatsPromise: Promise<PublicGameStats | null> | null = null;

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
      model: game.model,
      reasoningEffort: game.reasoningEffort,
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
          finalReasoningEffort:
            typeof finalGuessEvent?.runtime === "object" &&
            finalGuessEvent.runtime !== null &&
            "reasoningEffort" in finalGuessEvent.runtime
              ? finalGuessEvent.runtime.reasoningEffort
              : state.reasoningEffort,
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
      reasoningEffort: state.reasoningEffort,
      questionCount: state.questionCount,
      finalGuess: state.finalGuess,
      answerPath: buildAnswerPath(state),
      roundDurationMs,
      routeDurationMs
    });
  });
}

export function recordActualAnswerTelemetry({
  requestId,
  state,
  actualAnswer,
  routeDurationMs
}: {
  requestId: string;
  state: GameState;
  actualAnswer: string;
  routeDurationMs: number;
}) {
  const normalizedAnswer = normalizeActualAnswer(actualAnswer);

  void writeTelemetry("actual_answer_reported", async (db) => {
    const now = new Date();

    await resultsCollection(db).updateOne(
      { gameId: state.gameId },
      {
        $set: {
          updatedAt: now,
          correct: false,
          result: "incorrect",
          questionCount: state.questionCount,
          finalGuess: state.finalGuess,
          answerPath: buildAnswerPath(state),
          transcript: state.transcript,
          actualAnswer: normalizedAnswer,
          actualAnswerReportedAt: now,
          actualAnswerReportDurationMs: routeDurationMs
        },
        $setOnInsert: {
          gameId: state.gameId,
          createdAt: now,
          completedAt: now
        }
      },
      { upsert: true }
    );

    await eventsCollection(db).insertOne({
      eventType: "actual_answer_reported",
      requestId,
      gameId: state.gameId,
      createdAt: now,
      questionCount: state.questionCount,
      finalGuess: state.finalGuess,
      actualAnswer: normalizedAnswer,
      answerPath: buildAnswerPath(state),
      routeDurationMs
    });
  });
}

export function recordGameShareTelemetry({
  requestId,
  state,
  method,
  routeDurationMs
}: {
  requestId: string;
  state: GameState;
  method: "native" | "copy";
  routeDurationMs: number;
}) {
  void writeTelemetry("game_share", async (db) => {
    await eventsCollection(db).insertOne({
      eventType: "game_share",
      requestId,
      gameId: state.gameId,
      createdAt: new Date(),
      method,
      result: state.result,
      correct: state.result === "correct",
      model: state.model,
      reasoningEffort: state.reasoningEffort,
      questionCount: state.questionCount,
      finalGuess: state.finalGuess,
      answerPath: buildAnswerPath(state),
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

  const now = Date.now();

  if (publicStatsCache && publicStatsCache.expiresAt > now) {
    return publicStatsCache.value;
  }

  if (publicStatsCache && publicStatsCache.staleAt > now) {
    void refreshPublicStatsCache().catch((error) => {
      logWarn("game_stats_background_refresh_failed", {
        error: describeError(error)
      });
    });

    return publicStatsCache.value;
  }

  return refreshPublicStatsCache();
}

function refreshPublicStatsCache(): Promise<PublicGameStats | null> {
  if (publicStatsPromise) {
    return publicStatsPromise;
  }

  publicStatsPromise = readPublicGameStats()
    .then((value) => {
      const now = Date.now();

      publicStatsCache = {
        value,
        expiresAt: now + PUBLIC_STATS_CACHE_TTL_MS,
        staleAt: now + PUBLIC_STATS_STALE_TTL_MS
      };

      return value;
    })
    .finally(() => {
      publicStatsPromise = null;
    });

  return publicStatsPromise;
}

async function readPublicGameStats(): Promise<PublicGameStats | null> {
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
    const [abandonmentStats, trendStats] = await Promise.all([
      getAbandonmentStats(db),
      getPublicTrendStats(db)
    ]);

    return {
      startedGames: abandonmentStats.startedGames,
      totalGames: 0,
      correctGames: 0,
      incorrectGames: 0,
      reportedMisses: 0,
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
      modelStats: [],
      trendStats
    };
  }

  const [
    fallbackGameIds,
    turnStats,
    fallbackTurns,
    abandonmentStats,
    reportedMisses,
    modelStats,
    trendStats
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
    resultsCollection(db).countDocuments({
      actualAnswer: {
        $exists: true,
        $ne: null
      }
    }),
    getPublicModelStats(db),
    getPublicTrendStats(db)
  ]);

  return {
    startedGames: abandonmentStats.startedGames,
    totalGames: stats.totalGames,
    correctGames: stats.correctGames,
    incorrectGames: stats.incorrectGames,
    reportedMisses,
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
    modelStats,
    trendStats
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
  const [turnStats, resultStats] = await Promise.all([
    eventsCollection(db)
    .aggregate<
      {
        model: string;
        reasoningEffort: string;
        turns: number;
        guesses: number;
        fallbackTurns: number;
        averageTurnDurationMs: number | null;
        averageModelDurationMs: number | null;
        averageReasoningTokens: number | null;
        averageCachedTokens: number | null;
      }
    >([
      {
        $match: {
          eventType: "game_turn"
        }
      },
      {
        $group: {
          _id: {
            model: {
              $ifNull: ["$runtime.actualModel", "$runtime.requestedModel"]
            },
            reasoningEffort: {
              $ifNull: ["$runtime.reasoningEffort", "unknown"]
            }
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
            $ifNull: ["$_id.model", "unknown"]
          },
          reasoningEffort: {
            $ifNull: ["$_id.reasoningEffort", "unknown"]
          },
          turns: 1,
          guesses: 1,
          fallbackTurns: 1,
          averageTurnDurationMs: 1,
          averageModelDurationMs: 1,
          averageReasoningTokens: 1,
          averageCachedTokens: 1
        }
      },
      {
        $sort: {
          turns: -1,
          model: 1
        }
      }
    ])
    .toArray(),
    resultsCollection(db)
      .aggregate<{
        model: string;
        reasoningEffort: string;
        completedGames: number;
        correctGames: number;
        averageQuestions: number | null;
      }>([
        {
          $group: {
            _id: {
              model: {
                $ifNull: ["$finalModel", "unknown"]
              },
              reasoningEffort: {
                $ifNull: ["$finalReasoningEffort", "$reasoningEffort"]
              }
            },
            completedGames: { $sum: 1 },
            correctGames: {
              $sum: {
                $cond: ["$correct", 1, 0]
              }
            },
            averageQuestions: { $avg: "$questionCount" }
          }
        },
        {
          $project: {
            _id: 0,
            model: {
              $ifNull: ["$_id.model", "unknown"]
            },
            reasoningEffort: {
              $ifNull: ["$_id.reasoningEffort", "unknown"]
            },
            completedGames: 1,
            correctGames: 1,
            averageQuestions: 1
          }
        }
      ])
      .toArray()
  ]);

  const modelMap = new Map<string, PublicModelStats>();

  for (const turn of turnStats) {
    const key = modelStatsKey(turn.model, turn.reasoningEffort);
    modelMap.set(key, {
      model: turn.model,
      reasoningEffort: turn.reasoningEffort,
      turns: turn.turns,
      guesses: turn.guesses,
      completedGames: 0,
      correctGames: 0,
      correctRate: null,
      fallbackTurns: turn.fallbackTurns,
      averageTurnDurationMs: roundNullable(turn.averageTurnDurationMs),
      averageModelDurationMs: roundNullable(turn.averageModelDurationMs),
      averageReasoningTokens: roundNullable(turn.averageReasoningTokens),
      averageCachedTokens: roundNullable(turn.averageCachedTokens)
    });
  }

  for (const result of resultStats) {
    const key = modelStatsKey(result.model, result.reasoningEffort);
    const existing = modelMap.get(key);
    const correctRate =
      result.completedGames > 0
        ? round(result.correctGames / result.completedGames, 4)
        : null;

    modelMap.set(key, {
      model: result.model,
      reasoningEffort: result.reasoningEffort,
      turns: existing?.turns ?? 0,
      guesses: existing?.guesses ?? 0,
      completedGames: result.completedGames,
      correctGames: result.correctGames,
      correctRate,
      fallbackTurns: existing?.fallbackTurns ?? 0,
      averageTurnDurationMs: existing?.averageTurnDurationMs ?? null,
      averageModelDurationMs: existing?.averageModelDurationMs ?? null,
      averageReasoningTokens: existing?.averageReasoningTokens ?? null,
      averageCachedTokens: existing?.averageCachedTokens ?? null
    });
  }

  return Array.from(modelMap.values()).sort(
    (left, right) =>
      right.completedGames - left.completedGames ||
      right.turns - left.turns ||
      left.model.localeCompare(right.model) ||
      left.reasoningEffort.localeCompare(right.reasoningEffort)
  );
}

async function getPublicTrendStats(db: Db): Promise<PublicTrendStats[]> {
  const bucketMs = TREND_BUCKET_MINUTES * 60 * 1000;
  const currentBucketStartMs = Math.floor(Date.now() / bucketMs) * bucketMs;
  const startMs = currentBucketStartMs - (TREND_BUCKET_COUNT - 1) * bucketMs;
  const startDate = new Date(startMs);
  const abandonAfterMs = readAbandonAfterMinutes() * 60 * 1000;
  const dropLookbackStart = new Date(startMs - abandonAfterMs);
  const dropCutoffMs = Date.now() - abandonAfterMs;
  const buckets = Array.from({ length: TREND_BUCKET_COUNT }, (_, index) => ({
    label: formatTrendBucketLabel(TREND_BUCKET_COUNT - index - 1),
    bucketStart: new Date(startMs + index * bucketMs).toISOString(),
    startedGames: 0,
    completedGames: 0,
    correctGames: 0,
    incorrectGames: 0,
    reportedMisses: 0,
    droppedGames: 0,
    correctRate: null as number | null,
    missRate: null as number | null,
    dropRate: null as number | null
  }));

  const [
    startedEvents,
    completedResults,
    completedGameIds,
    latestGameEvents
  ] = await Promise.all([
    eventsCollection(db)
      .find(
        {
          eventType: "game_started",
          createdAt: {
            $gte: startDate
          }
        },
        {
          projection: {
            gameId: 1,
            createdAt: 1
          }
        }
      )
      .toArray(),
    resultsCollection(db)
      .find(
        {
          completedAt: {
            $gte: startDate
          }
        },
        {
          projection: {
            gameId: 1,
            completedAt: 1,
            correct: 1,
            actualAnswer: 1
          }
        }
      )
      .toArray(),
    resultsCollection(db).distinct("gameId", {}),
    eventsCollection(db)
      .aggregate<{
        gameId: string;
        lastEventAt: Date;
      }>([
        {
          $match: {
            gameId: {
              $ne: null
            },
            createdAt: {
              $gte: dropLookbackStart
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
      .toArray()
  ]);

  for (const event of startedEvents) {
    incrementBucket(buckets, event.createdAt, startMs, bucketMs, "startedGames");
  }

  const gameStartBucketMap = new Map<string, PublicTrendStats>();

  for (const event of startedEvents) {
    if (typeof event.gameId !== "string") {
      continue;
    }

    const bucket = getTrendBucket(buckets, event.createdAt, startMs, bucketMs);

    if (bucket) {
      gameStartBucketMap.set(event.gameId, bucket);
    }
  }

  for (const result of completedResults) {
    const bucket =
      typeof result.gameId === "string"
        ? gameStartBucketMap.get(result.gameId)
        : getTrendBucket(buckets, result.completedAt, startMs, bucketMs);

    if (!bucket) {
      continue;
    }

    bucket.completedGames += 1;

    if (result.correct === true) {
      bucket.correctGames += 1;
    } else {
      bucket.incorrectGames += 1;
    }

    if (typeof result.actualAnswer === "string" && result.actualAnswer.trim()) {
      bucket.reportedMisses += 1;
    }
  }

  const completedGameIdSet = new Set(completedGameIds);

  for (const game of latestGameEvents) {
    if (completedGameIdSet.has(game.gameId)) {
      continue;
    }

    if (!(game.lastEventAt instanceof Date) || game.lastEventAt.getTime() >= dropCutoffMs) {
      continue;
    }

    const bucket = gameStartBucketMap.get(game.gameId);

    if (bucket) {
      bucket.droppedGames += 1;
    }
  }

  return buckets.map((bucket) => {
    const settledGames = bucket.completedGames + bucket.droppedGames;

    return {
      ...bucket,
      correctRate:
        bucket.startedGames > 0 && settledGames > 0
          ? round(bucket.correctGames / bucket.startedGames, 4)
          : null,
      missRate:
        bucket.startedGames > 0 && settledGames > 0
          ? round(bucket.reportedMisses / bucket.startedGames, 4)
          : null,
      dropRate:
        bucket.startedGames > 0 && settledGames > 0
          ? round(bucket.droppedGames / bucket.startedGames, 4)
          : null
    };
  });
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
    reasoningEffort: generated.reasoningEffort,
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

function normalizeActualAnswer(actualAnswer: string) {
  return actualAnswer.replace(/\s+/g, " ").trim().slice(0, 160);
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
    indexesPromise = (async () => {
      const results = resultsCollection(db);
      const events = eventsCollection(db);
      const failures = failuresCollection(db);

      await createTelemetryIndex(results, { gameId: 1 });
      await createTelemetryIndex(results, { completedAt: -1 });
      await createTelemetryIndex(results, { actualAnswer: 1 });
      await createTelemetryIndex(results, { actualAnswerReportedAt: -1 });
      await createTelemetryIndex(results, { finalModel: 1, finalReasoningEffort: 1 });
      await createTelemetryIndex(events, { gameId: 1, createdAt: 1 });
      await createTelemetryIndex(events, { createdAt: -1 });
      await createTelemetryIndex(events, { eventType: 1, createdAt: -1 });
      await createTelemetryIndex(events, { eventType: 1, gameId: 1, createdAt: -1 });
      await createTelemetryIndex(events, { "runtime.source": 1, gameId: 1 });
      await createTelemetryIndex(failures, { gameId: 1, createdAt: 1 });
      await createTelemetryIndex(failures, { createdAt: -1 });
    })();
  }

  return indexesPromise;
}

async function createTelemetryIndex(
  collection: Collection<Document>,
  indexSpec: IndexSpecification,
  options?: CreateIndexesOptions
) {
  try {
    await collection.createIndex(indexSpec, options);
  } catch (error) {
    if (isCollectionAlreadyExistsError(error)) {
      logWarn("game_telemetry_index_skipped", {
        collection: collection.collectionName,
        indexSpec
      });
      return;
    }

    throw error;
  }
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

function isCollectionAlreadyExistsError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeMongoError = error as {
    code?: unknown;
    message?: unknown;
  };

  return (
    maybeMongoError.code === 48 ||
    (typeof maybeMongoError.message === "string" &&
      maybeMongoError.message.includes("already exists"))
  );
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

function roundNullable(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

type TrendCountKey = "startedGames" | "reportedMisses" | "droppedGames";

function incrementBucket(
  buckets: PublicTrendStats[],
  value: unknown,
  startMs: number,
  bucketMs: number,
  key: TrendCountKey
) {
  const bucket = getTrendBucket(buckets, value, startMs, bucketMs);

  if (bucket) {
    bucket[key] += 1;
  }
}

function getTrendBucket(
  buckets: PublicTrendStats[],
  value: unknown,
  startMs: number,
  bucketMs: number
) {
  const date = readTelemetryDate(value);

  if (!date) {
    return null;
  }

  const bucketIndex = Math.floor((date.getTime() - startMs) / bucketMs);

  if (bucketIndex < 0 || bucketIndex >= buckets.length) {
    return null;
  }

  return buckets[bucketIndex];
}

function readTelemetryDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const date = new Date(value);

    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function formatTrendBucketLabel(bucketsAgo: number) {
  if (bucketsAgo === 0) {
    return "now";
  }

  return `${bucketsAgo * TREND_BUCKET_MINUTES}m ago`;
}

function modelStatsKey(model: string, reasoningEffort: string) {
  return `${model}\n${reasoningEffort}`;
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
