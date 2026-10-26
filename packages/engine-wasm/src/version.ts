// Which gens have an engine, and its version: no WebAssembly or I/O, so it's
// safe to import anywhere (the web main bundle, the versus protocol).

/** The generations with an engine build. A future gen is a new entry here and a cargo feature. */
export const ENGINE_GENS = [3, 4, 5, 6] as const;

/** Must match `version()` in rust/src/lib.rs (a test checks): bump both when search results could change. */
export const WASM_VERSION = 1;

export const hasEngine = (gen: number): boolean => (ENGINE_GENS as readonly number[]).includes(gen);

/** File name of a generation's module in `dist/`. */
export const engineFile = (gen: number): string => `gen${gen}.wasm`;
