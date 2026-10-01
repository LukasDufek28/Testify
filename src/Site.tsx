import { lazy, Suspense, useEffect, useState } from "react";
import Landing from "./Landing";
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
        initialPage={hash === "#/app/studio" ? "studio" : "overview"}
      />
    </Suspense>
  );
}
