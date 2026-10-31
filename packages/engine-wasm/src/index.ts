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
  search_pair(
    ptr: number,
    len: number,
    iterations: number,
    seedLo: number,
    seedHi: number,
    option1: number,
    option2: number,
  ): void;
  options(ptr: number, len: number): void;
  search_subset(
    ptr: number,
    len: number,
    iterations: number,
    seedLo: number,
    seedHi: number,
    mask: number,
  ): void;
  endgame(ptr: number, len: number, depth: number): void;
  roundtrip(ptr: number, len: number): void;
  check(ptr: number, len: number): void;
  damage(ptr: number, len: number): void;
  features(ptr: number, len: number): void;
  features_meta(ptr: number, len: number): void;
  net_load(ptr: number, len: number): void;
  net_forward(ptr: number, len: number): void;
  observe(ptr: number, len: number): void;
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
    if (this.#net) this.#callBytes('net_load', this.#net);
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
    name:
      | 'search'
      | 'search_fixed'
      | 'search_pair'
      | 'search_subset'
      | 'endgame'
      | 'options'
      | 'roundtrip'
      | 'check'
      | 'damage'
      | 'features'
      | 'features_meta'
      | 'observe',
    input: string,
    ...args: number[]
  ): string {
    this.#callBytes(name, encoder.encode(input), ...args);
    return this.#out();
  }

  /** Calls an export with raw input bytes; the result is left in the output buffer. */
  #callBytes(name: keyof Exports, bytes: Uint8Array, ...args: number[]): void {
    const e = this.#exports;
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

  /**
   * Both sides held to one root option each (indexes into `options(state)`):
   * the value of that pair of choices, `s1[0].s / n`, from side one's view.
   */
  searchPair(
    state: string,
    iterations: number,
    seed: number,
    option1: number,
    option2: number,
  ): SearchResult {
    const lo = seed >>> 0;
    const hi = Math.floor(seed / 2 ** 32) >>> 0;
    return JSON.parse(
      this.#call('search_pair', state, iterations >>> 0, lo, hi, option1 >>> 0, option2 >>> 0),
    ) as SearchResult;
  }

  /**
   * Like `search`, with side one limited to the root options whose bits are
   * set in `mask` (bit I is `options(state).s1[I]`).
   */
  searchSubset(state: string, iterations: number, seed: number, mask: number): SearchResult {
    const lo = seed >>> 0;
    const hi = Math.floor(seed / 2 ** 32) >>> 0;
    return JSON.parse(
      this.#call('search_subset', state, iterations >>> 0, lo, hi, mask >>> 0),
    ) as SearchResult;
  }

  /**
   * Exhaustive expectiminimax `depth` turns deep (deterministic, no
   * iterations): each pair of root options' value, `m[i * s2.length + j]`,
   * in evaluation units from side one's view. For endgames, where the tree
   * is small enough.
   */
  endgame(state: string, depth: number): { s1: string[]; s2: string[]; m: number[] } {
    return JSON.parse(this.#call('endgame', state, depth >>> 0)) as {
      s1: string[];
      s2: string[];
      m: number[];
    };
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

  /**
   * The value network's inputs for a state (layout in `featuresMeta`): float
   * features and per-Pokémon embedding ids.
   */
  features(state: string): { floats: Float32Array; ids: Uint16Array } {
    const meta = this.featuresMeta();
    this.#call('features', state);
    const e = this.#exports;
    const bytes = new Uint8Array(e.memory.buffer, e.out_ptr(), e.out_len()).slice();
    const floats = new Float32Array(bytes.buffer, 0, meta.floats);
    const ids = new Uint16Array(bytes.buffer, meta.floats * 4, meta.tokens * meta.ids);
    return { floats, ids };
  }

  #featureSizes?: FeaturesMeta;

  /** The feature layout and this gen's id → name tables. */
  featuresMeta(): FeaturesMeta {
    this.#featureSizes ??= JSON.parse(this.#call('features_meta', '')) as FeaturesMeta;
    return this.#featureSizes;
  }

  #net?: Uint8Array;

  /**
   * Observation v2 for side one of a world state (features.rs `observe`), the
   * network's input: `known` describes the foe's six slots in the state's order,
   * `events` the battle so far, oldest first.
   */
  observe(
    state: string,
    turn: number,
    known: readonly NetKnown[],
    events: readonly NetEvent[],
  ): { floats: Float32Array; ids: Uint16Array } {
    const b = (x: boolean) => (x ? 1 : 0);
    const lines = [state, String(turn)];
    for (let i = 0; i < 6; i++) {
      const k = known[i] ?? UNSEEN;
      const r = Math.round;
      lines.push(
        [
          b(k.seen),
          b(k.item),
          b(k.ability),
          ...k.moves.map(b),
          ...k.base.map(r),
          r(k.speed[0]),
          r(k.speed[1]),
        ].join(' '),
      );
    }
    for (const e of events) {
      lines.push(
        [
          e.kind,
          b(e.mine),
          e.turn,
          e.species,
          e.move,
          b(e.mega),
          e.hpOwn.toFixed(4),
          e.hpFoe.toFixed(4),
        ].join(' '),
      );
    }
    this.#call('observe', lines.join('\n'));
    const e = this.#exports;
    const bytes = new Uint8Array(e.memory.buffer, e.out_ptr(), e.out_len()).slice();
    return {
      floats: new Float32Array(bytes.buffer, 0, NET_OBS.floats),
      ids: new Uint16Array(bytes.buffer, NET_OBS.floats * 4, NET_OBS.ids),
    };
  }

  /**
   * Loads the Master network (a .dbnet file from tools/net/export.py) into this
   * engine; it's reloaded automatically if the instance restarts after a panic.
   */
  netLoad(bytes: Uint8Array): { params: number } {
    this.#callBytes('net_load', bytes);
    this.#net = bytes;
    return JSON.parse(this.#out()) as { params: number };
  }

  /**
   * Runs the loaded network on observations (features.rs v2): `rows` of floats
   * (NET_OBS.floats each), ids (NET_OBS.ids) and legal masks (NET_OBS.actions).
   */
  netForward(rows: readonly NetInput[]): NetOutput[] {
    const { floats: nf, ids: ni, actions: na } = NET_OBS;
    const row = nf * 4 + ni * 2 + na;
    const buf = new Uint8Array(rows.length * row);
    const view = new DataView(buf.buffer);
    rows.forEach((r, k) => {
      let at = k * row;
      for (let i = 0; i < nf; i++, at += 4) view.setFloat32(at, r.floats[i] ?? 0, true);
      for (let i = 0; i < ni; i++, at += 2) view.setUint16(at, r.ids[i] ?? 0, true);
      for (let i = 0; i < na; i++, at++) buf[at] = r.mask[i] ? 1 : 0;
    });
    this.#callBytes('net_forward', buf);
    const e = this.#exports;
    const out = new DataView(e.memory.buffer, e.out_ptr(), e.out_len());
    const per = 2 * na + 1;
    return rows.map((_, k) => {
      const f = (i: number) => out.getFloat32((k * per + i) * 4, true);
      return {
        policy: Array.from({ length: na }, (_, i) => f(i)),
        value: f(na),
        foeAction: Array.from({ length: na }, (_, i) => f(na + 1 + i)),
      };
    });
  }
}

/** Observation v2 sizes (features.rs OBS_FLOATS, OBS_IDS; 14 action slots). */
export const NET_OBS = { floats: 3143, ids: 116, actions: 14 } as const;

/** What the viewer knows of one foe Pokémon (features.rs `Known`). */
export interface NetKnown {
  /** It has been on the field. */
  seen: boolean;
  item: boolean;
  ability: boolean;
  /** Per move slot of the state's set. */
  moves: [boolean, boolean, boolean, boolean];
  /** Base stats of its current forme: HP, Atk, Def, SpA, SpD, Spe. */
  base: [number, number, number, number, number, number];
  /** The lowest and highest Speed (stat × Choice Scarf) the evidence allows. */
  speed: [number, number];
}

const UNSEEN: NetKnown = {
  seen: false,
  item: false,
  ability: false,
  moves: [false, false, false, false],
  base: [0, 0, 0, 0, 0, 0],
  speed: [0, 0],
};

/** One battle event (features.rs `Event`), with embedding ids from `featuresMeta().names`. */
export interface NetEvent {
  /** 1: a move was used; 2: a Pokémon switched in. */
  kind: 1 | 2;
  /** By the viewer's side. */
  mine: boolean;
  turn: number;
  species: number;
  /** The move's id (moves only; 0 otherwise). */
  move: number;
  mega: boolean;
  /** Both active Pokémon's HP fractions at the end of that step. */
  hpOwn: number;
  hpFoe: number;
}

export interface NetInput {
  floats: ArrayLike<number>;
  ids: ArrayLike<number>;
  /** Legal action slots: moves 0-3, mega moves 4-7, switches 8-13. */
  mask: ArrayLike<boolean | number>;
}

export interface NetOutput {
  /** Logits over the 14 action slots; illegal ones are -1e9. */
  policy: number[];
  /** Win-chance logit (sigmoid gives the probability). */
  value: number;
  /** Logits for the foe's next action, same slots. */
  foeAction: number[];
}

export interface FeaturesMeta {
  floats: number;
  tokens: number;
  ids: number;
  monF: number;
  fieldF: number;
  names: {
    gen: number;
    version: number;
    itemOffset: number;
    abilityOffset: number;
    species: string[];
    moves: string[];
    items: string[];
    abilities: string[];
  };
}

export { ENGINE_GENS, engineFile, hasEngine, WASM_VERSION } from './version';
