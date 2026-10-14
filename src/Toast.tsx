import { useEffect, useState } from "react";

export default function Toast({ text, kind, onClose }: { text: string; kind: "success" | "error"; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), 2000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onClose, 450);
    return () => window.clearTimeout(timer);
  }, [leaving, onClose]);
  return <div className={`banner ${kind} floating-toast${leaving ? " toast-leaving" : ""}`} role={kind === "error" ? "alert" : "status"}><span>{text}</span><button onClick={() => setLeaving(true)}>Dismiss</button></div>;
}
