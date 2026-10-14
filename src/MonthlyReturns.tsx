import { useState } from "react";
import { BarChart3 } from "lucide-react";
import "./monthly-returns.css";
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
const sample = [.8, 2.1, 4.2, 8.4, 3.8, 2.5, 3.9];
export default function MonthlyReturns({values = sample, demo = true}:{values?:number[];demo?:boolean}) {
  const [active,setActive] = useState(3);
  const value = values[active] ?? 0;
  return <section className="monthly-return-card" aria-label={demo ? "Monthly returns demo" : "Monthly returns"}>
    <header><span><BarChart3 size={14}/> Monthly returns</span><span className={`monthly-change ${value < 0 ? "is-negative" : ""}`}>{value >= 0 ? "+" : ""}{value.toFixed(1)}%</span></header>
    <strong>{demo ? "$12,448" : `${value>=0?"+":""}${value.toFixed(2)}%`}</strong>
    <div className="monthly-bars">{values.map((amount,i)=><button key={i} aria-label={`${months[i % 12] || `Month ${i+1}`}: ${amount>=0?"+":""}${amount.toFixed(1)}%`} aria-pressed={active===i} onPointerEnter={()=>setActive(i)} onFocus={()=>setActive(i)} onClick={()=>setActive(i)}><span style={{height:`${Math.max(12,Math.min(100,Math.abs(amount)/Math.max(...values.map(Math.abs),1)*100))}%`}}/><small>{months[i%12] || `M${i+1}`}</small></button>)}</div>
  </section>;
}
