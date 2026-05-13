import Link from "next/link";
import { getPublicGameStats } from "@/lib/server/game-telemetry";

export default async function StatsPage() {
  const stats = await getPublicGameStats().catch(() => null);

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
          Aggregate game stats only. The public board does not show transcripts
          or individual player rounds.
        </p>
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
                  <div className="model-row" key={model.model}>
                    <strong>{formatModelName(model.model)}</strong>
                    <span>{model.turns} turns</span>
                    <span>{model.guesses} guesses</span>
                    <span>{formatDuration(model.averageTurnDurationMs)}</span>
                    <span>{formatCompactNumber(model.averageReasoningTokens)} reasoning</span>
                    <span>{model.fallbackTurns} fallback</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="stats-empty">No model turns recorded yet.</p>
            )}
          </section>
        </>
      ) : (
        <section className="stats-empty" aria-label="Stats unavailable">
          Stats are not connected yet.
        </section>
      )}
    </main>
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
