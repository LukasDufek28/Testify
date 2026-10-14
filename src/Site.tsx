import { lazy, Suspense, useEffect, useState } from "react";
import Landing from "./Landing";
import "./theme.css";
import type { WorkspacePage } from "./WorkspaceShell";
import AccountLoading from './AccountLoading';
const Auth = lazy(() => import("./Auth"));
export default function Site() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    // Warm the account bundle while the public page is idle, before its CTA is used.
    const timer=window.setTimeout(()=>{void import('./Auth').catch(()=>{});},600);
    return()=>window.clearTimeout(timer);
  },[]);
  useEffect(() => {
    const update = () => setHash(location.hash);
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!hash || hash === "#" || hash.startsWith("#/app/"))
      window.scrollTo(0, 0);
  }, [hash]);
  if (!hash.startsWith("#/app/") && !new URLSearchParams(location.search).has("mcpAuthorize") && !new URLSearchParams(location.search).has("mcpLogin")) return <Landing />;
  const route = hash.replace("#/app/", "");
  const initialPage: WorkspacePage = (
    [
      "manual",
      "overview",
      "studio",
      "strategies",
      "data",
      "backtests",
      "history",
      "results",
      "compare",
      "portfolio",
      "validation",
      "runsettings",
      "trades",
    ] as string[]
  ).includes(route)
    ? (route as WorkspacePage)
    : "overview";
  return (
    <Suspense
      fallback={<AccountLoading/>}
    >
      <Auth initialPage={initialPage} />
    </Suspense>
  );
}
