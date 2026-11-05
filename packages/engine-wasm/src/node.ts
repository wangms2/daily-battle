// Node loader: reads a generation's module from dist/ (built by `pnpm build`).
// Node has WASM SIMD, so it uses the SIMD build when there is one.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Engine, engineFile, hasEngine, type WasmModule } from './index';

declare const WebAssembly: { Module: new (bytes: Uint8Array) => WasmModule };

const pathOf = (file: string): string => {
  const url = new URL(`../dist/${file}`, import.meta.url);
  // Vite (e.g. Vitest's jsdom environment) rewrites module URLs to `[/C:]/@fs/<absolute path>`.
  const fs = url.pathname.indexOf('/@fs/');
  return fileURLToPath(fs >= 0 ? `file://${url.pathname.slice(fs + '/@fs'.length)}` : url);
};

/** The gen's module file: the SIMD build if built (and not turned off by ENGINE_SIMD=0), else the plain one. */
export const distPath = (gen: number): string => {
  const simd = pathOf(engineFile(gen, true));
  return process.env.ENGINE_SIMD !== '0' && existsSync(simd) ? simd : pathOf(engineFile(gen));
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
