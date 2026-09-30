import type { Bar } from "../src/types";

export const GRANULARITIES: Set<number>;
export function coinbase(path: string): Promise<unknown>;
export function validateRange(product: string, granularity: number, start: number, end: number): void;
export function getCandles(product: string, granularity: number, start: number, end: number): Promise<Bar[]>;
