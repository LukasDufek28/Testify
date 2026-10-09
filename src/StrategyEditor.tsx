import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import type { ScriptStrategy } from "./types";

export default function StrategyEditor({ source, onChange, readOnly }: { source: string; onChange: (value: string) => void; readOnly: boolean }) {
  const [mode, setMode] = useState<"code" | "json">("code");
  const script = useMemo(() => {
    try { const value = JSON.parse(source); return value?.version === 3 && typeof value.code === "string" ? value as ScriptStrategy : null; }
    catch { return null; }
  }, [source]);
  return <>
    {script && <div className="editor-toolbar"><div className="button-row"><button className={`button ${mode === "code" ? "subtle" : "ghost"}`} disabled={readOnly} onClick={() => setMode("code")}>Custom logic</button><button className={`button ${mode === "json" ? "subtle" : "ghost"}`} disabled={readOnly} onClick={() => setMode("json")}>Strategy JSON</button></div><span className="muted">Parameters and metadata are in Strategy JSON</span></div>}
    <div className="editor-wrap"><Editor height="420px" language={script && mode === "code" ? "javascript" : "json"} theme="vs-dark" value={script && mode === "code" ? script.code : source} onChange={(value) => { if (readOnly) return; onChange(script && mode === "code" ? JSON.stringify({ ...script, code: value || "" }, null, 2) : value || ""); }} options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, readOnly }}/></div>
    <div className="editor-footer">{script ? "Custom logic runs with completed candles and private state. Validate checks execution on fictional data; it does not test profitability." : "Rules are evaluated after bar close; orders fill no earlier than the next bar open."}</div>
  </>;
}
