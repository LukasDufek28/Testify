import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, LoaderCircle, Plus, X } from "lucide-react";

type Props = {
  value: string; onChange: (value: string) => void;
  busy: boolean; processing?: boolean; canModify: boolean; strategyName?: string;
  contextCount: number; hasBacktests?: boolean; children: ReactNode;
  onAsk: () => void;
  onGenerate: () => void; onModify: () => void;
};

export default function GeminiComposer({ value, onChange, busy, processing = false, canModify, strategyName, contextCount, hasBacktests = false, children, onAsk, onGenerate, onModify }: Props) {
  const [mode, setMode] = useState<"code" | "ask">("code");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const modifying = canModify;
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
  const send = () => { if (busy || ((mode === "ask" || !modifying) && !value.trim())) return; setOpen(false); mode === "ask" ? onAsk() : modifying ? onModify() : onGenerate(); };
  return <div className="gemini-composer" ref={root}>
    {open && modifying && hasBacktests && <div className="composer-context" role="region" aria-label="Gemini options">
      <div className="composer-context-head"><strong>Gemini context</strong><button type="button" className="composer-icon" aria-label="Close context" onClick={() => setOpen(false)}><X size={17}/></button></div>
      {modifying && <><p className="help">Editing {strategyName}. Only matching development results are included.</p>{children}</>}
    </div>}
    <div className="composer-bar"><select className="composer-regime" aria-label="Gemini mode" value={mode} disabled={busy} onChange={event => setMode(event.target.value as "code" | "ask")}><option value="code">Code</option><option value="ask">Ask</option></select>
      {modifying && hasBacktests && <button type="button" className="composer-icon composer-add" aria-label="Add strategy or performance context" aria-expanded={open} onClick={() => setOpen(!open)}><Plus size={21}/></button>}
      <textarea ref={input} rows={1} aria-label="Message Gemini" placeholder={mode === "ask" ? "Ask about your strategy or results�" : modifying ? "Ask Gemini to improve your strategy…" : "Describe a strategy…"} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}/>
      <button type="button" className={`composer-send${processing ? " is-processing" : ""}`} aria-busy={processing} aria-label={processing ? "Gemini is processing your prompt" : busy ? "Gemini unavailable while an operation is running" : mode === "ask" ? "Send strategy question" : modifying ? "Send strategy revision" : "Send new strategy request"} disabled={busy || ((mode === "ask" || !modifying) && !value.trim())} onClick={send}>{processing ? <span className="composer-spinner" aria-hidden="true"><LoaderCircle size={19}/></span> : <ArrowUp size={20}/>}</button>
    </div>
    {modifying && <div className="composer-attached"><span>{strategyName}</span>{contextCount > 0 && <span>{contextCount} runs attached</span>}</div>}
  </div>;
}
