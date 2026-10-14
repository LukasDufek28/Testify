import { useEffect, useRef, type PointerEvent, type KeyboardEvent } from "react";
import artwork from "./equity-demo.svg?raw";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (value: number) => "$" + Math.round(value).toLocaleString("en-US");

export default function EquityDemo() {
  const root = useRef<HTMLDivElement>(null);
  const selected = useRef(4);
  const layout = useRef({width:1072,height:458,left:89,top:91,plotWidth:947,plotHeight:300});
  useEffect(() => {
    const node = root.current!;
    const svg = node.querySelector("svg")!;
    const series = node.querySelector('[data-chart="strategy"]')!.parentElement!;
    const original = [...svg.querySelectorAll("text,circle,path,rect")].filter(el => !series.contains(el) && !el.closest('[data-chart="tooltip"]'));
    const coordinates = original.map(element => ({el:element as SVGElement,x:Number(element.getAttribute("x") ?? element.getAttribute("cx")),y:Number(element.getAttribute("y") ?? element.getAttribute("cy"))}));
    const resize = () => {
      const width = node.clientWidth;
      if (!width) return;
      const height = Math.max(300,Math.min(530,width*.39));
      const left = width < 500 ? 44 : 72;
      const top = width < 500 ? 100 : 88;
      const plotWidth = width-left-28;
      const plotHeight = height-top-58;
      layout.current={width,height,left,top,plotWidth,plotHeight};
      svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
      svg.style.height=`${height}px`;
      series.setAttribute("transform",`translate(${left} ${top}) scale(${plotWidth/640} ${plotHeight/185})`);
      series.querySelectorAll("path").forEach(path => path.setAttribute("vector-effect","non-scaling-stroke"));
      const card=svg.querySelector("#Reference-chart-striped-fade > rect")!;
      card.setAttribute("x","0");card.setAttribute("y","0");card.setAttribute("width",String(width));card.setAttribute("height",String(height));
      coordinates.forEach(({el,x,y}) => {
        if(el===card)return;
        if(el.matches('[data-chart="month-label"]')) {
          const i=months.indexOf(el.textContent!);
          el.setAttribute("x",String(left+i/11*plotWidth));el.setAttribute("y",String(height-22));
          el.setAttribute("text-anchor",i===0?"start":i===11?"end":"middle");
          el.style.display=width<600 && i%2===1 && i!==11?"none":"";
          el.setAttribute("font-size",width<500?"11":"13");
        } else if(el.tagName==="text" && y>=472) {
          el.setAttribute("x","20");el.setAttribute("y",String(top+(y-457)/1.62/185*plotHeight));
        } else if(x>=1243) {
          const legendLeft=width<500?left:width-295;
          const dx=x-1243;
          el.setAttribute(el.tagName==="circle"?"cx":"x",String(legendLeft+dx));
          el.setAttribute(el.tagName==="circle"?"cy":"y",String(y-366+(width<500?37:0)));
        } else if(el.tagName==="path") {
          el.setAttribute("transform","translate(-472 -366)");
        } else {
          el.setAttribute(el.tagName==="circle"?"cx":"x",String(x-472));
          el.setAttribute(el.tagName==="circle"?"cy":"y",String(y-366));
        }
      });
      update(selected.current/11*640);
    };
    const observer=new ResizeObserver(resize);observer.observe(node);resize();
    return()=>observer.disconnect();
  },[]);
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
    const size=layout.current;
    const pointX=size.left+x/640*size.plotWidth;
    const left=Math.max(8,Math.min(size.width-160,pointX+20));
    const top=Math.max(size.top,Math.min(size.height-150,size.top+(strategyY+benchmarkY)/2/185*size.plotHeight-38));
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
    const size=layout.current;
    update(Math.max(0,Math.min(640,(event.clientX-box.left-size.left)/size.plotWidth*640)));
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

