import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, LoaderCircle, Plus, X } from "lucide-react";

type Props = {
  value: string; onChange: (value: string) => void;
  busy: boolean; canModify: boolean; strategyName?: string;
  contextCount: number; children: ReactNode;
  onGenerate: () => void; onModify: () => void;
};

export default function GeminiComposer({ value, onChange, busy, canModify, strategyName, contextCount, children, onGenerate, onModify }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "modify">("create");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const modifying = mode === "modify" && canModify;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector<HTMLButtonElement>(".composer-add")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => {
    if (input.current) { input.current.style.height = "auto"; input.current.style.height = `${Math.min(input.current.scrollHeight, 180)}px`; }
  }, [value]);
  const send = () => { if (busy || (!modifying && !value.trim())) return; setOpen(false); modifying ? onModify() : onGenerate(); };
  return <div className="gemini-composer" ref={root}>
    {open && <div className="composer-context" role="region" aria-label="Gemini options">
      <div className="composer-context-head"><strong>Gemini context</strong><button type="button" className="composer-icon" aria-label="Close context" onClick={() => setOpen(false)}><X size={17}/></button></div>
      <div className="composer-modes"><button type="button" aria-pressed={!modifying} onClick={() => setMode("create")}>New strategy</button><button type="button" aria-pressed={modifying} disabled={!canModify} onClick={() => setMode("modify")}>Modify selected</button></div>
      {!canModify && <p className="help">Select a saved strategy to modify it.</p>}
      {modifying && <><p className="help">Editing {strategyName}. Only matching development results are included.</p>{children}</>}
    </div>}
    <div className="composer-bar">
      <button type="button" className="composer-icon composer-add" aria-label="Add strategy or performance context" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={21}/></button>
      <textarea ref={input} rows={1} aria-label="Message Gemini" placeholder={modifying ? "Ask Gemini to improve your strategy…" : "Describe a strategy…"} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/>
      <button type="button" className="composer-send" aria-label={busy ? "Gemini unavailable while an operation is running" : modifying ? "Send strategy revision" : "Send new strategy request"} disabled={busy || (!modifying && !value.trim())} onClick={send}>{busy ? <LoaderCircle size={19} className="composer-spinner"/> : <ArrowUp size={20}/>}</button>
    </div>
    {modifying && <div className="composer-attached"><span>{strategyName}</span>{contextCount > 0 && <span>{contextCount} runs attached</span>}<button type="button" onClick={() => setMode("create")}>Clear context</button></div>}
  </div>;
}
