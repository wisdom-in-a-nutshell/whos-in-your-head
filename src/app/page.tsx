"use client";

import { useEffect, useMemo, useState } from "react";

const MAX_QUESTIONS = 21;

const questionLabels = [
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

const thinkingLabels = [
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

type RuntimeStatus = {
  model: string;
  reasoningEffort: string;
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);

  const progressMarks = useMemo(
    () => Array.from({ length: MAX_QUESTIONS }, (_, index) => index + 1),
    []
  );

  const questionNumber = Math.max(1, game?.questionCount ?? 1);
  const currentQuestion = game?.latestQuestion;
  const answeredCount = game?.transcript.length ?? 0;
  const questionLabel =
    questionLabels[Math.max(0, questionNumber - 1) % questionLabels.length];
  const thinkingLabel = thinkingLabels[answeredCount % thinkingLabels.length];
  const modelName = runtimeStatus ? formatModelName(runtimeStatus.model) : "the house model";
  const reasoningLevel = runtimeStatus?.reasoningEffort ?? "medium";

  useEffect(() => {
    let active = true;

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

  async function startGame() {
    setError(null);
    setGame(null);
    setSelectedAnswer(null);
    setPhase("thinking");

    try {
      const nextGame = await postGameTurn({ action: "start" });
      commitGame(nextGame);
    } catch (nextError) {
      setError(readErrorMessage(nextError));
      setPhase("start");
    }
  }

  async function answerQuestion(answer: Answer) {
    if (phase !== "asking" || !game || !currentQuestion) {
      return;
    }

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
    }
  }

  async function judgeGuess(correct: boolean) {
    if (!game || game.phase !== "guessing") {
      return;
    }

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

  return (
    <main className="game-shell">
      <header className="game-header" aria-label="Game header">
        <button className="wordmark" onClick={startGame} type="button">
          Who&apos;s In Your Head?
        </button>
        <span className="round-count">{MAX_QUESTIONS} questions / 1 guess</span>
      </header>

      {phase === "start" ? (
        <section className="start-screen" aria-labelledby="start-title">
          <div className="start-copy">
            <p className="kicker">Let&apos;s play, human</p>
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
              {phase === "thinking" ? thinkingLabel : questionLabel}
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
          <p className="stage-label">Final call</p>
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
          <button className="primary-action" onClick={startGame} type="button">
            Play again
          </button>
        </section>
      ) : null}

      <footer className="game-footer">
        <span>
          Talking to {modelName} at {reasoningLevel} reasoning.
        </span>
        <span>More models are coming soon to guess who&apos;s in your head.</span>
        <span>Built by Adityan.io with Codex.</span>
      </footer>
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
    throw new Error("The game got stuck. Try again.");
  }

  if (!data.ok) {
    throw new Error(data.error);
  }

  return data.game;
}

function readErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "I lost the thread. Try that answer again.";
  }

  if (error.message === "The game got stuck. Try again.") {
    return "I lost the thread. Try that answer again.";
  }

  return error.message;
}

function formatModelName(model: string): string {
  return model.replace(/^gpt/i, "GPT");
}
