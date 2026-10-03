import { useRef, type PointerEvent, type KeyboardEvent } from "react";
import artwork from "./equity-demo.svg?raw";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (value: number) => "$" + Math.round(value).toLocaleString("en-US");

export default function EquityDemo() {
  const root = useRef<HTMLDivElement>(null);
  const selected = useRef(4);
  // The approved SVG contains the actual series paths, fills and labels.
  // Sample those paths so markers follow the same curves at every screen size.
  function update(x: number, reset = false) {
    const node = root.current;
    if (!node) return;
    const find = <T extends SVGElement>(name: string) => node.querySelector<T>(`[data-chart="${name}"]`)!;
    function sample(name: string) {
      const path = find<SVGPathElement>(name);
      let low = 0, high = path.getTotalLength();
      for (let i = 0; i < 24; i++) {
        const mid = (low + high) / 2;
        if (path.getPointAtLength(mid).x < x) low = mid; else high = mid;
      }
      return path.getPointAtLength((low + high) / 2).y;
    }
    const strategyY = reset ? 68 : sample("strategy");
    const benchmarkY = reset ? 112 : sample("benchmark");
    const index = reset ? 4 : Math.round(x / 640 * 11);
    selected.current = index;
    find("cursor").setAttribute("d", `M${x} -12V176`);
    for (const [name, y] of [["cursor-top", -12], ["strategy-dot", strategyY], ["benchmark-dot", benchmarkY]] as const) {
      find(name).setAttribute("cx", String(x));
      find(name).setAttribute("cy", String(y));
    }
    const left = reset ? 925 : Math.min(1368, Math.max(496, 561 + x * 1.48 + 20));
    const top = reset ? 565 : Math.min(658, Math.max(470, 457 + (strategyY + benchmarkY) * .81 - 38));
    find("tooltip").setAttribute("transform", `translate(${left - 925} ${top - 565})`);
    find("month").textContent = `${months[index]} 2026`;
    find("strategy-value").textContent = reset ? "$19,040" : money(25000 - (strategyY - 10) * 100);
    find("benchmark-value").textContent = reset ? "$14,803" : money(25000 - (benchmarkY - 10) * 100);
    node.querySelectorAll<SVGTextElement>('[data-chart="month-label"]').forEach((label, i) => {
      label.setAttribute("fill", i === index ? "#F9F9FA" : "#66636E");
      label.setAttribute("font-weight", i === index ? "500" : "400");
    });
  }
  function pointer(event: PointerEvent<HTMLDivElement>) {
    const box = root.current!.getBoundingClientRect();
    const svgX = 472 + (event.clientX - box.left) / box.width * 1072;
    update(Math.max(0, Math.min(640, (svgX - 561) / 1.48)));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === "Home" ? 0 : event.key === "End" ? 11 : Math.max(0, Math.min(11, selected.current + (event.key === "ArrowRight" ? 1 : -1)));
    update(index / 11 * 640);
  }
  return <div ref={root} className="landing-chart-demo" role="group" tabIndex={0}
    aria-label="Equity performance demo. Hover or touch to explore. Use arrow keys to select a month."
    onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={() => update(232, true)} onKeyDown={keyboard}
    dangerouslySetInnerHTML={{ __html: artwork }} />;
}
