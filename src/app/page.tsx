"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

const MAX_QUESTIONS = 21;

const questionPrompts = [
  "Don’t overthink it",
  "Tiny clue, please",
  "Keep your face still",
  "This narrows it",
  "One tiny tell",
  "One clean answer",
  "Poker face, please",
  "Mind-reader mode",
  "Your move",
  "No table talk",
  "Just one clue",
  "Truth serum time",
  "Answer under oath",
  "Don’t help too much",
  "One bit of signal",
  "Say it straight",
  "Keep it secret",
  "Stay mysterious",
  "Clue me in",
  "I saw that blink",
  "I’m listening",
  "Tiny data point",
  "Give me the truth",
  "No spoilers",
  "Answer like you mean it",
  "I need a clue",
  "Suspicion rising",
  "The plot thickens",
  "Clean yes or no",
  "Make it count",
  "I’m watching the pattern",
  "Say less, reveal more",
  "A clue for the machine",
  "Keep a straight face",
  "The room knows",
  "Lock in your answer",
  "Tiny clue detected",
  "Careful now",
  "Your silence is loud",
  "Don’t give them away",
  "One bit closer"
];

const thinkingPrompts = [
  "Narrowing it down",
  "Reading the pattern",
  "That helps",
  "Interesting",
  "I have a theory",
  "Adjusting the radar",
  "Logging that",
  "New theory loading",
  "Interesting signal",
  "Updating my guess",
  "Connecting dots",
  "Eliminating suspects",
  "The net tightens",
  "Hold that thought",
  "That changes things",
  "Making a shortlist",
  "Crossing names off",
  "Zooming in",
  "Rewriting the theory",
  "Suspicion recalibrated",
  "Running the vibe math",
  "Almost seeing it",
  "Adding that clue",
  "Noted, human",
  "Plotting quietly",
  "The picture sharpens",
  "A pattern appears",
  "Getting warmer",
  "Rechecking the map",
  "Updating my suspect board",
  "That answer had a vibe",
  "Re-ranking famous people",
  "Crossing out half the internet",
  "A theory just got louder",
  "Looking for the tell",
  "The pattern is snitching",
  "Something clicked",
  "I’m closer than you want",
  "Consulting the invisible corkboard"
];

function ThinkingDots() {
  return (
    <span className="thinking-dots" aria-label="Thinking">
      <span />
      <span />
      <span />
    </span>
  );
}

type Phase = "start" | "asking" | "thinking" | "guessing" | "result";
type Answer = "yes" | "no" | "maybe";

type Turn = {
  question: string;
  answer: Answer;
};

type GameState = {
  gameId: string;
  phase: "asking" | "guessing" | "result";
  questionCount: number;
  maxQuestions: 21;
  transcript: Turn[];
  latestQuestion: string | null;
  finalGuess: string | null;
  result: "unknown" | "correct" | "incorrect";
  reasoningEffort: string;
  modelResponseId: string | null;
};

type GameTurnResponse =
  | {
      ok: true;
      game: GameState;
    }
  | {
      ok: false;
      error: string;
      code?: string;
    };

type ActualAnswerStatus = "idle" | "sending" | "sent" | "error";

type RuntimeStatus = {
  model: string;
  reasoningEffort: string;
  reasoningMix?: Array<{
    effort: string;
    weight: number;
  }>;
};

type PublicStats = {
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
  totalTurns: number;
  averageTurnDurationMs: number | null;
  averageModelDurationMs: number | null;
  averageReasoningTokens: number | null;
  averageCachedTokens: number | null;
  fallbackGames: number;
  fallbackTurns: number;
  reportedMisses: number;
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [actualAnswer, setActualAnswer] = useState("");
  const [actualAnswerStatus, setActualAnswerStatus] =
    useState<ActualAnswerStatus>("idle");
  const [actualAnswerError, setActualAnswerError] = useState<string | null>(null);
  const pendingTurnRef = useRef(false);

  const progressMarks = useMemo(
    () => Array.from({ length: MAX_QUESTIONS }, (_, index) => index + 1),
    []
  );

  const questionNumber = Math.max(1, game?.questionCount ?? 1);
  const currentQuestion = game?.latestQuestion;
  const answeredCount = game?.transcript.length ?? 0;
  const questionPrompt =
    questionPrompts[Math.max(0, questionNumber - 1) % questionPrompts.length];
  const thinkingPrompt = thinkingPrompts[answeredCount % thinkingPrompts.length];
  const currentPrompt = phase === "thinking" ? thinkingPrompt : questionPrompt;
  const modelName = runtimeStatus ? formatModelName(runtimeStatus.model) : "the house model";
  const reasoningLevel = game?.reasoningEffort ?? runtimeStatus?.reasoningEffort ?? "medium";

  useEffect(() => {
    let active = true;
    const previewGame = getPreviewGame();

    if (previewGame) {
      queueMicrotask(() => {
        if (active) {
          setGame(previewGame);
          setPhase("result");
        }
      });
    }

    async function loadRuntimeStatus() {
      const response = await fetch("/api/openai/status");
      const data = (await response.json()) as {
        openai?: RuntimeStatus;
      };

      if (active && data.openai) {
        setRuntimeStatus(data.openai);
      }
    }

    loadRuntimeStatus().catch(() => {
      if (active) {
        setRuntimeStatus(null);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPublicStats() {
      if (phase !== "result") {
        return;
      }

      const response = await fetch("/api/stats");
      const data = (await response.json()) as {
        ok?: boolean;
        stats?: PublicStats | null;
      };

      if (active && data.ok && data.stats) {
        setPublicStats(data.stats);
      }
    }

    loadPublicStats().catch(() => {
      if (active) {
        setPublicStats(null);
      }
    });

    return () => {
      active = false;
    };
  }, [phase, game?.gameId]);

  async function startGame() {
    if (pendingTurnRef.current) {
      return;
    }

    pendingTurnRef.current = true;
    setError(null);
    setGame(null);
    setSelectedAnswer(null);
    setPublicStats(null);
    setActualAnswer("");
    setActualAnswerStatus("idle");
    setActualAnswerError(null);
    setPhase("thinking");

    try {
      const nextGame = await postGameTurn({ action: "start" });
      commitGame(nextGame);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
      setPhase("start");
    } finally {
      pendingTurnRef.current = false;
    }
  }

  async function answerQuestion(answer: Answer) {
    if (pendingTurnRef.current || phase !== "asking" || !game || !currentQuestion) {
      return;
    }

    pendingTurnRef.current = true;
    setError(null);
    setSelectedAnswer(answer);
    setPhase("thinking");

    try {
      const nextGame = await postGameTurn({
        action: "answer",
        state: game,
        answer
      });
      setSelectedAnswer(null);
      commitGame(nextGame);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
      setSelectedAnswer(null);
      setPhase("asking");
    } finally {
      pendingTurnRef.current = false;
    }
  }

  async function judgeGuess(correct: boolean) {
    if (pendingTurnRef.current || !game || game.phase !== "guessing") {
      return;
    }

    pendingTurnRef.current = true;
    setError(null);
    setPhase("thinking");

    try {
      const nextGame = await postGameTurn({
        action: "judge_guess",
        state: game,
        correct
      });
      commitGame(nextGame);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
      setPhase("guessing");
    } finally {
      pendingTurnRef.current = false;
    }
  }

  async function reportActualAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      actualAnswerStatus === "sending" ||
      !game ||
      game.phase !== "result" ||
      game.result !== "incorrect"
    ) {
      return;
    }

    const cleanedAnswer = actualAnswer.trim();

    if (!cleanedAnswer) {
      setActualAnswerError("Tell me who beat me.");
      return;
    }

    setActualAnswerStatus("sending");
    setActualAnswerError(null);

    try {
      const nextGame = await postGameTurn({
        action: "report_actual_answer",
        state: game,
        actualAnswer: cleanedAnswer
      });

      setGame(nextGame);
      setActualAnswer(cleanedAnswer);
      setActualAnswerStatus("sent");
    } catch (nextError) {
      setActualAnswerStatus("error");
      setActualAnswerError(readErrorMessage(nextError));
    }
  }

  function commitGame(nextGame: GameState) {
    setGame(nextGame);

    if (nextGame.phase === "asking") {
      setPhase("asking");
      return;
    }

    if (nextGame.phase === "guessing") {
      setPhase("guessing");
      return;
    }

    setPhase("result");
  }

  const isStartScreen = phase === "start";

  return (
    <main className={isStartScreen ? "game-shell" : "game-shell is-focused"}>
      {isStartScreen ? (
        <header className="game-header" aria-label="Game header">
          <button className="wordmark" onClick={startGame} type="button">
            Who&apos;s In Your Head?
          </button>
          <span className="round-count">{MAX_QUESTIONS} questions / 1 guess</span>
        </header>
      ) : null}

      {isStartScreen ? (
        <section className="start-screen" aria-labelledby="start-title">
          <div className="start-copy">
            <p className="kicker">
              Let&apos;s play, human
            </p>
            <h1 id="start-title">Think of someone famous.</h1>
            <p className="start-subtitle">
              Keep them in your head. I get 21 questions and one final guess.
              You just say yes, no, or not sure.
            </p>
            <button className="primary-action" onClick={startGame} type="button">
              I&apos;ve got someone
            </button>
            {error ? <p className="error-note">{error}</p> : null}
          </div>

          <div className="progress-lockup" aria-label="21 question limit">
            <span>Question limit</span>
            <div className="progress-marks" aria-hidden="true">
              {progressMarks.map((mark) => (
                <span key={mark} className="mark" />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {phase === "asking" || phase === "thinking" ? (
        <section className="play-screen" aria-labelledby="question-title">
          <div className="play-topline">
            <strong>
              Question {questionNumber} / {MAX_QUESTIONS}
            </strong>
          </div>

          <div className="progress-marks play-progress" aria-hidden="true">
            {progressMarks.map((mark) => (
              <span
                key={mark}
                className={mark <= (game?.questionCount ?? 0) ? "mark is-used" : "mark"}
              />
            ))}
          </div>

          <div className="question-stage">
            <p className="stage-label">
              {currentPrompt}
            </p>
            <h2 id="question-title">
              {phase === "thinking" ? (
                <>
                  {game?.phase === "guessing" ? "Revealing" : "Thinking"}
                  <ThinkingDots />
                </>
              ) : (
                currentQuestion ?? "I’m finding the first question."
              )}
            </h2>
            {error ? <p className="error-note">{error}</p> : null}
          </div>

          <div className="answer-grid" aria-label="Answer choices">
            <button
              className={selectedAnswer === "yes" ? "is-selected" : undefined}
              disabled={phase === "thinking"}
              onClick={() => answerQuestion("yes")}
              type="button"
            >
              Yes
            </button>
            <button
              className={selectedAnswer === "no" ? "is-selected" : undefined}
              disabled={phase === "thinking"}
              onClick={() => answerQuestion("no")}
              type="button"
            >
              No
            </button>
            <button
              className={selectedAnswer === "maybe" ? "is-selected" : undefined}
              disabled={phase === "thinking"}
              onClick={() => answerQuestion("maybe")}
              type="button"
            >
              Not sure
            </button>
          </div>
        </section>
      ) : null}

      {phase === "guessing" ? (
        <section className="guess-screen" aria-labelledby="guess-title">
          <p className="stage-label">
            Final call
          </p>
          <h2 id="guess-title">I&apos;m locking in {game?.finalGuess ?? "this guess"}.</h2>
          <p className="guess-stat">{answeredCount} questions used</p>
          <div className="guess-actions" aria-label="Judge the final guess">
            <button
              className="primary-action"
              onClick={() => judgeGuess(true)}
              type="button"
            >
              That&apos;s them
            </button>
            <button
              className="secondary-action"
              onClick={() => judgeGuess(false)}
              type="button"
            >
              Nope
            </button>
          </div>
          {error ? <p className="error-note">{error}</p> : null}
        </section>
      ) : null}

      {phase === "result" ? (
        <section className="result-screen" aria-labelledby="result-title">
          <p className="stage-label">
            {game?.result === "correct" ? "Revealed" : "You got away"}
          </p>
          <h2 id="result-title">
            {game?.result === "correct"
              ? "I knew who was in your head."
              : "You beat me this round."}
          </h2>
          <p className="guess-stat">{answeredCount} questions used</p>
          {game?.result === "incorrect" ? (
            <form className="actual-answer-form" onSubmit={reportActualAnswer}>
              <label htmlFor="actual-answer">Who were you thinking of?</label>
              {actualAnswerStatus === "sent" ? (
                <p className="actual-answer-saved">
                  Logged. That miss is useful now.
                </p>
              ) : (
                <div className="actual-answer-row">
                  <input
                    autoComplete="off"
                    disabled={actualAnswerStatus === "sending"}
                    id="actual-answer"
                    maxLength={160}
                    onChange={(event) => setActualAnswer(event.target.value)}
                    placeholder="Gregor Mendel"
                    type="text"
                    value={actualAnswer}
                  />
                  <button
                    className="secondary-action"
                    disabled={actualAnswerStatus === "sending"}
                    type="submit"
                  >
                    {actualAnswerStatus === "sending" ? "Logging" : "Log it"}
                  </button>
                </div>
              )}
              {actualAnswerError ? (
                <p className="error-note">{actualAnswerError}</p>
              ) : null}
            </form>
          ) : null}
          <button className="primary-action" onClick={startGame} type="button">
            Play again
          </button>
          <div className="result-meta">
            {publicStats && publicStats.totalGames > 0 ? (
              <p>
                Across{" "}
                <span className="runtime-pill">{publicStats.totalGames}</span> rounds,
                I&apos;m at{" "}
                <span className="runtime-pill">
                  {formatPercent(publicStats.correctRate)}
                </span>{" "}
                in{" "}
                <span className="runtime-pill">
                  {formatNumber(publicStats.averageQuestions)}
                </span>{" "}
                questions on average.
              </p>
            ) : null}
            {publicStats && publicStats.startedGames > publicStats.totalGames ? (
              <p>
                <span className="runtime-pill">{publicStats.startedGames}</span> started.
                <span className="runtime-pill">{publicStats.abandonedGames}</span>{" "}
                wandered off mid-mystery.
                {publicStats.reportedMisses > 0 ? (
                  <>
                    {" "}
                    <span className="runtime-pill">{publicStats.reportedMisses}</span>{" "}
                    misses reported back.
                  </>
                ) : null}
              </p>
            ) : null}
            {publicStats && publicStats.averageTurnDurationMs !== null ? (
              <p>
                Average response:{" "}
                <span className="runtime-pill">
                  {formatSeconds(publicStats.averageTurnDurationMs)}
                </span>
                {publicStats.averageRoundDurationMs !== null ? (
                  <>
                    . Average round:{" "}
                    <span className="runtime-pill">
                      {formatSeconds(publicStats.averageRoundDurationMs)}
                    </span>
                  </>
                ) : null}
                {publicStats.fallbackTurns > 0 ? (
                  <>
                    . Fallback saved{" "}
                    <span className="runtime-pill">{publicStats.fallbackTurns}</span>{" "}
                    tricky turns.
                  </>
                ) : null}
              </p>
            ) : null}
            <p>
              You were playing with{" "}
              <span className="runtime-pill">{modelName}</span> at{" "}
              <span className="runtime-pill">{reasoningLevel}</span> reasoning.
            </p>
            <p>
              More models are coming soon to try this same trick.
              <a href="/stats"> See the live scoreboard.</a>
            </p>
            <p>
              Built by{" "}
              <a href="https://www.adithyan.io/" rel="noreferrer" target="_blank">
                Adithyan
              </a>{" "}
              with help from Codex.
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}

async function postGameTurn(payload: unknown): Promise<GameState> {
  const response = await fetch("/api/game/turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = (await response.json().catch(() => null)) as GameTurnResponse | null;

  if (!response.ok || !data) {
    throw new Error("Question failed. Try that answer again.");
  }

  if (!data.ok) {
    if (data.code === "game_master_error") {
      throw new Error("Question failed. Try that answer again.");
    }

    throw new Error(data.error);
  }

  return data.game;
}

function readErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Question failed. Try that answer again.";
  }

  return error.message;
}

function formatModelName(model: string): string {
  return model.replace(/^gpt/i, "GPT");
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "new";
  }

  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "new";
  }

  return value.toFixed(1);
}

function formatSeconds(valueMs: number): string {
  return `${(valueMs / 1000).toFixed(1)}s`;
}

function getPreviewGame(): GameState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const preview = new URLSearchParams(window.location.search).get("preview");

  if (preview !== "result" && preview !== "miss") {
    return null;
  }

  const missedGuess = preview === "miss";

  return {
    gameId: "preview",
    phase: "result",
    questionCount: 11,
    maxQuestions: 21,
    transcript: Array.from({ length: 11 }, (_, index) => ({
      question: `Preview question ${index + 1}?`,
      answer: "yes"
    })),
    latestQuestion: null,
    finalGuess: missedGuess ? "Charles Darwin" : "Taylor Swift",
    result: missedGuess ? "incorrect" : "correct",
    reasoningEffort: "high",
    modelResponseId: null
  };
}
