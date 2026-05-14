import Link from "next/link";
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

export default async function StatsPage() {
  const stats = await getPublicGameStats().catch(() => null);
  const hasCompletedRounds = Boolean(stats && stats.totalGames > 0);
  const modelBreakdown = stats ? getModelBreakdown(stats) : [];

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

      {stats ? (
        <>
          <section className="stats-grid stats-grid-primary" aria-label="Game stats">
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

  return model
    .replace(/^gpt/i, "GPT")
    .replace("-mini", " Mini")
    .replace("-nano", " Nano");
}
