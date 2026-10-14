import { useEffect, useRef } from "react";
import "./landing.css";
import { DesignEquity, DesignMonthly, StrategyExample } from "./PenpotPrimitives";

const steps = [
  ["01", "Describe your idea", "Explain your entry, exit,", "and risk rules."],
  ["02", "Build with free AI", "Review the rules and save", "your strategy version."],
  ["03", "Test and improve", "Compare historical outcomes", "and refine the next run."],
];

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!elements) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.IntersectionObserver) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing" ref={root}>
      <header className="landing-header">
        <a className="landing-logo silver-text" href="#" aria-label="Testify home">TESTIFY</a>
        <nav aria-label="Main navigation">
          <a className="landing-nav-link" href="#how-it-works">How it works</a>
          <a className="landing-nav-link" href="#product-preview">Product</a>
          <a className="landing-button landing-primary" href="#/app/overview">Start for free</a>
        </nav>
      </header>
      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-heading">
          <div className="landing-copy">
            <span className="landing-kicker">FREE AI STRATEGY BUILDER</span>
            <h1 id="landing-heading" className="silver-text">
              <span>An idea is <br className="landing-mobile-break" />a start.</span>
              <span>Evidence is <br className="landing-mobile-break" />an edge.</span>
            </h1>
            <p className="landing-intro">Create and backtest<br className="landing-mobile-break"/> trading strategies for free.</p>
            <p className="landing-description">Turn your idea into clear rules.<br className="landing-mobile-break"/> Test, review, and improve.</p>
            <div className="landing-actions">
              <a className="landing-button landing-primary" href="#/app/overview">Start for free</a>
              <a className="landing-button landing-secondary" href="#product-preview">Explore</a>
            </div>
            <a className="landing-scroll" href="#product-preview">SCROLL TO EXPLORE</a>
          </div>
        </section>
        <section className="landing-preview" id="product-preview" aria-labelledby="preview-heading" data-reveal>
          <h2 id="preview-heading" className="silver-text">Your strategy.<br className="landing-mobile-break"/> A clearer picture.</h2>
          <p className="landing-preview-caption">Historical results, every trade, and the assumptions behind them.</p>
          <figure className="landing-chart" aria-label="Illustrative equity and drawdown chart">
            <DesignEquity responsivePreview />
          </figure>
          <div className="landing-showcase-row"><DesignMonthly/><StrategyExample onOpen={()=>{location.hash="#/app/strategies";}}/></div>
        </section>
        <section className="landing-process" id="how-it-works" aria-labelledby="process-heading" data-reveal>
          <h2 id="process-heading" className="silver-text">Less friction. More clarity.</h2>
          <div className="landing-steps">
            {steps.map(([number, title, first, second]) => (
              <article key={number}>
                <span className="landing-step-number">{number}</span>
                <h3>{title}</h3>
                <p>{first}<br />{second}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-final" aria-labelledby="final-heading" data-reveal>
          <h2 id="final-heading" className="silver-text"><span className="landing-desktop-copy">Start with an idea. Make it testable.</span><span className="landing-mobile-copy">Make your idea testable.</span></h2>
          <a className="landing-button landing-primary" href="#/app/overview">Open free workspace</a>
        </section>
      </main>
      <footer className="landing-footer">
        <a className="landing-footer-logo silver-text" href="#" aria-label="Testify home">TESTIFY</a>
        <p><span className="landing-desktop-copy">Backtesting shows historical outcomes. Examples are not forecasts.</span><span className="landing-mobile-copy">Historical outcomes are not forecasts.</span></p>
        <span>© Testify</span>
      </footer>
    </div>
  );
}
