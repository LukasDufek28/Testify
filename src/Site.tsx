import { lazy, Suspense, useEffect, useState } from "react";
import Landing from "./Landing";
import type { WorkspacePage } from "./WorkspaceShell";
const App = lazy(() => import("./App"));
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
  if (!hash.startsWith("#/app/")) return <Landing />;
  const route = hash.replace("#/app/", "");
  const initialPage: WorkspacePage = (["overview", "studio", "strategies", "data", "backtests", "history", "results", "compare", "portfolio", "validation"] as string[]).includes(route) ? route as WorkspacePage : "overview";
  return (
    <Suspense
      fallback={
        <div className="site-loading" role="status">
          Opening your workspace…
        </div>
      }
    >
      <App
        key={hash}
        initialPage={initialPage}
      />
    </Suspense>
  );
}
