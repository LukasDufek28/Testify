// Interactions follow the exported paths; the approved artwork remains unchanged.
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
type MovingShape = {
  element: SVGGraphicsElement;
  transform: string;
  box: DOMRect;
};
type Preview = {
  equity: SVGPathElement;
  drawdown: SVGPathElement;
  crosshair: MovingShape;
  dots: MovingShape[];
  tooltip: MovingShape;
  month: SVGTextElement;
  balance: SVGTextElement;
  loss: SVGTextElement;
  labels: SVGTextElement[];
  valueTicks: SVGTextElement[];
  lossTicks: SVGTextElement[];
};
const previews = new WeakMap<SVGSVGElement, Preview>();
function shape(element: Element): SVGGraphicsElement {
  return element.closest('[id^="shape-"]') as SVGGraphicsElement;
}
function moving(element: SVGGraphicsElement): MovingShape {
  return {
    element,
    transform: element.getAttribute("transform") || "",
    box: element.getBBox(),
  };
}
function move(s: MovingShape, dx: number, dy = 0) {
  if (!dx && !dy) {
    if (s.transform) s.element.setAttribute("transform", s.transform);
    else s.element.removeAttribute("transform");
  } else
    s.element.setAttribute(
      "transform",
      `translate(${dx} ${dy}) ${s.transform}`,
    );
}
function atX(path: SVGPathElement, x: number): DOMPoint {
  const svg = path.ownerSVGElement!;
  const matrix = svg.getCTM()!.inverse().multiply(path.getCTM()!);
  let lo = 0,
    hi = path.getTotalLength();
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2,
      point = path.getPointAtLength(mid).matrixTransform(matrix);
    if (point.x < x) lo = mid;
    else hi = mid;
  }
  return path.getPointAtLength((lo + hi) / 2).matrixTransform(matrix);
}
function valueAt(ticks: SVGTextElement[], y: number, suffix: string): number | null {
  const rows = ticks
    .map((t) => ({
      value: parseFloat(t.textContent || "0") * (suffix === "k" ? 1000 : 1),
      y: t.getBBox().y + t.getBBox().height / 2,
    }))
    .filter((row) => Number.isFinite(row.value) && Number.isFinite(row.y))
    .sort((a, b) => a.y - b.y);
  if (!rows.length) return null;
  if (rows.length === 1 || rows.at(-1)!.y === rows[0].y) return rows[0].value;
  return (
    rows[0].value +
    ((y - rows[0].y) / (rows.at(-1)!.y - rows[0].y)) *
      (rows.at(-1)!.value - rows[0].value)
  );
}
export function updateApprovedPreview(root: HTMLElement, selected: number) {
  const svg = root.querySelector("svg");
  if (!svg) return;
  let preview = previews.get(svg);
  if (!preview) {
    const texts = [...svg.querySelectorAll("text")],
      paths = [...svg.querySelectorAll("path")];
    const equity = paths.find(
      (p) =>
        (p.getAttribute("style") || "").includes("stroke: url") &&
        (p.getAttribute("d") || "").length > 1000,
    );
    const drawdown = paths.find(
      (p) =>
        (p.getAttribute("style") || "").includes(
          "stroke: rgb(230, 154, 154)",
        ) && (p.getAttribute("d") || "").length > 1000,
    );
    const cross = paths.find(
      (p) =>
        /^M([\d.]+),[\d.]+L\1,[\d.]+$/.test(p.getAttribute("d") || "") &&
        p.getBBox().height > 100,
    );
    const month = texts.find((t) => /^\w{3} 2026$/.test(t.textContent || "")),
      balance = texts.find((t) => /^\$\d/.test(t.textContent || ""));
    if (!equity || !drawdown || !cross || !month || !balance) return;
    const loss = texts.find((t) =>
      /^\d+\.\d+%$/.test(t.textContent || ""),
    );
    if (!loss) return;
    // Exported tooltip pieces are siblings of the axes, not a nested group.
    const first = shape(month).previousElementSibling;
    const last = shape(loss);
    if (!first || first.parentElement !== last.parentElement) return;
    const pieces: Element[] = [];
    for (let piece: Element | null = first; piece; piece = piece.nextElementSibling) {
      pieces.push(piece);
      if (piece === last) break;
    }
    if (pieces.at(-1) !== last) return;
    const tooltip = document.createElementNS("http://www.w3.org/2000/svg", "g");
    first.before(tooltip);
    tooltip.append(...pieces);
    const x = cross.getBBox().x;
    const dots = paths
      .filter((p) => {
        const b = p.getBBox(),
          style = p.getAttribute("style") || "";
        return (
          b.width > 1 &&
          b.width < 10 &&
          Math.abs(b.x + b.width / 2 - x) < 1 &&
          !style.includes("fill: none")
        );
      })
      .map((p) => moving(shape(p)));
    preview = {
      equity,
      drawdown,
      crosshair: moving(shape(cross)),
      dots,
      tooltip: moving(tooltip),
      month,
      balance,
      loss,
      labels: texts.filter((t) => monthNames.includes(t.textContent || "")),
      valueTicks: texts.filter((t) => /^\d+k$/.test(t.textContent || "")),
      lossTicks: texts.filter(
        (t) => /^\d+%$/.test(t.textContent || "") && !tooltip.contains(t),
      ),
    };
    previews.set(svg, preview);
    equity.dataset.chart = "strategy";
    drawdown.dataset.chart = "benchmark";
    month.dataset.chart = "month";
    balance.dataset.chart = "strategy-value";
  }
  const p = preview,
    label = p.labels[selected];
  if (!label) return;
  const x =
      selected === 4
        ? p.crosshair.box.x
        : label.getBBox().x + label.getBBox().width / 2,
    dx = x - p.crosshair.box.x;
  const equity = atX(p.equity, x),
    drawdown = atX(p.drawdown, x);
  move(p.crosshair, dx);
  for (const dot of p.dots) {
    const fill = dot.element.querySelector("path")?.getAttribute("style") || "",
      center = dot.box.y + dot.box.height / 2;
    move(
      dot,
      dx,
      selected === 4
        ? 0
        : fill.includes("145, 245, 171")
          ? equity.y - center
          : fill.includes("230, 154, 154")
            ? drawdown.y - center
            : 0,
    );
  }
  const desired = Math.max(
    4,
    Math.min(svg.viewBox.baseVal.width - p.tooltip.box.width - 4, x + 15),
  );
  move(p.tooltip, selected === 4 ? 0 : desired - p.tooltip.box.x);
  p.month.textContent = monthNames[selected] + " 2026";
  const balanceValue = valueAt(p.valueTicks, equity.y, "k");
  const lossValue = valueAt(p.lossTicks, drawdown.y, "%");
  if (balanceValue !== null) p.balance.textContent =
    selected === 4
      ? "$20037"
      : "$" + Math.round(balanceValue);
  if (lossValue !== null) p.loss.textContent =
    selected === 4
      ? "20.6%"
      : Math.max(0, lossValue).toFixed(1) + "%";
  for (const t of p.labels)
    t.style.fill =
      t.textContent === monthNames[selected] ? "#f9f9fa" : "#66636e";
}
