// The Rival's engine for Hard and Master: poke-engine's per-gen WebAssembly,
// bundled into the Worker (Workers can only run modules uploaded with the
// script, not fetched ones). Wrangler compiles each `.wasm` import to a
// WebAssembly.Module. The SIMD builds, which Workers run: they play exactly as
// the plain ones, and Master's network needs the speed. Loaded with a dynamic
// import, so only a room with a Hard or Master Rival touches it.
import { MASTER_NET_PATH } from '@daily-battle/ai/version';
import { Engine, hasEngine } from '@daily-battle/engine-wasm';
import gen3 from '@daily-battle/engine-wasm/dist/gen3-simd.wasm';
import gen4 from '@daily-battle/engine-wasm/dist/gen4-simd.wasm';
import gen5 from '@daily-battle/engine-wasm/dist/gen5-simd.wasm';
import gen6 from '@daily-battle/engine-wasm/dist/gen6-simd.wasm';

const MODULES: Record<number, WebAssembly.Module> = { 3: gen3, 4: gen4, 5: gen5, 6: gen6 };

/** A fresh engine for `gen`, or null where there's none. */
export function hardEngine(gen: number): Engine | null {
  const module = hasEngine(gen) ? MODULES[gen] : undefined;
  return module ? new Engine(module) : null;
}

/**
 * Master's engines, one per gen with the network loaded, shared by every
 * battle in the isolate: the network takes ~20 MB of an engine's memory, and a
 * decision runs at once, so battles never interleave on one.
 */
const masters = new Map<number, Promise<Engine | null>>();

/** The gen's engine with Master's network (fetched from the static site), or null where there's none. */
export function masterEngine(gen: number, assets: Fetcher): Promise<Engine | null> {
  let engine = masters.get(gen);
  if (!engine) {
    engine = (async () => {
      const e = hardEngine(gen);
      if (!e) return null;
      const res = await assets.fetch(`https://assets.local${MASTER_NET_PATH}`);
      if (!res.ok) throw new Error(`Master's network didn't load (${res.status})`);
      e.netLoad(new Uint8Array(await res.arrayBuffer()));
      return e;
    })().catch((err: unknown) => {
      masters.delete(gen); // try again next time
      throw err;
    });
    masters.set(gen, engine);
  }
  return engine;
}
