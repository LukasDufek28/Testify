import { useEffect, useRef, useState } from "react";
import type { SavedStrategy } from "./types";

export default function ConfirmStrategyDelete({ strategy, onDelete, onClose }: {
  strategy: SavedStrategy; onDelete: (id: string) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function confirm() {
    if (pending) return;
    setPending(true); setError("");
    try { await onDelete(strategy.id); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not delete this strategy. Try again."); }
    finally { setPending(false); }
  }
  return <dialog ref={dialog} className="strategy-delete-dialog" aria-labelledby="strategy-delete-title"
    aria-describedby="strategy-delete-description" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <h2 id="strategy-delete-title">Delete strategy?</h2>
    <p id="strategy-delete-description">Delete <strong>{strategy.name}</strong> from your library? This cannot be undone. Saved backtest results keep their original rules.</p>
    {error && <p className="strategy-operation-error" role="alert">{error}</p>}
    <div className="strategy-dialog-actions">
      <button autoFocus className="dashboard-button" disabled={pending} onClick={onClose}>Cancel</button>
      <button className="dashboard-button strategy-delete-button" disabled={pending} onClick={() => void confirm()}>{pending ? "Deleting…" : "Delete strategy"}</button>
    </div>
  </dialog>;
}
