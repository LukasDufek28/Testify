import { useEffect, useRef, useState } from "react";

// Only standalone amounts animate: dates, names, unavailable values and infinity remain intact.
export default function AnimatedValue({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const decimal = new Intl.NumberFormat().formatToParts(1.1).find(part => part.type === "decimal")?.value || ".";
    const match = value.match(/^([+−-]?\$?)([\d.,\s]+)(%|R| bps)?$/);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!match || motion.matches) { setDisplay(value); return; }
    const raw = match[2].trim();
    const separator = raw.includes(decimal) ? decimal : /\.\d{1,2}$/.test(raw) ? "." : decimal;
    const fraction = raw.includes(separator) ? raw.split(separator).at(-1)!.length : 0;
    const target = Number(raw.replace(separator, "D").replace(/[^\dD]/g, "").replace("D", "."));
    if (!Number.isFinite(target)) { setDisplay(value); return; }
    const format = (amount: number) => match[1] + amount.toLocaleString(undefined, { minimumFractionDigits: fraction, maximumFractionDigits: fraction }) + (match[3] || "");
    setDisplay(format(0));
    let frame = 0, timer = 0, started = false;
    const finish = () => { cancelAnimationFrame(frame); clearTimeout(timer); setDisplay(value); };
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
          const progress = Math.min(1, (now - start) / 550);
          setDisplay(progress === 1 ? value : format(target * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }, delay);
    });
    observer.observe(element);
    const onMotion = () => { if (motion.matches) { observer.disconnect(); finish(); } };
    motion.addEventListener("change", onMotion);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer); motion.removeEventListener("change", onMotion); };
  }, [value]);
  return <span ref={ref} className="animated-value" aria-label={value}><span aria-hidden="true">{display}</span></span>;
}
