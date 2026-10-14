import "./auth.css";
import { useEffect, useState, type FormEvent } from "react";
import App from "./App";
import PublicHeader from './PublicHeader';
import AccountLoading from './AccountLoading';
import AccountMenu from './AccountMenu';

type User = { id: string; email: string; sessionId: string; guest?: boolean };
import type { WorkspacePage } from "./WorkspaceShell";
export default function Auth({initialPage = "overview"}: {initialPage?: WorkspacePage}) {
  const [user, setUser] = useState<User | null>(null);
  const [previewGuest, setPreviewGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const connecting = new URLSearchParams(window.location.search).has("mcpAuthorize") || new URLSearchParams(window.location.search).has("mcpLogin");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth", { credentials: "same-origin", signal: controller.signal }).then(async (response) => {
      let body = await response.json();
      setPreviewGuest(!!body.previewGuest);
      if (response.ok && body.previewGuest && !body.user && !connecting) {
        const guestResponse = await fetch("/api/auth", { method: "POST", credentials: "same-origin", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "guest" }) });
        body = await guestResponse.json();
        if (!guestResponse.ok) throw new Error(body.error || "Could not open the guest workspace.");
      }
      if (!response.ok) throw new Error(body.error || "Could not check your session.");
      setUser(connecting && body.user?.guest ? null : body.user);
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
      setMode("login"); setUser(null);
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
  if (loading) return <AccountLoading/>;
  if (user) return <App initialPage={initialPage} key={`${user.id}:${user.sessionId}`} userId={user.id} sessionId={user.sessionId} onSessionExpired={() => { setUser(null); setError("Your session changed or expired. Please sign in again."); }} accountControls={<AccountMenu email={user.email} busy={busy} onLogout={()=>void logout()} error={error}/>}/>;
  if (previewGuest && !connecting) return <div className="auth-screen"><section className="panel auth-card"><h1>Preview workspace</h1><p role="alert">{error || "Your guest session expired. Reload to continue."}</p><button className="button primary" onClick={() => window.location.reload()}>Open guest workspace</button></section></div>;
  return <div className="landing auth-screen auth-approved">
    <div className="auth-public-header"><PublicHeader account/></div>
    <main className="auth-main"><section className="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title" className="silver-text">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="auth-intro">{mode === "login" ? "Sign in to your strategy workspace." : "Your next strategy starts here."}</p>
      <form className="auth-form" onSubmit={e => void submit(e)}>
        <label>Email<input type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" required minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 12 characters"} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="design-button auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <div className="auth-switch"><p>{mode === "login" ? "New to Testify?" : "Already have an account?"}</p><button type="button" className="design-button secondary" disabled={busy} onClick={() => {setMode(mode === "login" ? "register" : "login");setError("");setPassword("");}}>{mode === "login" ? "Register" : "Sign in"}</button></div>
      </form>
    </section></main>
  </div>;
}
