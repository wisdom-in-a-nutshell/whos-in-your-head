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

type Phase = "start" | "asking" | "thinking" | "guessing" | "result";
type Answer = "yes" | "no";

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
        <span className="round-count">{MAX_QUESTIONS} questions</span>
      </header>

      {phase === "start" ? (
        <section className="start-screen" aria-labelledby="start-title">
          <div className="start-copy">
            <p className="kicker">Silent party game</p>
            <h1 id="start-title">Think of someone famous.</h1>
            <p className="start-subtitle">
              Don&apos;t type it. Don&apos;t say it out loud. I get 21
              questions. You just say yes or no. Then I guess who&apos;s in
              your head.
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
            <span>Who&apos;s In Your Head?</span>
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
              {phase === "thinking" ? "I’m thinking" : "Answer honestly"}
            </p>
            <h2 id="question-title">
              {phase === "thinking" ? "Give me a second." : currentQuestion}
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
