"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
type Answer = "yes" | "no" | "unsure";

type Turn = {
  question: string;
  answer: Answer;
};

export default function Home() {
  const thinkingTimeoutRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("start");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [result, setResult] = useState<"won" | "lost" | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<Answer | null>(null);

  const progressMarks = useMemo(
    () => Array.from({ length: MAX_QUESTIONS }, (_, index) => index + 1),
    []
  );

  const questionNumber = Math.min(questionIndex + 1, MAX_QUESTIONS);
  const currentQuestion = sampleQuestions[questionIndex] ?? sampleQuestions.at(-1);
  const answeredCount = turns.length;
  const questionLabel = questionLabels[questionIndex % questionLabels.length];
  const thinkingLabel = thinkingLabels[answeredCount % thinkingLabels.length];

  function clearThinkingTimeout() {
    if (thinkingTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(thinkingTimeoutRef.current);
    thinkingTimeoutRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (thinkingTimeoutRef.current !== null) {
        window.clearTimeout(thinkingTimeoutRef.current);
      }
    };
  }, []);

  function startGame() {
    clearThinkingTimeout();
    setPhase("asking");
    setQuestionIndex(0);
    setTurns([]);
    setResult(null);
    setSelectedAnswer(null);
  }

  function answerQuestion(answer: Answer) {
    if (phase !== "asking" || !currentQuestion) {
      return;
    }

    const nextTurns = [...turns, { question: currentQuestion, answer }];
    setTurns(nextTurns);
    setSelectedAnswer(answer);
    setPhase("thinking");

    thinkingTimeoutRef.current = window.setTimeout(() => {
      thinkingTimeoutRef.current = null;

      if (questionIndex >= sampleQuestions.length - 1) {
        setSelectedAnswer(null);
        setPhase("guessing");
        return;
      }

      setQuestionIndex((index) => index + 1);
      setSelectedAnswer(null);
      setPhase("asking");
    }, 860);
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
                  Thinking
                  <ThinkingDots />
                </>
              ) : (
                currentQuestion
              )}
            </h2>
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
              className={selectedAnswer === "unsure" ? "is-selected" : undefined}
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
