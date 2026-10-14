import { lazy, Suspense, useEffect, useState } from "react";
import Landing from "./Landing";
import "./theme.css";
import type { WorkspacePage } from "./WorkspaceShell";
const Auth = lazy(() => import("./Auth"));
export default function Site() {
  const [hash, setHash] = useState(location.hash);
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
      fallback={
        <div className="site-loading" role="status">
          Opening your workspace…
        </div>
      }
    >
      <Auth initialPage={initialPage} />
    </Suspense>
  );
}
