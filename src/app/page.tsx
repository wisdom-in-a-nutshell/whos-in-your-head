import Link from "next/link";

export default function Home() {
  const progressMarks = Array.from({ length: 21 }, (_, index) => index + 1);

  return (
    <main className="game-shell">
      <header className="game-header" aria-label="Game header">
        <Link className="wordmark" href="/">
          Who&apos;s In Your Head?
        </Link>
        <span className="round-count">21 questions</span>
      </header>

      <section className="start-screen" aria-labelledby="start-title">
        <div className="start-copy">
          <p className="kicker">Silent party game</p>
          <h1 id="start-title">Think of someone famous.</h1>
          <p className="start-subtitle">
            Don&apos;t type it. Don&apos;t say it out loud. I get 21 questions,
            then I&apos;m guessing who&apos;s in your head.
          </p>
          <button className="primary-action" type="button">
            I&apos;ve got someone
          </button>
        </div>

        <div className="progress-lockup" aria-label="21 question limit">
          <span>Question limit</span>
          <div className="progress-marks" aria-hidden="true">
            {progressMarks.map((mark) => (
              <span key={mark} className={mark <= 7 ? "mark is-used" : "mark"} />
            ))}
          </div>
        </div>
      </section>

      <section className="play-screen" aria-labelledby="question-title">
        <div className="play-topline">
          <span>Who&apos;s In Your Head?</span>
          <strong>Question 7 / 21</strong>
        </div>

        <div className="question-stage">
          <p className="stage-label">Answer honestly</p>
          <h2 id="question-title">Are they mainly known as an actor?</h2>
        </div>

        <div className="answer-grid" aria-label="Answer choices">
          <button type="button">Yes</button>
          <button type="button">No</button>
          <button type="button">Not sure</button>
        </div>
      </section>

      <section className="guess-screen" aria-labelledby="guess-title">
        <p className="stage-label">Final guess</p>
        <h2 id="guess-title">Is it Zendaya?</h2>
        <p className="guess-stat">12 questions used</p>
        <div className="guess-actions" aria-label="Judge the final guess">
          <button className="primary-action" type="button">
            Correct
          </button>
          <button className="secondary-action" type="button">
            Nope
          </button>
        </div>
      </section>
    </main>
  );
}
