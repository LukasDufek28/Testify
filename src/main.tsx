import { createRoot } from "react-dom/client";
import ScreenBoundary from "./ScreenBoundary";
import Site from "./Site";
import { MotionConfig } from "motion/react";
import useReducedMotionPreference from './useReducedMotionPreference';
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./style.css";
import "./workspace-polish.css";
import "./motion-polish.css";
function MotionRoot(){
 useReducedMotionPreference();
 // Components and CSS share the live Testify preference. Motion's built-in
 // device policy is captured at mount and would block a later explicit opt-in.
 return <MotionConfig reducedMotion="never"><ScreenBoundary><Site /></ScreenBoundary></MotionConfig>;
}
createRoot(document.getElementById("root")!).render(<MotionRoot/>);
