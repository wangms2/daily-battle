// The Hard and Master AIs' engine: poke-engine compiled to WebAssembly, one
// module per generation. Fetched and compiled on first use (it's ~250 KB
// gzipped per gen), so Easy and Normal never load it; Master's network too.
import { MASTER_NET_PATH } from '@daily-battle/ai/version';
import { Engine, engineFile, type WasmModule } from '@daily-battle/engine-wasm';
import { genOf } from '@daily-battle/data/formats';

// Hashed asset URLs for the modules that were built (none in a checkout without Rust).
const urls = import.meta.glob<string>('../../../../packages/engine-wasm/dist/gen*.wasm', {
  query: '?url',
  import: 'default',
});

const modules = new Map<number, Promise<WasmModule>>();

// The smallest module using a SIMD instruction (as wasm-feature-detect's probe).
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

/** Whether this browser runs WASM SIMD: the Master network needs it to be quick enough. */
export const simdAvailable: boolean = (() => {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
})();

const urlFor = (gen: number, simd: boolean) =>
  Object.entries(urls).find(([path]) => path.endsWith(`/${engineFile(gen, simd)}`))?.[1];

/** Whether this build has Hard for the format. */
export const hardAvailable = (format: string): boolean => !!urlFor(genOf(format), false);

/** Whether Master can play the format here: its engine was built, and this browser has SIMD. */
export const masterAvailable = (format: string): boolean =>
  simdAvailable && !!urlFor(genOf(format), true);

let net: Promise<Uint8Array> | undefined;

/** Master's network (.dbnet bytes), fetched once. */
export function loadNet(): Promise<Uint8Array> {
  net ??= fetch(MASTER_NET_PATH)
    .then((res) => {
      if (!res.ok) throw new Error(`Couldn't load the Master AI (${res.status})`);
      return res.arrayBuffer();
    })
    .then((bytes) => new Uint8Array(bytes))
    .catch((e: unknown) => {
      net = undefined; // try again next time
      throw e;
    });
  return net;
}

/** A fresh engine for the format's generation with Master's network loaded (SIMD only). */
export async function loadMasterEngine(format: string): Promise<Engine> {
  if (!masterAvailable(format)) throw new Error('Master needs WebAssembly SIMD');
  const [module, bytes] = await Promise.all([loadHardModule(format), loadNet()]);
  const engine = new Engine(module);
  engine.netLoad(bytes);
  return engine;
}

/** The format's compiled module (compiled once per gen): the SIMD build where the browser has SIMD. */
export function loadHardModule(format: string): Promise<WasmModule> {
  const gen = genOf(format);
  let module = modules.get(gen);
  if (!module) {
    const url = (simdAvailable && urlFor(gen, true)) || urlFor(gen, false);
    if (!url) return Promise.reject(new Error(`Hard isn't available for Gen ${gen}`));
    module = url()
      .then((url) => fetch(url))
      .then((res) => {
        if (!res.ok) throw new Error(`Couldn't load the Hard AI (${res.status})`);
        return res.arrayBuffer();
      })
      .then((bytes) => WebAssembly.compile(bytes))
      .catch((e: unknown) => {
        modules.delete(gen); // try again next time
        throw e;
      });
    modules.set(gen, module);
  }
  return module;
}

/** A fresh engine for the format's generation (the module compiles once). */
export async function loadHardEngine(format: string): Promise<Engine> {
  return new Engine(await loadHardModule(format));
}
