// A synchronous wrapper around one generation's poke-engine module. Loading
// the bytes is the host's job (Node: ./node; browser worker: fetch +
// WebAssembly.compile; Cloudflare: a bundled .wasm import), so this file has
// no I/O and runs everywhere.

/** One root option and how the search rated it. `c` is `move:I`, `mega:I`, `tera:I`, `switch:I`, or `none` (0-based). */
export interface SearchOption {
  c: string;
  /** Visits: how often the search chose this option. */
  v: number;
  /** Summed score of those visits (0..1 each, from side one's view). */
  s: number;
}

export interface SearchResult {
  /** Iterations run. */
  n: number;
  s1: SearchOption[];
  s2: SearchOption[];
}

/** A compiled `WebAssembly.Module` (typed loosely: the base tsconfig has no DOM or WebAssembly lib). */
export type WasmModule = object;

// Just the WebAssembly API this file uses, scoped to the module so it
// doesn't clash with the full declarations where a lib provides them.
declare const WebAssembly: {
  Instance: new (module: WasmModule, imports: object) => { exports: object };
};

interface Exports {
  memory: { buffer: ArrayBuffer };
  alloc(len: number): number;
  out_ptr(): number;
  out_len(): number;
  version(): number;
  set_boost_eval(scale: number, curve: number): void;
  search(ptr: number, len: number, iterations: number, seedLo: number, seedHi: number): void;
  search_fixed(
    ptr: number,
    len: number,
    iterations: number,
    seedLo: number,
    seedHi: number,
    option: number,
  ): void;
  options(ptr: number, len: number): void;
  roundtrip(ptr: number, len: number): void;
  check(ptr: number, len: number): void;
  damage(ptr: number, len: number): void;
}

/** Thrown when the engine panics (an unsupported name or a malformed state). */
export class EngineError extends Error {
  override name = 'EngineError';
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The boost weights every engine starts with (`setBoostEval`): the foe's
 * boosts count double and every stage counts, so the search stops a sweep
 * it has no answer to (left alone, +4 to +6 looked nearly free). The
 * searcher's own boosts keep upstream's weights.
 */
export const DEFAULT_BOOST_EVAL = { scale: 2, linear: true, foeOnly: true } as const;

const curveOf = (linear: boolean, foeOnly: boolean) => (linear ? 1 : 0) | (foeOnly ? 2 : 0);

export class Engine {
  #module: WasmModule;
  #exports!: Exports;
  #boostEval: [number, number] = [
    DEFAULT_BOOST_EVAL.scale,
    curveOf(DEFAULT_BOOST_EVAL.linear, DEFAULT_BOOST_EVAL.foeOnly),
  ];

  constructor(module: WasmModule) {
    this.#module = module;
    this.#instantiate();
  }

  #instantiate(): void {
    this.#exports = new WebAssembly.Instance(this.#module, {}).exports as unknown as Exports;
    this.#exports.set_boost_eval(...this.#boostEval);
  }

  /**
   * The evaluation's stat-boost weights for this instance: `scale` multiplies
   * boosts' value; `linear` values each stage equally instead of the
   * flattening table; `foeOnly` applies the tuning to side two only (side one,
   * the searcher, keeps upstream's weights for its own boosts).
   * `setBoostEval(1)` is upstream poke-engine; the default is DEFAULT_BOOST_EVAL.
   */
  setBoostEval(scale: number, linear = false, foeOnly = false): void {
    this.#boostEval = [scale, curveOf(linear, foeOnly)];
    this.#exports.set_boost_eval(...this.#boostEval);
  }

  #out(): string {
    const e = this.#exports;
    return decoder.decode(new Uint8Array(e.memory.buffer, e.out_ptr(), e.out_len()));
  }

  #call(
    name: 'search' | 'search_fixed' | 'options' | 'roundtrip' | 'check' | 'damage',
    input: string,
    ...args: number[]
  ): string {
    const e = this.#exports;
    const bytes = encoder.encode(input);
    const ptr = e.alloc(bytes.length);
    new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
    try {
      (e[name] as (...a: number[]) => void)(ptr, bytes.length, ...args);
    } catch (err) {
      // A panic traps; its message is in the output buffer. The instance's heap
      // may be inconsistent after a trap, so start a fresh one.
      const message = this.#out();
      this.#instantiate();
      throw new EngineError(message.startsWith('panic') ? message : String(err));
    }
    return this.#out();
  }

  /** The wrapper's version, recorded alongside the AI version for replays. */
  get version(): number {
    return this.#exports.version();
  }

  /**
   * Seeded MCTS from side one's view for exactly `iterations` iterations.
   * Deterministic: the same state, iterations, and seed give the same result.
   */
  search(state: string, iterations: number, seed: number): SearchResult {
    const lo = seed >>> 0;
    const hi = Math.floor(seed / 2 ** 32) >>> 0;
    return JSON.parse(this.#call('search', state, iterations >>> 0, lo, hi)) as SearchResult;
  }

  /**
   * Like `search`, but side one is held to one root option (`option` indexes
   * `options(state).s1`), so it gets every iteration against the foe's replies.
   */
  searchFixed(state: string, iterations: number, seed: number, option: number): SearchResult {
    const lo = seed >>> 0;
    const hi = Math.floor(seed / 2 ** 32) >>> 0;
    return JSON.parse(
      this.#call('search_fixed', state, iterations >>> 0, lo, hi, option >>> 0),
    ) as SearchResult;
  }

  /** Root options per side, as the engine sees them. */
  options(state: string): { s1: string[]; s2: string[] } {
    const s1: string[] = [];
    const s2: string[] = [];
    for (const line of this.#call('options', state).split('\n')) {
      if (line.startsWith('s1 ')) s1.push(line.slice(3));
      else if (line.startsWith('s2 ')) s2.push(line.slice(3));
    }
    return { s1, s2 };
  }

  /** The state as the engine parsed it, re-serialized. */
  roundtrip(state: string): string {
    return this.#call('roundtrip', state);
  }

  /**
   * Names the engine doesn't know. Each entry is `kind name` with kind
   * species, move, item, or ability and a Showdown id (e.g. `move stealthrock`).
   */
  unknown(entries: readonly string[]): string[] {
    return this.#call('check', entries.join('\n')).split('\n').filter(Boolean);
  }

  /** Damage rolls of each side's move against the other's active Pokémon. */
  damage(state: string, s1Move: string, s2Move: string, s1First = true): [number[], number[]] {
    const [a = '0', b = '0'] = this.#call(
      'damage',
      `${s1Move}|${s2Move}|${s1First}|${state}`,
    ).split('\n');
    const parse = (x: string) => (x === '0' ? [] : x.split(',').map(Number));
    return [parse(a), parse(b)];
  }
}

export { ENGINE_GENS, engineFile, hasEngine, WASM_VERSION } from './version';
