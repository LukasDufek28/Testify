import { metricColor } from "./theme";
import { useEffect, useRef, useState } from "react";

// Only standalone amounts animate: dates, names, unavailable values and infinity remain intact.
export default function AnimatedValue({ value, tone }: { value: string; tone?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const decimal = ".";
    const match = value.match(/^([+−-]?\$?)([\d.,\s]+)(%|R| bps)?$/);
    // This short count-up is explicitly requested, including with system reduced motion.
    if (!match) { setDisplay(value); return; }
    const raw = match[2].trim();
    const separator = raw.includes(decimal) ? decimal : /\.\d{1,2}$/.test(raw) ? "." : decimal;
    const fraction = raw.includes(separator) ? raw.split(separator).at(-1)!.length : 0;
    const target = Number(raw.replace(separator, "D").replace(/[^\dD]/g, "").replace("D", "."));
    if (!Number.isFinite(target)) { setDisplay(value); return; }
    const format = (amount: number) => match[1] + amount.toLocaleString("en-US", { minimumFractionDigits: fraction, maximumFractionDigits: fraction }) + (match[3] || "");
    setDisplay(format(0));
    let frame = 0, timer = 0, started = false;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || started) return;
      started = true; observer.disconnect();
      let delay = 0;
      for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (css.animationName !== "none") delay = Math.max(delay, ...css.animationDelay.split(",").map(v => parseFloat(v) * (v.trim().endsWith("ms") ? 1 : 1000)));
      }
      timer = window.setTimeout(() => {
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / 1100);
          setDisplay(progress === 1 ? value : format(target * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }, delay);
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [value]);
  return <span ref={ref} className="animated-value" style={tone === undefined ? undefined : {color:metricColor(tone)}} data-tone={tone} aria-label={value}><span aria-hidden="true">{display}</span></span>;
}
