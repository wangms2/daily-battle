// The Hard Rival's engine: poke-engine's per-gen WebAssembly, bundled into the
// Worker (Workers can only run modules uploaded with the script, not fetched
// ones). Wrangler compiles each `.wasm` import to a WebAssembly.Module. Loaded
// with a dynamic import, so only a room with a Hard Rival touches it.
import { Engine, hasEngine } from '@daily-battle/engine-wasm';
import gen3 from '@daily-battle/engine-wasm/dist/gen3.wasm';
import gen4 from '@daily-battle/engine-wasm/dist/gen4.wasm';
import gen5 from '@daily-battle/engine-wasm/dist/gen5.wasm';
import gen6 from '@daily-battle/engine-wasm/dist/gen6.wasm';

const MODULES: Record<number, WebAssembly.Module> = { 3: gen3, 4: gen4, 5: gen5, 6: gen6 };

/** A fresh engine for `gen`, or null where there's none. */
export function hardEngine(gen: number): Engine | null {
  const module = hasEngine(gen) ? MODULES[gen] : undefined;
  return module ? new Engine(module) : null;
}
