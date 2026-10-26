// The Hard AI's engine: poke-engine compiled to WebAssembly, one module per
// generation. Fetched and compiled on first use (it's ~200 KB gzipped per gen),
// so Easy and Normal never load it.
import { Engine, engineFile, type WasmModule } from '@daily-battle/engine-wasm';
import { genOf } from '@daily-battle/data/formats';

// Hashed asset URLs for the modules that were built (none in a checkout without Rust).
const urls = import.meta.glob<string>('../../../../packages/engine-wasm/dist/gen*.wasm', {
  query: '?url',
  import: 'default',
});

const modules = new Map<number, Promise<WasmModule>>();

/** Whether this build has Hard for the format. */
export const hardAvailable = (format: string): boolean =>
  Object.keys(urls).some((path) => path.endsWith(`/${engineFile(genOf(format))}`));

/** A fresh engine for the format's generation (the module compiles once). */
export async function loadHardEngine(format: string): Promise<Engine> {
  const gen = genOf(format);
  let module = modules.get(gen);
  if (!module) {
    const entry = Object.entries(urls).find(([path]) => path.endsWith(`/${engineFile(gen)}`));
    if (!entry) throw new Error(`Hard isn't available for Gen ${gen}`);
    module = entry[1]()
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
  return new Engine(await module);
}
