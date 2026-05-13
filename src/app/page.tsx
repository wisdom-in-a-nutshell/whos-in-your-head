"use client";

import { useEffect, useMemo, useState } from "react";

const MAX_QUESTIONS = 21;

type StagePrompt = {
  text: string;
  emoji: string;
};

const questionPrompts: StagePrompt[] = [
  { text: "Don’t overthink it", emoji: "🧠" },
  { text: "Tiny clue, please", emoji: "🧩" },
  { text: "Keep your face still", emoji: "😐" },
  { text: "This narrows it", emoji: "🔎" },
  { text: "One tiny tell", emoji: "👀" },
  { text: "One clean answer", emoji: "✅" },
  { text: "Poker face, please", emoji: "🃏" },
  { text: "Mind-reader mode", emoji: "✨" },
  { text: "Your move", emoji: "🎲" },
  { text: "No table talk", emoji: "🤐" },
  { text: "Just one clue", emoji: "🕵️" },
  { text: "Truth serum time", emoji: "💧" },
  { text: "Answer under oath", emoji: "✋" },
  { text: "Don’t help too much", emoji: "🙊" },
  { text: "One bit of signal", emoji: "📡" },
  { text: "Say it straight", emoji: "➡️" },
  { text: "Keep it secret", emoji: "🤫" },
  { text: "Stay mysterious", emoji: "🎭" },
  { text: "Clue me in", emoji: "🔦" },
  { text: "I saw that blink", emoji: "👁️" },
  { text: "I’m listening", emoji: "👂" },
  { text: "Tiny data point", emoji: "📍" },
  { text: "Give me the truth", emoji: "⚖️" },
  { text: "No spoilers", emoji: "🚫" },
  { text: "Answer like you mean it", emoji: "🎯" },
  { text: "I need a clue", emoji: "🗝️" },
  { text: "Suspicion rising", emoji: "📈" },
  { text: "The plot thickens", emoji: "🌀" },
  { text: "Clean yes or no", emoji: "☑️" },
  { text: "Make it count", emoji: "⏱️" },
  { text: "I’m watching the pattern", emoji: "🧵" },
  { text: "Say less, reveal more", emoji: "💬" },
  { text: "A clue for the machine", emoji: "⚙️" },
  { text: "Keep a straight face", emoji: "🫥" },
  { text: "The room knows", emoji: "👥" },
  { text: "Lock in your answer", emoji: "🔒" },
  { text: "Tiny clue detected", emoji: "📌" },
  { text: "Careful now", emoji: "⚠️" },
  { text: "Your silence is loud", emoji: "🔇" },
  { text: "Don’t give them away", emoji: "🙈" },
  { text: "One bit closer", emoji: "➕" }
];

const thinkingPrompts: StagePrompt[] = [
  { text: "Narrowing it down", emoji: "🔎" },
  { text: "Reading the pattern", emoji: "🧵" },
  { text: "That helps", emoji: "✅" },
  { text: "Interesting", emoji: "👀" },
  { text: "I have a theory", emoji: "💡" },
  { text: "Adjusting the radar", emoji: "📡" },
  { text: "Logging that", emoji: "📝" },
  { text: "New theory loading", emoji: "⏳" },
  { text: "Interesting signal", emoji: "📶" },
  { text: "Updating my guess", emoji: "🔁" },
  { text: "Connecting dots", emoji: "🧩" },
  { text: "Eliminating suspects", emoji: "✂️" },
  { text: "The net tightens", emoji: "🎯" },
  { text: "Hold that thought", emoji: "📌" },
  { text: "That changes things", emoji: "🔀" },
  { text: "Making a shortlist", emoji: "📋" },
  { text: "Crossing names off", emoji: "❌" },
  { text: "Zooming in", emoji: "🔬" },
  { text: "Rewriting the theory", emoji: "✍️" },
  { text: "Suspicion recalibrated", emoji: "⚙️" },
  { text: "Running the vibe math", emoji: "🧮" },
  { text: "Almost seeing it", emoji: "👁️" },
  { text: "Adding that clue", emoji: "➕" },
  { text: "Noted, human", emoji: "🫡" },
  { text: "Plotting quietly", emoji: "🤫" },
  { text: "The picture sharpens", emoji: "🖼️" },
  { text: "A pattern appears", emoji: "✨" },
  { text: "Getting warmer", emoji: "🔥" },
  { text: "Rechecking the map", emoji: "🗺️" },
  { text: "Updating my suspect board", emoji: "🕵️" },
  { text: "That answer had a vibe", emoji: "🪩" },
  { text: "Re-ranking famous people", emoji: "🏆" },
  { text: "Crossing out half the internet", emoji: "🌐" },
  { text: "A theory just got louder", emoji: "🔊" },
  { text: "Looking for the tell", emoji: "👀" },
  { text: "The pattern is snitching", emoji: "🧵" },
  { text: "Something clicked", emoji: "🖱️" },
  { text: "I’m closer than you want", emoji: "📍" },
  { text: "Consulting the invisible corkboard", emoji: "🧷" }
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

function StageLabel({ prompt }: { prompt: StagePrompt }) {
  if (prompt.text.endsWith(", please")) {
    const leadText = prompt.text.slice(0, -", please".length);

    return (
      <>
        {leadText}
        {" "}
        <span className="stage-mark" aria-hidden="true">
          {prompt.emoji}
        </span>
        , please
      </>
    );
  }

  return (
    <>
      {prompt.text}
      {" "}
      <span className="stage-mark" aria-hidden="true">
        {prompt.emoji}
      </span>
    </>
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
  const questionPrompt =
    questionPrompts[Math.max(0, questionNumber - 1) % questionPrompts.length];
  const thinkingPrompt = thinkingPrompts[answeredCount % thinkingPrompts.length];
  const currentPrompt = phase === "thinking" ? thinkingPrompt : questionPrompt;
  const modelName = runtimeStatus ? formatModelName(runtimeStatus.model) : "the house model";
  const reasoningLevel = runtimeStatus?.reasoningEffort ?? "medium";

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
            <p className="kicker">
              Let&apos;s play, human
              {" "}
              <span className="stage-mark" aria-hidden="true">
                ✨
              </span>
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
              <StageLabel prompt={currentPrompt} />
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
            {" "}
            <span className="stage-mark" aria-hidden="true">
              🎯
            </span>
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
            {" "}
            <span className="stage-mark" aria-hidden="true">
              {game?.result === "correct" ? "✨" : "🫣"}
            </span>
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
          <div className="result-meta">
            <p>
              You were playing with{" "}
              <span className="runtime-pill">{modelName}</span> at{" "}
              <span className="runtime-pill">{reasoningLevel}</span> reasoning.
            </p>
            <p>
              More models are coming soon to try this same trick.
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

function getPreviewGame(): GameState | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (new URLSearchParams(window.location.search).get("preview") !== "result") {
    return null;
  }

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
    finalGuess: "Taylor Swift",
    result: "correct"
  };
}
