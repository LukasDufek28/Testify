import { withWorkflow } from "workflow/next";
import path from "node:path";
export default withWorkflow({
  outputFileTracingRoot: path.resolve("../.."),
  serverExternalPackages: ["@neondatabase/serverless", "quickjs-emscripten-core", "@jitl/quickjs-singlefile-browser-release-sync"],
  outputFileTracingIncludes: {"/*": ["../../lib/**/*.js", "../../node_modules/quickjs-emscripten-core/**/*", "../../node_modules/@jitl/**/*"]},
});
