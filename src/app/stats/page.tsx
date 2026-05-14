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
  const windowMinutes = trend.length * 10;

  return (
    <section className="trend-panel" aria-labelledby="trend-title">
      <div className="trend-heading">
        <p className="kicker">Last {windowMinutes} minutes</p>
        <h2 id="trend-title">Is it getting sharper?</h2>
        <p>
          {hasTrendData
            ? `${completedGames} completed, ${reportedMisses} misses reported, ${droppedGames} dropped.`
            : "Waiting for enough recent games to draw a useful trend."}
        </p>
      </div>
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
  const width = 1000;
  const height = 260;
  const paddingX = 42;
  const lineTop = 28;
  const lineBottom = 132;
  const barBase = 218;
  const maxBarHeight = 70;
  const step =
    trend.length > 1 ? (width - paddingX * 2) / (trend.length - 1) : 0;
  const maxBarCount = Math.max(
    1,
    ...trend.map((bucket) => Math.max(bucket.reportedMisses, bucket.droppedGames))
  );
  const correctPoints = trend.flatMap((bucket, index) => {
    if (bucket.correctRate === null) {
      return [];
    }

    return [
      {
        x: paddingX + index * step,
        y: lineBottom - bucket.correctRate * (lineBottom - lineTop),
        bucket
      }
    ];
  });
  const correctSegments = correctPoints.slice(1).map((point, index) => ({
    from: correctPoints[index],
    to: point
  }));
  const firstLabel = trend[0]?.label ?? "";
  const lastLabel = trend.at(-1)?.label ?? "";

  return (
    <div className="trend-chart-wrap">
      <div className="trend-legend" aria-hidden="true">
        <span>
          <i className="trend-key trend-key-correct" />
          Correct
        </span>
        <span>
          <i className="trend-key trend-key-miss" />
          Misses
        </span>
        <span>
          <i className="trend-key trend-key-drop" />
          Dropped
        </span>
      </div>
      <svg
        className="trend-chart"
        role="img"
        aria-label="Recent trend for correct rate, reported misses, and dropped games"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line className="trend-grid-line" x1={paddingX} x2={width - paddingX} y1={lineTop} y2={lineTop} />
        <line className="trend-grid-line" x1={paddingX} x2={width - paddingX} y1={(lineTop + lineBottom) / 2} y2={(lineTop + lineBottom) / 2} />
        <line className="trend-grid-line trend-grid-line-strong" x1={paddingX} x2={width - paddingX} y1={lineBottom} y2={lineBottom} />
        <text className="trend-axis-label" x={0} y={lineTop + 4}>100%</text>
        <text className="trend-axis-label" x={8} y={lineBottom + 4}>0%</text>
        {trend.map((bucket, index) => {
          const x = paddingX + index * step;
          const missHeight = (bucket.reportedMisses / maxBarCount) * maxBarHeight;
          const dropHeight = (bucket.droppedGames / maxBarCount) * maxBarHeight;
          const barWidth = Math.max(8, step * 0.2);

          return (
            <g key={bucket.bucketStart}>
              <rect
                className="trend-bar trend-bar-miss"
                x={x - barWidth - 2}
                y={barBase - missHeight}
                width={barWidth}
                height={missHeight}
                rx={2}
              />
              <rect
                className="trend-bar trend-bar-drop"
                x={x + 2}
                y={barBase - dropHeight}
                width={barWidth}
                height={dropHeight}
                rx={2}
              />
            </g>
          );
        })}
        {correctSegments.map((segment) => (
          <line
            className="trend-line"
            key={`${segment.from.bucket.bucketStart}-${segment.to.bucket.bucketStart}`}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
          />
        ))}
        {correctPoints.map((point) => (
          <circle
            className="trend-dot"
            key={point.bucket.bucketStart}
            cx={point.x}
            cy={point.y}
            r={5}
          />
        ))}
        {!hasTrendData ? (
          <text className="trend-empty-label" x={width / 2} y={height / 2}>
            Waiting for games
          </text>
        ) : null}
      </svg>
      <div className="trend-axis-row" aria-hidden="true">
        <span>{firstLabel}</span>
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

  if (model === "claude-sonnet-4-6" || model === "claude-4.6-sonnet") {
    return "Claude Sonnet";
  }

  if (model === "claude-opus-4-6" || model === "claude-4.6-opus") {
    return "Claude Opus";
  }

  return model
    .replace(/^gpt/i, "GPT")
    .replace("-mini", " Mini")
    .replace("-nano", " Nano");
}
