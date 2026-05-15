import Link from "next/link";
import { Suspense } from "react";
import { getPublicGameStats } from "@/lib/server/game-telemetry";

export const dynamic = "force-dynamic";

type LoadedStats = NonNullable<Awaited<ReturnType<typeof getPublicGameStats>>>;
type ModelBreakdown = {
  model: string;
  completedGames: number;
  correctGames: number;
  correctRate: number | null;
  turns: number;
  fallbackTurns: number;
  averageTurnDurationMs: number | null;
};
type TrendBucket = LoadedStats["trendStats"][number];

export default function StatsPage() {
  return (
    <main className="stats-shell">
      <header className="stats-header">
        <Link className="wordmark" href="/">
          Who&apos;s In Your Head?
        </Link>
        <span className="round-count">Live stats</span>
      </header>

      <section className="stats-hero" aria-labelledby="stats-title">
        <p className="kicker">The scoreboard</p>
        <h1 id="stats-title">Live game stats.</h1>
        <p>
          Aggregate numbers only. No transcripts, answers, or individual rounds
          are public.
        </p>
        <div className="stats-actions">
          <Link className="primary-action" href="/">
            Play a round
          </Link>
        </div>
      </section>

      <Suspense fallback={<StatsLoading />}>
        <StatsContent />
      </Suspense>
    </main>
  );
}

async function StatsContent() {
  const stats = await getPublicGameStats().catch(() => null);
  const hasCompletedRounds = Boolean(stats && stats.totalGames > 0);
  const modelBreakdown = stats ? getModelBreakdown(stats) : [];

  return (
    <>
      {stats ? (
        <>
          <section className="stats-grid stats-grid-primary" aria-label="Game stats">
            <StatBlock label="Live now" value={stats.activeGames.toString()} />
            <StatBlock label="Rounds completed" value={stats.totalGames.toString()} />
            <StatBlock label="Correct" value={formatPercent(stats.correctRate)} />
            <StatBlock
              label="Avg questions"
              value={formatNumber(stats.averageQuestions)}
            />
            <StatBlock
              label="Avg response"
              value={formatDuration(stats.averageTurnDurationMs)}
            />
          </section>

          <section className="stats-strip" aria-label="Operational stats">
            <StatBlock label="Started" value={stats.startedGames.toString()} />
            <StatBlock label="Dropped" value={stats.abandonedGames.toString()} />
            <StatBlock label="Misses reported" value={stats.reportedMisses.toString()} />
            <StatBlock label="Fallback turns" value={stats.fallbackTurns.toString()} />
          </section>

          <TrendPanel trend={stats.trendStats} />

          <section className="model-table" aria-labelledby="model-title">
            <div>
              <p className="kicker">Model breakdown</p>
              <h2 id="model-title">Which mind-reader is playing?</h2>
            </div>
            {modelBreakdown.length > 0 ? (
              <div className="model-rows">
                {modelBreakdown.map((model) => (
                  <div className="model-row" key={model.model}>
                    <strong>{formatModelName(model.model)}</strong>
                    <span>{formatPercent(model.correctRate)} correct</span>
                    <span>{model.completedGames} rounds</span>
                    <span>{model.turns} turns</span>
                    <span>{formatDuration(model.averageTurnDurationMs)}</span>
                    <span>{model.fallbackTurns} fallback</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStats
                title={
                  hasCompletedRounds
                    ? "Model turns are still warming up."
                    : "The board is waiting for its first round."
                }
                body={
                  hasCompletedRounds
                    ? "Completed games are recorded. Model-level details will appear after the next turn event lands."
                    : "Once a few friends finish games, this page will start showing how sharp the guesser is."
                }
              />
            )}
          </section>
        </>
      ) : (
        <EmptyStats
          title="Stats are warming up."
          body="The public page is ready. It will fill itself in as soon as telemetry is available."
        />
      )}
    </>
  );
}

function StatsLoading() {
  return (
    <section className="stats-loading" aria-busy="true" aria-label="Loading stats">
      <div className="stats-grid stats-grid-primary">
        {["Live now", "Rounds completed", "Correct", "Avg questions", "Avg response"].map(
          (label) => (
            <StatBlock key={label} label={label} value="..." />
          )
        )}
      </div>
      <p>Pulling the live board.</p>
    </section>
  );
}

function TrendPanel({ trend }: { trend: TrendBucket[] }) {
  const hasTrendData = trend.some(
    (bucket) =>
      bucket.startedGames > 0 ||
      bucket.completedGames > 0 ||
      bucket.reportedMisses > 0 ||
      bucket.droppedGames > 0
  );
  const completedGames = trend.reduce(
    (total, bucket) => total + bucket.completedGames,
    0
  );
  const reportedMisses = trend.reduce(
    (total, bucket) => total + bucket.reportedMisses,
    0
  );
  const droppedGames = trend.reduce(
    (total, bucket) => total + bucket.droppedGames,
    0
  );
  const startedGames = trend.reduce(
    (total, bucket) => total + bucket.startedGames,
    0
  );
  const windowMinutes = trend.length * 10;

  return (
    <section className="trend-panel" aria-labelledby="trend-title">
      <div className="trend-heading">
        <p className="kicker">Last {windowMinutes} minutes</p>
        <h2 id="trend-title">How are rounds ending?</h2>
        <p>
          {hasTrendData
            ? "Each line uses the same denominator: rounds started in that ten-minute window."
            : "Waiting for enough recent games to draw a useful trend."}
        </p>
      </div>
      {hasTrendData ? (
        <div className="trend-summary" aria-label="Recent totals">
          <StatBlock label="Started" value={startedGames.toString()} />
          <StatBlock label="Completed" value={completedGames.toString()} />
          <StatBlock label="Miss reports" value={reportedMisses.toString()} />
          <StatBlock label="Dropped" value={droppedGames.toString()} />
        </div>
      ) : null}
      <TrendChart trend={trend} hasTrendData={hasTrendData} />
    </section>
  );
}

function TrendChart({
  trend,
  hasTrendData
}: {
  trend: TrendBucket[];
  hasTrendData: boolean;
}) {
  const width = 1080;
  const height = 330;
  const paddingX = 58;
  const chartTop = 34;
  const chartBottom = 268;
  const step =
    trend.length > 1 ? (width - paddingX * 2) / (trend.length - 1) : 0;
  const buildPoints = (key: "correctRate" | "missRate" | "dropRate") =>
    trend.flatMap((bucket, index) => {
      const value = bucket[key];

      if (value === null) {
        return [];
      }

      return [
        {
          x: paddingX + index * step,
          y: chartBottom - value * (chartBottom - chartTop),
          bucket
        }
      ];
    });
  const lines = [
    {
      key: "correct",
      label: "Correct",
      className: "trend-line-correct",
      points: buildPoints("correctRate")
    },
    {
      key: "miss",
      label: "Miss reports",
      className: "trend-line-miss",
      points: buildPoints("missRate")
    },
    {
      key: "drop",
      label: "Dropped",
      className: "trend-line-drop",
      points: buildPoints("dropRate")
    }
  ];
  const axisMarks = [
    { label: "100%", value: 1 },
    { label: "50%", value: 0.5 },
    { label: "0%", value: 0 }
  ];
  const toPath = (points: Array<{ x: number; y: number }>) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  const firstLabel = trend[0]?.label ?? "";
  const lastLabel = trend.at(-1)?.label ?? "";

  return (
    <div className="trend-chart-wrap">
      <div className="trend-legend" aria-hidden="true">
        {lines.map((line) => (
          <span key={line.key}>
            <i className={`trend-key ${line.className}`} />
            {line.label}
          </span>
        ))}
      </div>
      <svg
        className="trend-chart"
        role="img"
        aria-label="Recent percentages for correct rounds, reported misses, and dropped rounds"
        viewBox={`0 0 ${width} ${height}`}
      >
        {axisMarks.map((mark) => {
          const y = chartBottom - mark.value * (chartBottom - chartTop);

          return (
            <g key={mark.label}>
              <line
                className={
                  mark.value === 0
                    ? "trend-grid-line trend-grid-line-strong"
                    : "trend-grid-line"
                }
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
              />
              <text className="trend-axis-label" x={0} y={y + 5}>
                {mark.label}
              </text>
            </g>
          );
        })}
        {trend.map((bucket, index) => {
          const x = paddingX + index * step;

          return (
            <g key={bucket.bucketStart}>
              <line
                className="trend-bucket-line"
                x1={x}
                x2={x}
                y1={chartTop}
                y2={chartBottom}
              />
              <text className="trend-start-label" x={x} y={height - 22}>
                {bucket.startedGames}
              </text>
            </g>
          );
        })}
        {lines.map((line) =>
          line.points.length > 0 ? (
            <path
              className={`trend-line ${line.className}`}
              d={toPath(line.points)}
              key={line.key}
            />
          ) : null
        )}
        {lines.flatMap((line) =>
          line.points.map((point) => (
            <circle
              className={`trend-dot ${line.className}`}
              key={`${line.key}-${point.bucket.bucketStart}`}
              cx={point.x}
              cy={point.y}
              r={5}
            />
          ))
        )}
        {!hasTrendData ? (
          <text className="trend-empty-label" x={width / 2} y={height / 2}>
            Waiting for games
          </text>
        ) : null}
      </svg>
      <div className="trend-axis-row" aria-hidden="true">
        <span>{firstLabel}</span>
        <span>Starts per bucket</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

function EmptyStats({ title, body }: { title: string; body: string }) {
  return (
    <section className="stats-empty" aria-label={title}>
      <p className="kicker">No public numbers yet</p>
      <h2>{title}</h2>
      <p>{body}</p>
      <Link href="/">Start a game</Link>
    </section>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getModelBreakdown(stats: LoadedStats): ModelBreakdown[] {
  const modelMap = new Map<
    ModelBreakdown["model"],
    ModelBreakdown & { durationWeight: number }
  >();

  for (const model of stats.modelStats) {
    const existing = modelMap.get(model.model) ?? {
      model: model.model,
      completedGames: 0,
      correctGames: 0,
      correctRate: null,
      turns: 0,
      fallbackTurns: 0,
      averageTurnDurationMs: null,
      durationWeight: 0
    };
    const nextCompletedGames = existing.completedGames + model.completedGames;
    const nextCorrectGames = existing.correctGames + model.correctGames;
    const durationWeight = model.averageTurnDurationMs === null ? 0 : model.turns;
    const nextDurationWeight = existing.durationWeight + durationWeight;
    const totalDuration =
      (existing.averageTurnDurationMs ?? 0) * existing.durationWeight +
      (model.averageTurnDurationMs ?? 0) * durationWeight;

    modelMap.set(model.model, {
      model: model.model,
      completedGames: nextCompletedGames,
      correctGames: nextCorrectGames,
      correctRate:
        nextCompletedGames > 0 ? nextCorrectGames / nextCompletedGames : null,
      turns: existing.turns + model.turns,
      fallbackTurns: existing.fallbackTurns + model.fallbackTurns,
      averageTurnDurationMs:
        nextDurationWeight > 0 ? totalDuration / nextDurationWeight : null,
      durationWeight: nextDurationWeight
    });
  }

  return Array.from(modelMap.values())
    .map((model) => ({
      model: model.model,
      completedGames: model.completedGames,
      correctGames: model.correctGames,
      correctRate: model.correctRate,
      turns: model.turns,
      fallbackTurns: model.fallbackTurns,
      averageTurnDurationMs: model.averageTurnDurationMs
    }))
    .sort(
      (left, right) =>
        right.completedGames - left.completedGames ||
        right.turns - left.turns ||
        left.model.localeCompare(right.model)
    );
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "new";
  }

  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "new";
  }

  return value.toFixed(1);
}

function formatDuration(valueMs: number | null) {
  if (valueMs === null) {
    return "new";
  }

  return `${(valueMs / 1000).toFixed(1)}s`;
}

function formatModelName(model: string) {
  if (model === "gpt-chat-latest") {
    return "GPT Chat Latest";
  }

  if (model === "gpt-5.4-mini") {
    return "GPT-5 Instant";
  }

  return model
    .replace(/^gpt/i, "GPT")
    .replace("-mini", " Mini")
    .replace("-nano", " Nano");
}
