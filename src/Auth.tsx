import { useEffect, useState, type FormEvent } from "react";
import App from "./App";

type User = { id: string; email: string; sessionId: string; guest?: boolean };
export default function Auth() {
  const [user, setUser] = useState<User | null>(null);
  const [previewGuest, setPreviewGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth", { credentials: "same-origin", signal: controller.signal }).then(async (response) => {
      let body = await response.json();
      setPreviewGuest(!!body.previewGuest);
      if (response.ok && body.previewGuest && !body.user) {
        const guestResponse = await fetch("/api/auth", { method: "POST", credentials: "same-origin", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "guest" }) });
        body = await guestResponse.json();
        if (!guestResponse.ok) throw new Error(body.error || "Could not open the guest workspace.");
      }
      if (!response.ok) throw new Error(body.error || "Could not check your session.");
      setUser(body.user);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not sign in.");
      setPassword(""); setUser(body.user);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Testify-Session": user!.sessionId }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      setUser(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch("/api/auth", { credentials: "same-origin", signal: controller.signal });
        if (response.ok) { const body = await response.json(); if (!controller.signal.aborted && body.user?.sessionId !== user.sessionId) setUser(body.user); }
      } catch { /* An offline tab keeps its workspace until the next successful check. */ }
    };
    const timer = setInterval(() => void check(), 60000);
    const focus = () => void check(); window.addEventListener("focus", focus);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [user?.sessionId]);
  if (loading) return <div className="auth-screen"><div className="panel auth-card">Loading your workspace…</div></div>;
  if (user) return <App key={`${user.id}:${user.sessionId}`} userId={user.id} sessionId={user.sessionId} onSessionExpired={() => { setUser(null); setError("Your session changed or expired. Please sign in again."); }} accountControls={<div className="account-controls"><span>{user.guest ? "Guest � Preview" : user.email}</span>{!previewGuest && <button className="button ghost" disabled={busy} onClick={() => void logout()}>Sign out</button>}{error && <p role="alert">{error}</p>}</div>}/>;
  if (previewGuest) return <div className="auth-screen"><section className="panel auth-card"><h1>Preview workspace</h1><p role="alert">{error || "Your guest session expired. Reload to continue."}</p><button className="button primary" onClick={() => window.location.reload()}>Open guest workspace</button></section></div>;
  return <div className="auth-screen"><section className="panel auth-card"><div className="eyebrow">TESTIFY</div><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1><p>Sign in to your private strategy research workspace. Strategies sync to your account. Candles and backtest results stay in this browser.</p><form className="form-stack" onSubmit={(e) => void submit(e)}><label>Email<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}/></label><label>Password<input type="password" required minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)}/></label><p className="help">Use at least 12 characters. Signing in on another device gives you a separate local workspace.</p>{error && <p className="bad" role="alert">{error}</p>}<button className="button primary full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button><button type="button" className="button ghost full" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setPassword(""); }}>{mode === "login" ? "Create an account" : "Already have an account? Sign in"}</button></form></section></div>;
}
