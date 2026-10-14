import { createRoot } from "react-dom/client";
import Site from "./Site";
import { MotionConfig } from "motion/react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user"><Site /></MotionConfig>,
);
