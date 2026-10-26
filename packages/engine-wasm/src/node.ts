// Node loader: reads a generation's module from dist/ (built by `pnpm build`).

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Engine, engineFile, hasEngine, type WasmModule } from './index';

declare const WebAssembly: { Module: new (bytes: Uint8Array) => WasmModule };

export const distPath = (gen: number): string => {
  const url = new URL(`../dist/${engineFile(gen)}`, import.meta.url);
  // Vite (e.g. Vitest's jsdom environment) rewrites module URLs to `[/C:]/@fs/<absolute path>`.
  const fs = url.pathname.indexOf('/@fs/');
  return fileURLToPath(fs >= 0 ? `file://${url.pathname.slice(fs + '/@fs'.length)}` : url);
};

const modules = new Map<number, WasmModule>();

/** Whether the gen's module is built (CI builds it; locally run `pnpm --filter @daily-battle/engine-wasm build`). */
export const engineBuilt = (gen: number): boolean => hasEngine(gen) && existsSync(distPath(gen));

/** A fresh engine for `gen`. Compiles the module once per process. */
export function loadEngine(gen: number): Engine {
  if (!hasEngine(gen)) throw new Error(`No engine for gen ${gen}`);
  let module = modules.get(gen);
  if (!module) {
    module = new WebAssembly.Module(readFileSync(distPath(gen)));
    modules.set(gen, module);
  }
  return new Engine(module);
}
