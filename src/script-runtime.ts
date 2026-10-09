import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import type { Bar, ScriptStrategy } from "./types";

export type EntryOrder = { side: "long" | "short"; type?: "market" | "limit" | "stop"; price?: number; stopDistance?: number; stopPrice?: number; takeProfitPrice?: number; riskPct?: number; allocationPct?: number; expiresAfterBars?: number };
export type Decision = { entry?: EntryOrder; exit?: boolean; exitPct?: number; stopPrice?: number; takeProfitPrice?: number; cancelEntry?: boolean };
export type ScriptPosition = { side: "long" | "short"; entry: number; entryTime: number; units: number; stopPrice: number | null; takeProfitPrice: number | null; initialRisk: number; highestHigh: number; lowestLow: number; barsHeld: number };
export type ScriptContext = { bar: Bar; index: number; symbol: string; equity: number; position: ScriptPosition | null; parameters: ScriptStrategy["parameters"] };
let modulePromise: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined;

export function validateDecision(value: unknown): Decision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("onBar must return an object, or {} when there is no action.");
  const decision = value as Decision;
  for (const key of Object.keys(decision)) if (!["entry", "exit", "exitPct", "stopPrice", "takeProfitPrice", "cancelEntry"].includes(key)) throw new Error(`Unknown strategy action ${key}.`);
  for (const key of ["exit", "cancelEntry"] as const) if (decision[key] !== undefined && typeof decision[key] !== "boolean") throw new Error(`${key} must be a boolean.`);
  for (const key of ["stopPrice", "takeProfitPrice", "exitPct"] as const) if (decision[key] !== undefined && (!Number.isFinite(decision[key]) || decision[key]! <= 0)) throw new Error(`${key} must be a finite positive number.`);
  if (decision.exitPct !== undefined && decision.exitPct > 100) throw new Error("exitPct cannot exceed 100.");
  if (decision.entry !== undefined) {
    const e = decision.entry;
    if (!e || typeof e !== "object" || Array.isArray(e) || !["long", "short"].includes(e.side)) throw new Error("entry.side must be long or short.");
    for (const key of Object.keys(e)) if (!["side", "type", "price", "stopDistance", "stopPrice", "takeProfitPrice", "riskPct", "allocationPct", "expiresAfterBars"].includes(key)) throw new Error(`Unknown entry field ${key}.`);
    if (e.type !== undefined && !["market", "limit", "stop"].includes(e.type)) throw new Error("entry.type must be market, limit or stop.");
    for (const key of ["price", "stopDistance", "stopPrice", "takeProfitPrice", "riskPct", "allocationPct", "expiresAfterBars"] as const) if (e[key] !== undefined && (!Number.isFinite(e[key]) || e[key]! <= 0)) throw new Error(`entry.${key} must be a finite positive number.`);
    if (e.type && e.type !== "market" && e.price === undefined) throw new Error("Limit and stop entries need a price.");
    if (e.riskPct !== undefined && (e.riskPct > 100 || (e.stopDistance === undefined && e.stopPrice === undefined))) throw new Error("Risk sizing needs an initial stop and riskPct in (0, 100].");
    if (e.allocationPct !== undefined && e.allocationPct > 100) throw new Error("entry.allocationPct cannot exceed 100.");
    if (e.stopPrice !== undefined && e.stopDistance !== undefined) throw new Error("Use stopDistance or stopPrice, not both.");
    if (e.expiresAfterBars !== undefined && !Number.isInteger(e.expiresAfterBars)) throw new Error("expiresAfterBars must be an integer.");
  }
  return decision;
}

export async function createScriptRuntime(strategy: ScriptStrategy) {
  const QuickJS = await (modulePromise ??= newQuickJSWASMModuleFromVariant(variant));
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  let interrupts = 0, deadline = Date.now() + 500;
  runtime.setInterruptHandler(() => ++interrupts > 1000 || Date.now() > deadline);
  const vm = runtime.newContext();
  const evaluate = (code: string) => {
    const result = vm.evalCode(code, "strategy.js");
    if (result.error) { const error = vm.dump(result.error); result.error.dispose(); throw new Error(`Custom strategy: ${error.message || "execution failed"}`); }
    return result.value;
  };
  try {
    evaluate(`globalThis.Date = undefined;
      Math.random = () => { throw new Error('Use deterministic logic; random is unavailable.'); };
      for (const value of [Object.prototype, Array.prototype, Function.prototype, JSON, Math, Reflect]) Object.freeze(value);
      for (const name of ['Object', 'Array', 'JSON', 'Math', 'Reflect', 'Proxy']) Object.defineProperty(globalThis, name, {value:globalThis[name], writable:false, configurable:false});
    `).dispose();
    const callback = evaluate(`(function() { 'use strict'; ${strategy.code}\n; if (typeof onBar !== 'function') throw new Error('Define function onBar(ctx).'); return onBar; })()`);
    // Only this private closure owns history. The strategy sees an immutable prefix.
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
      if (result.error) { const error = vm.dump(result.error); result.error.dispose(); throw new Error(`Custom strategy: ${error.message}`); }
      invoke = result.value;
    } finally { callback.dispose(); factory.dispose(); }
    return {
      step(context: ScriptContext): Decision {
        interrupts = 0; deadline = Date.now() + 500;
        const input = vm.newString(JSON.stringify(context));
        try {
          const result = vm.callFunction(invoke, vm.undefined, input);
          if (result.error) { const error = vm.dump(result.error); result.error.dispose(); throw new Error(`Custom strategy at candle ${context.index}: ${error.message || "execution failed"}`); }
          try { return validateDecision(JSON.parse(vm.getString(result.value))); } finally { result.value.dispose(); }
        } finally { input.dispose(); }
      },
      dispose() { invoke.dispose(); vm.dispose(); runtime.dispose(); },
    };
  } catch (error) { vm.dispose(); runtime.dispose(); throw error; }
}
