import AnimatedValue from "./AnimatedValue";
import { useMemo, useState } from "react";
import type { Run } from "./types";

type Props = { title: string; runs: Run[]; selectedIds: string[]; onChange: (ids: string[]) => void; emptyText: string };
export default function RunPicker({ title, runs, selectedIds, onChange, emptyText }: Props) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => runs.filter((run) => `${run.name} ${run.symbol} ${run.strategyName}`.toLowerCase().includes(search.trim().toLowerCase())), [runs, search]);
  const selected = new Set(selectedIds);
  return <div className="market-picker run-picker">
    <div className="market-picker-head"><strong>{title} <span>({runs.filter((run) => selected.has(run.id)).length} selected)</span></strong><div className="button-row"><button type="button" className="button subtle" disabled={!visible.length} onClick={() => onChange([...new Set([...selectedIds, ...visible.map((run) => run.id)])])}>Check shown</button><button type="button" className="button ghost" disabled={!visible.length} onClick={() => onChange(selectedIds.filter((id) => !visible.some((run) => run.id === id)))}>Uncheck shown</button></div></div>
    <input className="market-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search run names, markets or strategies…" aria-label={`Search ${title.toLowerCase()}`}/>
    <div className="market-options">{visible.map((run) => <label key={run.id} className="market-check run-check"><input type="checkbox" checked={selected.has(run.id)} onChange={(event) => onChange(event.target.checked ? [...selectedIds, run.id] : selectedIds.filter((id) => id !== run.id))}/><span><strong>{run.name}</strong><small>{run.symbol} · {run.strategyName} · {new Date(run.createdAt).toLocaleDateString()} · <AnimatedValue value={`${run.metrics.netReturnPct >= 0 ? "+" : ""}${run.metrics.netReturnPct.toFixed(2)}%`}/></small></span></label>)}{!visible.length && <p className="empty-copy">{runs.length ? "No matching runs." : emptyText}</p>}</div>
  </div>;
}
