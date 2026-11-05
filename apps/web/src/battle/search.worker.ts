/// <reference lib="webworker" />
// A helper for the battle worker: searches some of Hard's or Master's worlds
// alongside it, on another core, so the opponent's decision is ready sooner
// (DESIGN.md §7).
import {
  Engine,
  type NetSearchParams,
  type NetSearchResult,
  type NetWorld,
  type SearchResult,
  type WasmModule,
} from '@daily-battle/engine-wasm';

export type ToHelper =
  | { type: 'load'; gen: number; module: WasmModule }
  | { type: 'search'; gen: number; state: string; iterations: number; seed: number }
  /** Master's network, loaded into the gen's engine (once). */
  | { type: 'net'; gen: number; net: Uint8Array }
  | { type: 'netSearch'; gen: number; params: NetSearchParams; world: NetWorld };
export type FromHelper =
  { result: SearchResult } | { netResult: NetSearchResult } | { error: string };

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
    if (msg.type === 'net') {
      engine.netLoad(msg.net);
      return;
    }
    reply =
      msg.type === 'netSearch'
        ? { netResult: engine.netSearch(msg.params, [msg.world])[0]! }
        : { result: engine.search(msg.state, msg.iterations, msg.seed) };
  } catch (e) {
    reply = { error: e instanceof Error ? e.message : String(e) };
  }
  (self as DedicatedWorkerGlobalScope).postMessage(reply);
};
