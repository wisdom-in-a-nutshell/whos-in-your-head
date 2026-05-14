#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const SCHEMA_VERSION = "1.0";
const DEFAULT_DB_NAME = "content_production";
const RESULTS_COLLECTION = "whiyh_game_results";
const EVENTS_COLLECTION = "whiyh_game_events";
const DEFAULT_LIMIT = 50;

const EXIT_GENERIC = 1;
const EXIT_USAGE = 2;
const EXIT_AUTH = 3;
const EXIT_DEPENDENCY = 4;
const EXIT_TIMEOUT = 5;

const startedAt = Date.now();
const requestId = randomUUID();

try {
  loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  const command = args.command ?? "misses";
  let data;

  if (command === "misses") {
    data = await readRecentMisses(args);
  } else if (command === "model-stats") {
    data = await readModelStats(args);
  } else if (command === "model-results") {
    data = await readModelResults(args);
  } else if (command === "token-stats") {
    data = await readTokenStats(args);
  } else if (command === "summary") {
    data = await readSummary(args);
  } else {
    throw usageError(`Unknown command: ${command}`);
  }

  emit(args, {
    command: `game-telemetry.${command}`,
    status: "ok",
    data,
    error: null
  });
} catch (error) {
  const cliError = normalizeError(error);
  emit(cliError.args ?? { output: "json" }, {
    command: "game-telemetry.misses",
    status: "error",
    data: null,
    error: {
      code: cliError.code,
      message: cliError.message,
      retryable: cliError.retryable,
      hint: cliError.hint
    }
  });
  process.exit(cliError.exitCode);
}

function parseArgs(argv) {
  const args = {
    command: "misses",
    output: "json",
    noInput: false,
    minutes: 30,
    limit: DEFAULT_LIMIT,
    timeoutMs: 5000,
    groupBy: "none",
    model: null,
    includeTranscript: false
  };

  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) {
    args.command = rest.shift();
  }

  while (rest.length > 0) {
    const arg = rest.shift();

    if (arg === "--json") {
      args.output = "json";
      continue;
    }
    if (arg === "--plain") {
      args.output = "plain";
      continue;
    }
    if (arg === "--no-input") {
      args.noInput = true;
      continue;
    }
    if (arg === "--minutes") {
      args.minutes = readPositiveInteger(rest, arg);
      continue;
    }
    if (arg === "--limit") {
      args.limit = readPositiveInteger(rest, arg);
      continue;
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = readPositiveInteger(rest, arg);
      continue;
    }
    if (arg === "--group-by") {
      args.groupBy = readEnum(rest, arg, ["none", "reported-answer", "model"]);
      continue;
    }
    if (arg === "--model") {
      args.model = readString(rest, arg);
      continue;
    }
    if (arg === "--include-transcript") {
      args.includeTranscript = true;
      continue;
    }

    throw usageError(`Unknown option: ${arg}`);
  }

  return args;
}

function readPositiveInteger(rest, flag) {
  const rawValue = rest.shift();
  if (!rawValue) {
    throw usageError(`${flag} requires a value`);
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw usageError(`${flag} must be a positive integer`);
  }

  return value;
}

function readString(rest, flag) {
  const value = rest.shift();
  if (!value?.trim()) {
    throw usageError(`${flag} requires a value`);
  }

  return value.trim();
}

function readEnum(rest, flag, values) {
  const value = readString(rest, flag);
  if (!values.includes(value)) {
    throw usageError(`${flag} must be one of: ${values.join(", ")}`);
  }

  return value;
}

async function readRecentMisses(args) {
  return withTelemetryDb(args, async ({ db, dbName, since, until }) => {
    const results = db.collection(RESULTS_COLLECTION);
    const events = db.collection(EVENTS_COLLECTION);
    const query = {
      ...reportedAnswerQuery(),
      actualAnswerReportedAt: {
        $gte: since,
        $lte: until
      },
      ...modelResultFilter(args.model)
    };

    const [misses, windowReportedMisses, eventCount, totalReportedMisses, groups] =
      await Promise.all([
        results
          .find(query, {
            projection: {
              _id: 0,
              gameId: 1,
              actualAnswer: 1,
              actualAnswerReportedAt: 1,
              completedAt: 1,
              finalGuess: 1,
              questionCount: 1,
              finalModel: 1,
              answerPath: 1,
              ...transcriptProjection(args)
            },
            sort: {
              actualAnswerReportedAt: -1
            },
            limit: args.limit
          })
          .toArray(),
        results.countDocuments(query),
        events.countDocuments({
          eventType: "actual_answer_reported",
          createdAt: {
            $gte: since,
            $lte: until
          }
        }),
        results.countDocuments(reportedAnswerQuery()),
        readMissGroups(results, query, args)
      ]);

    return {
      window: buildWindow(args, since, until, "actualAnswerReportedAt"),
      db: buildDbInfo(dbName),
      count: windowReportedMisses,
      event_count: args.model ? windowReportedMisses : eventCount,
      event_count_basis: args.model
        ? "results.actualAnswerReportedAt+finalModel"
        : "events.actual_answer_reported.createdAt",
      total_reported_misses: totalReportedMisses,
      limit: args.limit,
      model_filter: args.model,
      include_transcript: args.includeTranscript,
      group_by: args.groupBy,
      groups,
      misses: misses.map((miss) => formatMiss(miss, args))
    };
  });
}

async function readMissGroups(results, query, args) {
  if (args.groupBy === "none") {
    return [];
  }

  const groupId =
    args.groupBy === "model"
      ? { $ifNull: ["$finalModel", "unknown"] }
      : { $toLower: actualAnswerTextExpression() };

  const answerAccumulator =
    args.groupBy === "reported-answer"
      ? {
          reported_answer: {
            $first: actualAnswerTextExpression()
          }
        }
      : {};

  return results
    .aggregate([
      {
        $match: query
      },
      {
        $sort: {
          actualAnswerReportedAt: -1
        }
      },
      {
        $group: {
          _id: groupId,
          count: {
            $sum: 1
          },
          latest_reported_at: {
            $first: "$actualAnswerReportedAt"
          },
          final_guess_examples: {
            $addToSet: "$finalGuess"
          },
          ...answerAccumulator
        }
      },
      {
        $project: {
          _id: 0,
          key: "$_id",
          reported_answer: 1,
          count: 1,
          latest_reported_at: 1,
          final_guess_examples: {
            $slice: ["$final_guess_examples", 5]
          }
        }
      },
      {
        $sort: {
          count: -1,
          latest_reported_at: -1,
          key: 1
        }
      },
      {
        $limit: args.limit
      }
    ])
    .toArray();
}

async function readModelStats(args) {
  return withTelemetryDb(args, async ({ db, dbName, since, until }) => {
    const results = db.collection(RESULTS_COLLECTION);
    const stats = await results
      .aggregate([
        {
          $match: {
            completedAt: {
              $gte: since,
              $lte: until
            }
          }
        },
        {
          $group: modelStatsGroupStage()
        },
        {
          $project: modelStatsProjectStage()
        },
        {
          $sort: {
            reported_misses: -1,
            incorrect_games: -1,
            total_games: -1,
            model: 1
          }
        },
        {
          $limit: args.limit
        }
      ])
      .toArray();

    return {
      window: buildWindow(args, since, until, "completedAt"),
      db: buildDbInfo(dbName),
      limit: args.limit,
      models: stats
    };
  });
}

async function readModelResults(args) {
  if (!args.model) {
    throw usageError(
      "--model is required for model-results",
      "Run `npm run telemetry -- model-results --model gemini --json --minutes 60`."
    );
  }

  return withTelemetryDb(args, async ({ db, dbName, since, until }) => {
    const results = db.collection(RESULTS_COLLECTION);
    const modelRegex = new RegExp(escapeRegex(args.model), "i");
    const query = {
      finalModel: modelRegex,
      completedAt: {
        $gte: since,
        $lte: until
      }
    };

    const [stats, recent_results] = await Promise.all([
      results
        .aggregate([
          {
            $match: query
          },
          {
            $group: modelStatsGroupStage()
          },
          {
            $project: modelStatsProjectStage()
          },
          {
            $sort: {
              total_games: -1,
              model: 1
            }
          }
        ])
        .toArray(),
      results
        .find(query, {
          projection: {
            _id: 0,
            gameId: 1,
            completedAt: 1,
            correct: 1,
            actualAnswer: 1,
            actualAnswerReportedAt: 1,
            finalGuess: 1,
            questionCount: 1,
            finalModel: 1,
            answerPath: 1,
            ...transcriptProjection(args)
          },
          sort: {
            completedAt: -1
          },
          limit: args.limit
        })
        .toArray()
    ]);

    return {
      window: buildWindow(args, since, until, "completedAt"),
      db: buildDbInfo(dbName),
      model_filter: args.model,
      limit: args.limit,
      include_transcript: args.includeTranscript,
      stats,
      recent_results: recent_results.map((result) => formatResult(result, args))
    };
  });
}

async function readTokenStats(args) {
  return withTelemetryDb(args, async ({ db, dbName, since, until }) => {
    const events = db.collection(EVENTS_COLLECTION);
    const query = {
      eventType: "game_turn",
      createdAt: {
        $gte: since,
        $lte: until
      },
      ...modelEventFilter(args.model)
    };

    const [models, recentTurns] = await Promise.all([
      events
        .aggregate([
          {
            $match: query
          },
          {
            $group: tokenStatsGroupStage()
          },
          {
            $project: tokenStatsProjectStage()
          },
          {
            $sort: {
              turns: -1,
              total_tokens: -1,
              model: 1
            }
          },
          {
            $limit: args.limit
          }
        ])
        .toArray(),
      events
        .find(query, {
          projection: {
            _id: 0,
            gameId: 1,
            createdAt: 1,
            questionCount: 1,
            move: 1,
            routeDurationMs: 1,
            runtime: 1
          },
          sort: {
            createdAt: -1
          },
          limit: args.limit
        })
        .toArray()
    ]);

    return {
      window: buildWindow(args, since, until, "game_turn.createdAt"),
      db: buildDbInfo(dbName),
      model_filter: args.model,
      limit: args.limit,
      models,
      recent_turns: recentTurns.map(formatTurn)
    };
  });
}

async function readSummary(args) {
  return withTelemetryDb(args, async ({ db, dbName, since, until }) => {
    const results = db.collection(RESULTS_COLLECTION);
    const events = db.collection(EVENTS_COLLECTION);
    const resultWindowQuery = {
      completedAt: {
        $gte: since,
        $lte: until
      }
    };
    const missWindowQuery = {
      ...reportedAnswerQuery(),
      actualAnswerReportedAt: {
        $gte: since,
        $lte: until
      }
    };
    const tokenWindowQuery = {
      eventType: "game_turn",
      createdAt: {
        $gte: since,
        $lte: until
      }
    };
    const shareWindowQuery = {
      eventType: "game_share",
      createdAt: {
        $gte: since,
        $lte: until
      }
    };

    const [
      summary,
      modelStats,
      reportedMissCount,
      reportedMissGroups,
      recentMisses,
      tokenStats,
      recentResults,
      activeGames,
      shareStats
    ] = await Promise.all([
      readCompletedSummary(results, resultWindowQuery),
      readModelStatsList(results, resultWindowQuery, args.limit),
      results.countDocuments(missWindowQuery),
      readMissGroups(results, missWindowQuery, {
        ...args,
        groupBy: "model"
      }),
      results
        .find(missWindowQuery, {
          projection: resultProjection(),
          sort: {
            actualAnswerReportedAt: -1
          },
          limit: args.limit
        })
        .toArray(),
      readTokenStatsList(events, tokenWindowQuery, args.limit),
      results
        .find(resultWindowQuery, {
          projection: resultProjection(),
          sort: {
            completedAt: -1
          },
          limit: args.limit
        })
        .toArray(),
      readActiveGameCount(events, results, until),
      readShareStats(events, shareWindowQuery)
    ]);

    return {
      window: buildWindow(args, since, until, "completedAt/game_turn.createdAt"),
      db: buildDbInfo(dbName),
      limit: args.limit,
      active_games_5m: activeGames,
      completed_summary: summary,
      model_stats: modelStats,
      reported_misses: {
        count: reportedMissCount,
        group_by: "model",
        groups: reportedMissGroups,
        recent: recentMisses.map(formatMiss)
      },
      token_stats: tokenStats,
      share_stats: shareStats,
      recent_results: recentResults.map(formatResult)
    };
  });
}

async function withTelemetryDb(args, reader) {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    throw cliError(
      "E_CONFIGURATION",
      "MONGODB_URI is not configured.",
      false,
      "Configure MONGODB_URI in .env.local or the runtime secret store before querying telemetry.",
      EXIT_USAGE
    );
  }

  const dbName =
    process.env.GAME_TELEMETRY_MONGODB_DB?.trim() ||
    process.env.MONGODB_DB_NAME?.trim() ||
    DEFAULT_DB_NAME;
  const until = new Date();
  const since = new Date(until.getTime() - args.minutes * 60 * 1000);
  const client = await connectMongo(mongoUri, args.timeoutMs);

  try {
    const db = client.db(dbName);
    return await reader({ db, dbName, since, until });
  } finally {
    await client.close();
  }
}

async function readCompletedSummary(results, query) {
  return (
    (await results
      .aggregate([
        {
          $match: query
        },
        {
          $group: {
            _id: null,
            total_games: {
              $sum: 1
            },
            correct_games: {
              $sum: {
                $cond: ["$correct", 1, 0]
              }
            },
            incorrect_games: {
              $sum: {
                $cond: ["$correct", 0, 1]
              }
            },
            reported_misses: {
              $sum: {
                $cond: [hasReportedAnswerExpression(), 1, 0]
              }
            },
            average_questions: {
              $avg: "$questionCount"
            }
          }
        },
        {
          $project: {
            _id: 0,
            total_games: 1,
            correct_games: 1,
            incorrect_games: 1,
            reported_misses: 1,
            correct_rate: roundedRatio("$correct_games", "$total_games", 4),
            reported_miss_rate: roundedRatio("$reported_misses", "$total_games", 4),
            average_questions: {
              $round: ["$average_questions", 2]
            }
          }
        }
      ])
      .next()) ?? {
      total_games: 0,
      correct_games: 0,
      incorrect_games: 0,
      reported_misses: 0,
      correct_rate: null,
      reported_miss_rate: null,
      average_questions: null
    }
  );
}

async function readModelStatsList(results, query, limit) {
  return results
    .aggregate([
      {
        $match: query
      },
      {
        $group: modelStatsGroupStage()
      },
      {
        $project: modelStatsProjectStage()
      },
      {
        $sort: {
          total_games: -1,
          correct_games: -1,
          model: 1
        }
      },
      {
        $limit: limit
      }
    ])
    .toArray();
}

async function readTokenStatsList(events, query, limit) {
  return events
    .aggregate([
      {
        $match: query
      },
      {
        $group: tokenStatsGroupStage()
      },
      {
        $project: tokenStatsProjectStage()
      },
      {
        $sort: {
          turns: -1,
          total_tokens: -1,
          model: 1
        }
      },
      {
        $limit: limit
      }
    ])
    .toArray();
}

async function readShareStats(events, query) {
  return (
    (await events
      .aggregate([
        {
          $match: query
        },
        {
          $group: {
            _id: null,
            total_shares: {
              $sum: 1
            },
            native_shares: {
              $sum: {
                $cond: [{ $eq: ["$method", "native"] }, 1, 0]
              }
            },
            copy_shares: {
              $sum: {
                $cond: [{ $eq: ["$method", "copy"] }, 1, 0]
              }
            },
            correct_result_shares: {
              $sum: {
                $cond: ["$correct", 1, 0]
              }
            },
            incorrect_result_shares: {
              $sum: {
                $cond: ["$correct", 0, 1]
              }
            },
            latest_shared_at: {
              $max: "$createdAt"
            }
          }
        },
        {
          $project: {
            _id: 0,
            total_shares: 1,
            native_shares: 1,
            copy_shares: 1,
            correct_result_shares: 1,
            incorrect_result_shares: 1,
            latest_shared_at: 1
          }
        }
      ])
      .next()) ?? {
      total_shares: 0,
      native_shares: 0,
      copy_shares: 0,
      correct_result_shares: 0,
      incorrect_result_shares: 0,
      latest_shared_at: null
    }
  );
}

async function readActiveGameCount(events, results, now) {
  const since = new Date(now.getTime() - 5 * 60 * 1000);
  const [completedGameIds, latestEvents] = await Promise.all([
    results.distinct("gameId", {}),
    events
      .aggregate([
        {
          $match: {
            gameId: {
              $ne: null
            },
            createdAt: {
              $gte: since,
              $lte: now
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
        }
      ])
      .toArray()
  ]);
  const completed = new Set(completedGameIds);

  return latestEvents.filter((event) => !completed.has(event._id)).length;
}

function tokenStatsGroupStage() {
  return {
    _id: modelExpression(),
    turns: {
      $sum: 1
    },
    guesses: {
      $sum: {
        $cond: [
          {
            $eq: ["$move.action", "make_guess"]
          },
          1,
          0
        ]
      }
    },
    fallback_turns: {
      $sum: {
        $cond: [
          {
            $eq: ["$runtime.source", "model_move_content_filter_fallback"]
          },
          1,
          0
        ]
      }
    },
    total_input_tokens: {
      $sum: {
        $ifNull: ["$runtime.usage.inputTokens", 0]
      }
    },
    total_cached_tokens: {
      $sum: {
        $ifNull: ["$runtime.usage.cachedTokens", 0]
      }
    },
    total_output_tokens: {
      $sum: {
        $ifNull: ["$runtime.usage.outputTokens", 0]
      }
    },
    total_reasoning_tokens: {
      $sum: {
        $ifNull: ["$runtime.usage.reasoningTokens", 0]
      }
    },
    total_tokens: {
      $sum: {
        $ifNull: ["$runtime.usage.totalTokens", 0]
      }
    },
    average_route_duration_ms: {
      $avg: "$routeDurationMs"
    },
    average_model_duration_ms: {
      $avg: "$runtime.modelDurationMs"
    },
    latest_turn_at: {
      $max: "$createdAt"
    }
  };
}

function tokenStatsProjectStage() {
  return {
    _id: 0,
    model: "$_id",
    turns: 1,
    guesses: 1,
    fallback_turns: 1,
    total_input_tokens: 1,
    total_cached_tokens: 1,
    total_output_tokens: 1,
    total_reasoning_tokens: 1,
    total_tokens: 1,
    average_input_tokens: roundedAverage("$total_input_tokens", "$turns", 1),
    average_cached_tokens: roundedAverage("$total_cached_tokens", "$turns", 1),
    average_output_tokens: roundedAverage("$total_output_tokens", "$turns", 1),
    average_reasoning_tokens: roundedAverage("$total_reasoning_tokens", "$turns", 1),
    average_total_tokens: roundedAverage("$total_tokens", "$turns", 1),
    cache_read_rate: roundedRatio("$total_cached_tokens", "$total_input_tokens", 4),
    output_to_input_ratio: roundedRatio("$total_output_tokens", "$total_input_tokens", 4),
    average_route_duration_ms: {
      $round: ["$average_route_duration_ms", 0]
    },
    average_model_duration_ms: {
      $round: ["$average_model_duration_ms", 0]
    },
    latest_turn_at: 1
  };
}

function modelStatsGroupStage() {
  return {
    _id: {
      $ifNull: ["$finalModel", "unknown"]
    },
    total_games: {
      $sum: 1
    },
    correct_games: {
      $sum: {
        $cond: ["$correct", 1, 0]
      }
    },
    incorrect_games: {
      $sum: {
        $cond: ["$correct", 0, 1]
      }
    },
    reported_misses: {
      $sum: {
        $cond: [hasReportedAnswerExpression(), 1, 0]
      }
    },
    average_questions: {
      $avg: "$questionCount"
    },
    latest_completed_at: {
      $max: "$completedAt"
    }
  };
}

function modelEventFilter(model) {
  if (!model) {
    return {};
  }

  const regex = new RegExp(escapeRegex(model), "i");

  return {
    $or: [
      {
        "runtime.actualModel": regex
      },
      {
        "runtime.requestedModel": regex
      }
    ]
  };
}

function modelResultFilter(model) {
  if (!model) {
    return {};
  }

  return {
    finalModel: new RegExp(escapeRegex(model), "i")
  };
}

function modelExpression() {
  return {
    $ifNull: [
      "$runtime.actualModel",
      {
        $ifNull: ["$runtime.requestedModel", "unknown"]
      }
    ]
  };
}

function roundedAverage(numerator, denominator, places) {
  return {
    $cond: [
      {
        $gt: [denominator, 0]
      },
      {
        $round: [
          {
            $divide: [numerator, denominator]
          },
          places
        ]
      },
      null
    ]
  };
}

function roundedRatio(numerator, denominator, places) {
  return {
    $cond: [
      {
        $gt: [denominator, 0]
      },
      {
        $round: [
          {
            $divide: [numerator, denominator]
          },
          places
        ]
      },
      null
    ]
  };
}

function modelStatsProjectStage() {
  return {
    _id: 0,
    model: "$_id",
    total_games: 1,
    correct_games: 1,
    incorrect_games: 1,
    reported_misses: 1,
    correct_rate: {
      $cond: [
        {
          $gt: ["$total_games", 0]
        },
        {
          $round: [
            {
              $divide: ["$correct_games", "$total_games"]
            },
            4
          ]
        },
        null
      ]
    },
    reported_miss_rate: {
      $cond: [
        {
          $gt: ["$total_games", 0]
        },
        {
          $round: [
            {
              $divide: ["$reported_misses", "$total_games"]
            },
            4
          ]
        },
        null
      ]
    },
    average_questions: {
      $round: ["$average_questions", 2]
    },
    latest_completed_at: 1
  };
}

async function connectMongo(mongoUri, timeoutMs) {
  try {
    return await MongoClient.connect(mongoUri, {
      appName: "whiyh-game-telemetry-cli",
      retryWrites: false,
      connectTimeoutMS: timeoutMs,
      serverSelectionTimeoutMS: timeoutMs,
      tlsAllowInvalidCertificates:
        process.env.MONGODB_TLS_ALLOW_INVALID_CERTIFICATES === "true"
    });
  } catch (error) {
    throw classifyMongoError(error);
  }
}

function formatMiss(miss, args = { includeTranscript: false }) {
  const formatted = {
    game_id: miss.gameId ?? null,
    reported_answer: miss.actualAnswer ?? null,
    reported_at_utc: toIsoOrNull(miss.actualAnswerReportedAt),
    completed_at_utc: toIsoOrNull(miss.completedAt),
    final_guess: miss.finalGuess ?? null,
    question_count: miss.questionCount ?? null,
    final_model: miss.finalModel ?? null,
    answer_path: miss.answerPath ?? null
  };

  if (args.includeTranscript) {
    formatted.transcript = formatTranscript(miss.transcript);
  }

  return formatted;
}

function formatResult(result, args = { includeTranscript: false }) {
  const formatted = {
    game_id: result.gameId ?? null,
    completed_at_utc: toIsoOrNull(result.completedAt),
    correct: result.correct === true,
    reported_answer:
      typeof result.actualAnswer === "string" && result.actualAnswer.trim()
        ? result.actualAnswer.trim()
        : null,
    reported_at_utc: toIsoOrNull(result.actualAnswerReportedAt),
    final_guess: result.finalGuess ?? null,
    question_count: result.questionCount ?? null,
    final_model: result.finalModel ?? null,
    answer_path: result.answerPath ?? null
  };

  if (args.includeTranscript) {
    formatted.transcript = formatTranscript(result.transcript);
  }

  return formatted;
}

function formatTranscript(transcript) {
  if (!Array.isArray(transcript)) {
    return [];
  }

  return transcript.map((turn, index) => ({
    index: index + 1,
    question:
      typeof turn?.question === "string" && turn.question.trim()
        ? turn.question.trim()
        : null,
    answer:
      typeof turn?.answer === "string" && turn.answer.trim()
        ? turn.answer.trim()
        : null
  }));
}

function resultProjection() {
  return {
    _id: 0,
    gameId: 1,
    createdAt: 1,
    completedAt: 1,
    updatedAt: 1,
    correct: 1,
    actualAnswer: 1,
    actualAnswerReportedAt: 1,
    finalGuess: 1,
    questionCount: 1,
    finalModel: 1,
    answerPath: 1
  };
}

function transcriptProjection(args) {
  return args.includeTranscript ? { transcript: 1 } : {};
}

function formatTurn(turn) {
  const runtime = turn.runtime && typeof turn.runtime === "object" ? turn.runtime : {};
  const usage = runtime.usage && typeof runtime.usage === "object" ? runtime.usage : {};

  return {
    game_id: turn.gameId ?? null,
    created_at_utc: toIsoOrNull(turn.createdAt),
    question_count: turn.questionCount ?? null,
    action: turn.move?.action ?? null,
    source: runtime.source ?? null,
    requested_model: runtime.requestedModel ?? null,
    actual_model: runtime.actualModel ?? null,
    route_duration_ms: turn.routeDurationMs ?? null,
    model_duration_ms: runtime.modelDurationMs ?? null,
    input_tokens: usage.inputTokens ?? null,
    cached_tokens: usage.cachedTokens ?? null,
    output_tokens: usage.outputTokens ?? null,
    reasoning_tokens: usage.reasoningTokens ?? null,
    total_tokens: usage.totalTokens ?? null
  };
}

function buildWindow(args, since, until, basis) {
  return {
    minutes: args.minutes,
    since_utc: since.toISOString(),
    until_utc: until.toISOString(),
    basis
  };
}

function buildDbInfo(dbName) {
  return {
    name: dbName,
    results_collection: RESULTS_COLLECTION,
    events_collection: EVENTS_COLLECTION
  };
}

function reportedAnswerQuery() {
  return {
    actualAnswer: {
      $type: "string",
      $regex: /\S/
    }
  };
}

function hasReportedAnswerExpression() {
  return {
    $gt: [
      {
        $strLenCP: actualAnswerTextExpression()
      },
      0
    ]
  };
}

function actualAnswerTextExpression() {
  return {
    $cond: [
      {
        $eq: [
          {
            $type: "$actualAnswer"
          },
          "string"
        ]
      },
      {
        $trim: {
          input: "$actualAnswer"
        }
      },
      ""
    ]
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toIsoOrNull(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  return null;
}

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  const text = readFileSync(".env.local", "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (!key || key in process.env) {
      continue;
    }

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function emit(args, result) {
  const envelope = {
    schema_version: SCHEMA_VERSION,
    command: result.command,
    status: result.status,
    data: result.data,
    error: result.error,
    meta: {
      request_id: requestId,
      duration_ms: Date.now() - startedAt,
      timestamp_utc: new Date().toISOString()
    }
  };

  if (args.output === "plain" && result.status === "ok") {
    emitPlain(result);
    return;
  }

  console.log(JSON.stringify(envelope, null, 2));
}

function emitPlain(result) {
  if (result.command === "game-telemetry.misses") {
    console.log(
      `reported_misses=${result.data.count} event_count=${result.data.event_count} since=${result.data.window.since_utc}`
    );

    for (const group of result.data.groups) {
      console.log(
        `group=${group.reported_answer ?? group.key ?? "-"} count=${group.count} latest=${toIsoOrNull(group.latest_reported_at) ?? "-"}`
      );
    }

    for (const miss of result.data.misses) {
      console.log(
        `${miss.reported_at_utc ?? "-"} answer=${miss.reported_answer ?? "-"} guessed=${miss.final_guess ?? "-"} questions=${miss.question_count ?? "-"} model=${miss.final_model ?? "-"}`
      );
      if (Array.isArray(miss.transcript) && miss.transcript.length > 0) {
        console.log(`  transcript=${formatTranscriptPlain(miss.transcript)}`);
      }
    }
    return;
  }

  if (result.command === "game-telemetry.model-stats") {
    console.log(`model_count=${result.data.models.length} since=${result.data.window.since_utc}`);
    for (const model of result.data.models) {
      console.log(
        `model=${model.model ?? "-"} total=${model.total_games} correct=${model.correct_games} incorrect=${model.incorrect_games} reported_misses=${model.reported_misses} correct_rate=${model.correct_rate ?? "-"}`
      );
    }
    return;
  }

  if (result.command === "game-telemetry.model-results") {
    const totals = result.data.stats
      .map(
        (model) =>
          `${model.model}: total=${model.total_games} correct=${model.correct_games} incorrect=${model.incorrect_games} reported_misses=${model.reported_misses}`
      )
      .join("; ");
    console.log(`model_filter=${result.data.model_filter} since=${result.data.window.since_utc} ${totals}`);
    for (const game of result.data.recent_results) {
      console.log(
        `${game.completed_at_utc ?? "-"} correct=${game.correct} guessed=${game.final_guess ?? "-"} reported_answer=${game.reported_answer ?? "-"} questions=${game.question_count ?? "-"} model=${game.final_model ?? "-"}`
      );
      if (Array.isArray(game.transcript) && game.transcript.length > 0) {
        console.log(`  transcript=${formatTranscriptPlain(game.transcript)}`);
      }
    }
    return;
  }

  if (result.command === "game-telemetry.token-stats") {
    console.log(
      `model_filter=${result.data.model_filter ?? "-"} model_count=${result.data.models.length} since=${result.data.window.since_utc}`
    );
    for (const model of result.data.models) {
      console.log(
        `model=${model.model ?? "-"} turns=${model.turns} avg_total=${model.average_total_tokens ?? "-"} avg_input=${model.average_input_tokens ?? "-"} avg_cached=${model.average_cached_tokens ?? "-"} cache_rate=${model.cache_read_rate ?? "-"} avg_ms=${model.average_model_duration_ms ?? "-"}`
      );
    }
    for (const turn of result.data.recent_turns) {
      console.log(
        `${turn.created_at_utc ?? "-"} model=${turn.actual_model ?? turn.requested_model ?? "-"} action=${turn.action ?? "-"} input=${turn.input_tokens ?? "-"} cached=${turn.cached_tokens ?? "-"} output=${turn.output_tokens ?? "-"} reasoning=${turn.reasoning_tokens ?? "-"} total=${turn.total_tokens ?? "-"} model_ms=${turn.model_duration_ms ?? "-"}`
      );
    }
    return;
  }

  if (result.command === "game-telemetry.summary") {
    const summary = result.data.completed_summary;
    const shares = result.data.share_stats;
    console.log(
      `completed=${summary.total_games} correct=${summary.correct_games} incorrect=${summary.incorrect_games} correct_rate=${summary.correct_rate ?? "-"} reported_misses=${result.data.reported_misses.count} active_5m=${result.data.active_games_5m} since=${result.data.window.since_utc}`
    );
    for (const model of result.data.model_stats) {
      console.log(
        `model=${model.model ?? "-"} games=${model.total_games} correct=${model.correct_games} incorrect=${model.incorrect_games} reported_misses=${model.reported_misses} correct_rate=${model.correct_rate ?? "-"}`
      );
    }
    for (const tokens of result.data.token_stats) {
      console.log(
        `tokens model=${tokens.model ?? "-"} turns=${tokens.turns} avg_total=${tokens.average_total_tokens ?? "-"} cache_rate=${tokens.cache_read_rate ?? "-"} avg_ms=${tokens.average_model_duration_ms ?? "-"}`
      );
    }
    console.log(
      `shares total=${shares.total_shares} native=${shares.native_shares} copy=${shares.copy_shares} correct_results=${shares.correct_result_shares} incorrect_results=${shares.incorrect_result_shares}`
    );
    for (const game of result.data.recent_results) {
      console.log(
        `${game.completed_at_utc ?? "-"} correct=${game.correct} guessed=${game.final_guess ?? "-"} reported_answer=${game.reported_answer ?? "-"} questions=${game.question_count ?? "-"} model=${game.final_model ?? "-"}`
      );
    }
    return;
  }

  console.log(JSON.stringify(result.data, null, 2));
}

function usageError(message, hint = "Run `npm run telemetry -- misses --json --minutes 30`.") {
  return cliError("E_USAGE", message, false, hint, EXIT_USAGE);
}

function formatTranscriptPlain(transcript) {
  return transcript
    .map((turn) => {
      const question = turn.question ?? "-";
      const answer = turn.answer ?? "-";

      return `${turn.index ?? "?"}:${answer}:${question}`;
    })
    .join(" | ");
}

function cliError(code, message, retryable, hint, exitCode = EXIT_GENERIC) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.hint = hint;
  error.exitCode = exitCode;
  return error;
}

function classifyMongoError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/authentication|auth failed|unauthorized/i.test(message)) {
    return cliError(
      "E_AUTH",
      "Mongo authentication failed.",
      false,
      "Check the configured telemetry Mongo secret and retry.",
      EXIT_AUTH
    );
  }

  if (/server selection timed out|timed out|timeout/i.test(message)) {
    return cliError(
      "E_TIMEOUT",
      "Timed out while connecting to telemetry Mongo.",
      true,
      "Retry, or increase --timeout-ms if the network is slow.",
      EXIT_TIMEOUT
    );
  }

  return cliError(
    "E_DEPENDENCY",
    "Could not connect to telemetry Mongo.",
    true,
    "Check network access and the configured telemetry Mongo endpoint.",
    EXIT_DEPENDENCY
  );
}

function normalizeError(error) {
  if (error && typeof error === "object" && "code" in error) {
    return error;
  }

  return cliError(
    "E_GENERIC",
    error instanceof Error ? error.message : String(error),
    false,
    "Inspect stderr and retry with a narrower query."
  );
}
