"use client";

import { useMemo, useState } from "react";

const MAX_QUESTIONS = 21;

const sampleQuestions = [
  "Are they alive?",
  "Are they mainly known for entertainment?",
  "Are they American?",
  "Are they mainly known as an actor?",
  "Did they become famous before 2010?",
  "Are they known for music too?"
];

const questionLabels = [
  "Don’t overthink it",
  "Tiny clue, please",
  "For you, human",
  "This one matters",
  "Say what you know",
  "One clean answer",
  "Help me out",
  "Mind-reader mode",
  "Your move",
  "No pressure",
  "Just one clue",
  "Truth serum time",
  "Human input needed",
  "Don’t help too much",
  "One bit of signal",
  "Say it straight",
  "Keep it secret",
  "Stay mysterious",
  "Clue me in",
  "Don’t blink",
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
  "Keep a straight face"
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
  "Rechecking the map"
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
type Answer = "yes" | "no" | "unsure";

type Turn = {
  question: string;
  answer: Answer;
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [result, setResult] = useState<"won" | "lost" | null>(null);

  const progressMarks = useMemo(
    () => Array.from({ length: MAX_QUESTIONS }, (_, index) => index + 1),
    []
  );

  const questionNumber = Math.min(questionIndex + 1, MAX_QUESTIONS);
  const currentQuestion = sampleQuestions[questionIndex] ?? sampleQuestions.at(-1);
  const answeredCount = turns.length;
  const questionLabel = questionLabels[questionIndex % questionLabels.length];
  const thinkingLabel = thinkingLabels[answeredCount % thinkingLabels.length];

  function startGame() {
    setPhase("asking");
    setQuestionIndex(0);
    setTurns([]);
    setResult(null);
  }

  function answerQuestion(answer: Answer) {
    if (phase !== "asking" || !currentQuestion) {
      return;
    }

    const nextTurns = [...turns, { question: currentQuestion, answer }];
    setTurns(nextTurns);
    setPhase("thinking");

    window.setTimeout(() => {
      if (questionIndex >= sampleQuestions.length - 1) {
        setPhase("guessing");
        return;
      }

      setQuestionIndex((index) => index + 1);
      setPhase("asking");
    }, 520);
  }

  function judgeGuess(nextResult: "won" | "lost") {
    setResult(nextResult);
    setPhase("result");
  }

  return (
    <main className="game-shell">
      <header className="game-header" aria-label="Game header">
        <button className="wordmark" onClick={startGame} type="button">
          Who&apos;s In Your Head?
        </button>
        <span className="round-count">{MAX_QUESTIONS} questions · 1 guess</span>
      </header>

      {phase === "start" ? (
        <section className="start-screen" aria-labelledby="start-title">
          <div className="start-copy">
            <p className="kicker">Silent party game</p>
            <h1 id="start-title">Think of someone famous.</h1>
            <p className="start-subtitle">
              Don&apos;t type it. Don&apos;t say it out loud. I get 21
              questions and one final guess. You just say yes, no, or not sure.
              Then I guess who&apos;s in your head.
            </p>
            <button className="primary-action" onClick={startGame} type="button">
              I&apos;ve got someone
            </button>
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
            <span>Keep them secret</span>
            <strong>
              Question {questionNumber} / {MAX_QUESTIONS}
            </strong>
          </div>

          <div className="progress-marks play-progress" aria-hidden="true">
            {progressMarks.map((mark) => (
              <span
                key={mark}
                className={mark <= questionNumber ? "mark is-used" : "mark"}
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
                  Reading the pattern
                  <ThinkingDots />
                </>
              ) : (
                currentQuestion
              )}
            </h2>
          </div>

          <div className="answer-grid" aria-label="Answer choices">
            <button
              disabled={phase === "thinking"}
              onClick={() => answerQuestion("yes")}
              type="button"
            >
              Yes
            </button>
            <button
              disabled={phase === "thinking"}
              onClick={() => answerQuestion("no")}
              type="button"
            >
              No
            </button>
            <button
              disabled={phase === "thinking"}
              onClick={() => answerQuestion("unsure")}
              type="button"
            >
              Not sure
            </button>
          </div>
        </section>
      ) : null}

      {phase === "guessing" ? (
        <section className="guess-screen" aria-labelledby="guess-title">
          <p className="stage-label">Final guess</p>
          <h2 id="guess-title">Is it Zendaya?</h2>
          <p className="guess-stat">{answeredCount} questions used</p>
          <div className="guess-actions" aria-label="Judge the final guess">
            <button
              className="primary-action"
              onClick={() => judgeGuess("won")}
              type="button"
            >
              Correct
            </button>
            <button
              className="secondary-action"
              onClick={() => judgeGuess("lost")}
              type="button"
            >
              Nope
            </button>
          </div>
        </section>
      ) : null}

      {phase === "result" ? (
        <section className="result-screen" aria-labelledby="result-title">
          <p className="stage-label">{result === "won" ? "Got it" : "Missed it"}</p>
          <h2 id="result-title">
            {result === "won"
              ? "I knew who was in your head."
              : "You beat me this round."}
          </h2>
          <p className="guess-stat">{answeredCount} questions used</p>
          <button className="primary-action" onClick={startGame} type="button">
            Play again
          </button>
        </section>
      ) : null}
    </main>
  );
}
