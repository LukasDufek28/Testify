import { useRef } from "react";
import "./landing.css";

export default function Landing() {
  const signIn = useRef<HTMLDialogElement>(null);
  const points = [
    0.92, 0.84, 0.89, 0.68, 0.71, 0.64, 0.73, 0.57, 0.6, 0.39, 0.45, 0.31, 0.35,
    0.19, 0.23, 0.08,
  ]
    .map((v, i) => `${58 + (i * 518) / 15},${64 + v * 107}`)
    .join(" ");
  return (
    <div className="landing">
      <header className="landing-header">
        <a href="#" aria-label="Testify home">
          <img
            className="landing-logo"
            src="/testify-logo.png"
            alt="Testify"
            width="150"
            height="50"
          />
        </a>
        <nav aria-label="Main navigation">
          <a className="landing-nav-link" href="#how-it-works">
            How it works
          </a>
          <a className="landing-nav-link" href="#product-preview">
            Product preview
          </a>
          <button
            className="landing-button landing-secondary"
            onClick={() => signIn.current?.showModal()}
          >
            Sign in
          </button>
          <a className="landing-button landing-primary" href="#/app/studio">
            Start for free
          </a>
        </nav>
      </header>
      <main>
        <section className="landing-hero" aria-labelledby="landing-heading">
          <div className="landing-copy">
            <span className="landing-kicker">FREE AI STRATEGY BUILDER</span>
            <h1 id="landing-heading">
              Create and backtest
              <br />
              trading strategies
              <br />
              for free.
            </h1>
            <p>
              Turn an idea into clear trading rules with Gemini.{" "}
              <br className="landing-desktop-break" />
              Test it on historical data, understand the results,{" "}
              <br className="landing-desktop-break" />
              and improve the next version.
            </p>
            <div className="landing-actions">
              <a className="landing-button landing-primary" href="#/app/studio">
                Start for free
              </a>
              <a
                className="landing-button landing-secondary"
                href="#/app/overview"
              >
                Explore the product
              </a>
            </div>
            <div className="landing-flow">
              Describe → Create → Backtest → Review
            </div>
          </div>
          <section
            className="landing-preview"
            id="product-preview"
            aria-labelledby="preview-heading"
          >
            <h2 id="preview-heading">From idea to evidence</h2>
            <p className="landing-preview-caption">
              Product preview · example strategy
            </p>
            <span className="landing-strategy">BTC trend crossover · v3</span>
            <div className="landing-metrics">
              {[
                ["Net return", "+12.4%"],
                ["Max drawdown", "-3.2%"],
                ["Trades", "84"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <figure className="landing-chart">
              <figcaption>Equity · example result</figcaption>
              <svg
                viewBox="0 0 608 212"
                role="img"
                aria-label="Example equity curve rising from about ten thousand to eleven thousand dollars between January and June"
              >
                {[0, 1, 2, 3].map((i) => (
                  <g key={i}>
                    <line
                      x1="58"
                      x2="576"
                      y1={64 + (i * 107) / 3}
                      y2={64 + (i * 107) / 3}
                    />
                    <text x="12" y={69 + (i * 107) / 3}>
                      {["$11.2k", "$10.8k", "$10.4k", "$10.0k"][i]}
                    </text>
                  </g>
                ))}
                <polyline points={points} />
                <text className="landing-chart-month" x="58" y="196">
                  Jan
                </text>
                <text className="landing-chart-month" x="317" y="196">
                  Apr
                </text>
                <text className="landing-chart-month" x="554" y="196">
                  Jun
                </text>
              </svg>
            </figure>
          </section>
        </section>
        <section
          className="landing-steps"
          id="how-it-works"
          aria-label="How it works"
        >
          {[
            ["01", "Describe your idea", "Explain entry, exit and risk rules."],
            [
              "02",
              "Build with Gemini",
              "Review and save a validated strategy.",
            ],
            [
              "03",
              "Test and improve",
              "Compare outcomes and refine the rules.",
            ],
          ].map(([number, title, description]) => (
            <article key={number}>
              <h2>
                {number} {title}
              </h2>
              <p>{description}</p>
            </article>
          ))}
        </section>
      </main>
      <footer>
        Backtesting shows historical outcomes. Results are examples, not
        forecasts.
      </footer>
      <dialog
        ref={signIn}
        className="landing-dialog"
        aria-labelledby="sign-in-title"
        onClick={(e) => {
          if (e.target === signIn.current) signIn.current.close();
        }}
      >
        <h2 id="sign-in-title">Start your research</h2>
        <p>
          Account sign-in is coming soon. You can use the free workspace now;
          your strategies and results are saved in this browser.
        </p>
        <div>
          <a
            className="landing-button landing-primary"
            href="#/app/studio"
            onClick={() => signIn.current?.close()}
          >
            Continue for free
          </a>
          <button
            className="landing-button landing-secondary"
            onClick={() => signIn.current?.close()}
          >
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}
