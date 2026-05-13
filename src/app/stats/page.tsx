import Link from "next/link";
import { getPublicGameStats } from "@/lib/server/game-telemetry";

export default async function StatsPage() {
  const stats = await getPublicGameStats().catch(() => null);
  const hasCompletedRounds = Boolean(stats && stats.totalGames > 0);

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
        <h1 id="stats-title">How the mind-reader is doing.</h1>
        <p>
          Aggregate stats only. No transcripts, answers, or individual rounds
          are shown.
        </p>
        <div className="stats-actions">
          <Link className="primary-action" href="/">
            Play a round
          </Link>
        </div>
      </section>

      {stats ? (
        <>
          <section className="stats-grid" aria-label="Game stats">
            <StatBlock label="Completed" value={stats.totalGames.toString()} />
            <StatBlock label="Correct" value={formatPercent(stats.correctRate)} />
            <StatBlock
              label="Avg questions"
              value={formatNumber(stats.averageQuestions)}
            />
            <StatBlock
              label="Avg response"
              value={formatDuration(stats.averageTurnDurationMs)}
            />
            <StatBlock label="Started" value={stats.startedGames.toString()} />
            <StatBlock label="Dropped" value={stats.abandonedGames.toString()} />
            <StatBlock label="Fallback turns" value={stats.fallbackTurns.toString()} />
            <StatBlock
              label="Cached tokens"
              value={formatCompactNumber(stats.averageCachedTokens)}
            />
          </section>

          <section className="model-table" aria-labelledby="model-title">
            <div>
              <p className="kicker">Model paths</p>
              <h2 id="model-title">Who took the turns?</h2>
            </div>
            {stats.modelStats.length > 0 ? (
              <div className="model-rows">
                {stats.modelStats.map((model) => (
                  <div
                    className="model-row"
                    key={`${model.model}-${model.reasoningEffort}`}
                  >
                    <strong>{formatModelName(model.model)}</strong>
                    <span>{model.reasoningEffort} reasoning</span>
                    <span>{formatPercent(model.correctRate)} correct</span>
                    <span>{model.completedGames} games</span>
                    <span>{model.turns} turns</span>
                    <span>{formatDuration(model.averageTurnDurationMs)}</span>
                    <span>
                      {formatCompactNumber(model.averageReasoningTokens)} reason tokens
                    </span>
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
    </main>
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

function formatCompactNumber(value: number | null) {
  if (value === null) {
    return "new";
  }

  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatModelName(model: string) {
  return model.replace(/^gpt/i, "GPT");
}
