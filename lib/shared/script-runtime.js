import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
let modulePromise;
function validateDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("onBar must return an object, or {} when there is no action.");
  const decision = value;
  for (const key of Object.keys(decision)) if (!["entry", "exit", "exitPct", "stopPrice", "takeProfitPrice", "cancelEntry"].includes(key)) throw new Error(`Unknown strategy action ${key}.`);
  for (const key of ["exit", "cancelEntry"]) if (decision[key] !== void 0 && typeof decision[key] !== "boolean") throw new Error(`${key} must be a boolean.`);
  for (const key of ["stopPrice", "takeProfitPrice", "exitPct"]) if (decision[key] !== void 0 && (!Number.isFinite(decision[key]) || decision[key] <= 0)) throw new Error(`${key} must be a finite positive number.`);
  if (decision.exitPct !== void 0 && decision.exitPct > 100) throw new Error("exitPct cannot exceed 100.");
  if (decision.entry !== void 0) {
    const e = decision.entry;
    if (!e || typeof e !== "object" || Array.isArray(e) || !["long", "short"].includes(e.side)) throw new Error("entry.side must be long or short.");
    for (const key of Object.keys(e)) if (!["side", "type", "price", "stopDistance", "stopPrice", "takeProfitPrice", "riskPct", "allocationPct", "expiresAfterBars"].includes(key)) throw new Error(`Unknown entry field ${key}.`);
    if (e.type !== void 0 && !["market", "limit", "stop"].includes(e.type)) throw new Error("entry.type must be market, limit or stop.");
    for (const key of ["price", "stopDistance", "stopPrice", "takeProfitPrice", "riskPct", "allocationPct", "expiresAfterBars"]) if (e[key] !== void 0 && (!Number.isFinite(e[key]) || e[key] <= 0)) throw new Error(`entry.${key} must be a finite positive number.`);
    if (e.type && e.type !== "market" && e.price === void 0) throw new Error("Limit and stop entries need a price.");
    if (e.riskPct !== void 0 && (e.riskPct > 100 || e.stopDistance === void 0 && e.stopPrice === void 0)) throw new Error("Risk sizing needs an initial stop and riskPct in (0, 100].");
    if (e.allocationPct !== void 0 && e.allocationPct > 100) throw new Error("entry.allocationPct cannot exceed 100.");
    if (e.stopPrice !== void 0 && e.stopDistance !== void 0) throw new Error("Use stopDistance or stopPrice, not both.");
    if (e.expiresAfterBars !== void 0 && !Number.isInteger(e.expiresAfterBars)) throw new Error("expiresAfterBars must be an integer.");
  }
  return decision;
}
async function createScriptRuntime(strategy) {
  const QuickJS = await (modulePromise ??= newQuickJSWASMModuleFromVariant(variant));
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  let interrupts = 0, deadline = Date.now() + 500;
  runtime.setInterruptHandler(() => ++interrupts > 1e3 || Date.now() > deadline);
  const vm = runtime.newContext();
  const evaluate = (code) => {
    const result = vm.evalCode(code, "strategy.js");
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(`Custom strategy: ${error.message || "execution failed"}`);
    }
    return result.value;
  };
  try {
    evaluate(`globalThis.Date = undefined;
      Math.random = () => { throw new Error('Use deterministic logic; random is unavailable.'); };
      for (const value of [Object.prototype, Array.prototype, Function.prototype, JSON, Math, Reflect]) Object.freeze(value);
      for (const name of ['Object', 'Array', 'JSON', 'Math', 'Reflect', 'Proxy']) Object.defineProperty(globalThis, name, {value:globalThis[name], writable:false, configurable:false});
    `).dispose();
    const callback = evaluate(`(function() { 'use strict'; ${strategy.code}
; if (typeof onBar !== 'function') throw new Error('Define function onBar(ctx).'); return onBar; })()`);
    const factory = evaluate(`(function(callback) {
      const parse = JSON.parse, stringify = JSON.stringify, freeze = Object.freeze;
      const history = [];
      const fail = () => { throw new Error('Completed candle history is read-only.'); };
      const view = new Proxy(history, {set: fail, deleteProperty: fail, defineProperty: fail, setPrototypeOf: fail, preventExtensions: fail});
      return function(payload) {
        const ctx = parse(payload);
        history.push(freeze(ctx.bar));
        ctx.history = view;
        if (ctx.position) freeze(ctx.position);
        freeze(ctx.parameters);
        const action = callback(freeze(ctx));
        if (action && typeof action.then === 'function') throw new Error('onBar must be synchronous.');
        const text = stringify(action === undefined ? {} : action);
        if (!text || text.length > 16000) throw new Error('Strategy action is too large or invalid.');
        return text;
      };
    })`);
    let invoke;
    try {
      const result = vm.callFunction(factory, vm.undefined, callback);
      if (result.error) {
        const error = vm.dump(result.error);
        result.error.dispose();
        throw new Error(`Custom strategy: ${error.message}`);
      }
      invoke = result.value;
    } finally {
      callback.dispose();
      factory.dispose();
    }
    return {
      step(context) {
        interrupts = 0;
        deadline = Date.now() + 500;
        const input = vm.newString(JSON.stringify(context));
        try {
          const result = vm.callFunction(invoke, vm.undefined, input);
          if (result.error) {
            const error = vm.dump(result.error);
            result.error.dispose();
            throw new Error(`Custom strategy at candle ${context.index}: ${error.message || "execution failed"}`);
          }
          try {
            return validateDecision(JSON.parse(vm.getString(result.value)));
          } finally {
            result.value.dispose();
          }
        } finally {
          input.dispose();
        }
      },
      dispose() {
        invoke.dispose();
        vm.dispose();
        runtime.dispose();
      }
    };
  } catch (error) {
    vm.dispose();
    runtime.dispose();
    throw error;
  }
}
export {
  createScriptRuntime,
  validateDecision
};
