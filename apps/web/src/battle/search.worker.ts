/// <reference lib="webworker" />
// A helper for the battle worker: searches some of Hard's worlds alongside it,
// on another core, so the opponent's decision is ready sooner (DESIGN.md §7).
import { Engine, type SearchResult, type WasmModule } from '@daily-battle/engine-wasm';

export type ToHelper =
  | { type: 'load'; gen: number; module: WasmModule }
  | { type: 'search'; gen: number; state: string; iterations: number; seed: number };
export type FromHelper = { result: SearchResult } | { error: string };

const engines = new Map<number, Engine>();

self.onmessage = (event: MessageEvent<ToHelper>) => {
  const msg = event.data;
  let reply: FromHelper;
  try {
    if (msg.type === 'load') {
      engines.set(msg.gen, new Engine(msg.module));
      return;
    }
    const engine = engines.get(msg.gen);
    if (!engine) throw new Error(`No engine for Gen ${msg.gen}`);
    reply = { result: engine.search(msg.state, msg.iterations, msg.seed) };
  } catch (e) {
    reply = { error: e instanceof Error ? e.message : String(e) };
  }
  (self as DedicatedWorkerGlobalScope).postMessage(reply);
};
