import { setsFor } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { deriveSeed, makeRng, randomTeam, runBattle } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { strongBot } from '../bots';
import { engineId, engineMove } from './names';
import { HardPolicy } from './policy';

const FORMATS = ['gen3ou', 'gen4ou', 'gen5ou', 'gen6ou'].filter((f) => engineBuilt(Number(f[3])));

/** Wraps an engine to record every state it's asked to search. */
function recording(engine: Engine): { engine: Engine; states: string[] } {
  const states: string[] = [];
  const wrapped = Object.create(engine) as Engine;
  wrapped.search = (state, iterations, seed) => {
    states.push(state);
    return engine.search(state, iterations, seed);
  };
  return { engine: wrapped, states };
}

function names(state: string): string[] {
  const out: string[] = [];
  for (const side of state.split('/').slice(0, 2)) {
    for (const mon of side.split('=').slice(0, 6)) {
      const f = mon.split(',');
      if (f[0] === 'NONE') continue;
      out.push(`species ${f[0]}`, `ability ${f[8]}`, `item ${f[10]}`);
      for (const m of f.slice(22, 26)) {
        const id = m.split(';')[0]!;
        if (id !== 'NONE') out.push(`move ${id}`);
      }
    }
  }
  return out.map((n) => n.toLowerCase());
}

function battle(format: string, i: number, engine: Engine) {
  const data = setsFor(format);
  const rng = makeRng(deriveSeed('hard-test:teams', i));
  const hard = new HardPolicy({ engine, data, iterations: 3000, worlds: 4 });
  const result = runBattle({
    format,
    seed: deriveSeed('hard-test:battle', i),
    maxTurns: 60,
    p1: { team: randomTeam(rng, data), policy: hard, seed: deriveSeed('hard-test:p1', i) },
    p2: {
      team: randomTeam(rng, data),
      policy: strongBot({ data }),
      seed: deriveSeed('hard-test:p2', i),
    },
  });
  return { hard, result };
}

describe.each(FORMATS)('Hard AI %s', (format) => {
  const gen = Number(format[3]);

  it('replays the same battle for the same seeds', () => {
    const a = battle(format, 0, loadEngine(gen));
    const b = battle(format, 0, loadEngine(gen));
    const log = (r: typeof a) => r.result.spectatorLog.filter((l) => !l.startsWith('|t:|'));
    expect(log(b)).toEqual(log(a));
  }, 60_000);

  it('translates every state into one the engine accepts, with known names', () => {
    const base = loadEngine(gen);
    const { engine, states } = recording(base);
    for (let i = 0; i < 3; i++) {
      const { hard } = battle(format, i, engine);
      expect(hard.stats.errors).toEqual([]);
      // Only Team Preview leads fall back.
      expect(hard.stats.searched).toBeGreaterThanOrEqual(hard.stats.decisions - 1);
    }
    expect(states.length).toBeGreaterThan(0);
    const seen = new Set(states.flatMap(names));
    // Items the engine doesn't model just act as no item (the coverage audit lists them).
    expect(base.unknown([...seen]).filter((n) => !n.startsWith('item '))).toEqual([]);
    for (const s of states) expect(() => base.roundtrip(s)).not.toThrow();
  }, 120_000);

  // The coverage audit: every name any set in the game can bring.
  it('knows every species, move, and ability in the format’s sets', () => {
    const entries = new Set<string>();
    for (const [species, entry] of Object.entries(setsFor(format).species)) {
      entries.add(`species ${engineId(species)}`);
      for (const set of entry.sets) {
        entries.add(`ability ${engineId(set.ability)}`);
        if (set.item) entries.add(`item ${engineId(set.item)}`);
        for (const m of set.moves) entries.add(`move ${engineMove(m, gen)}`);
      }
    }
    const unknown = loadEngine(gen).unknown([...entries]);
    // Items the engine doesn't model act as no item; listed here to keep an eye on.
    const items = unknown.filter((n) => n.startsWith('item '));
    if (items.length) console.log(`${format} items without an engine effect: ${items.join(', ')}`);
    expect(unknown.filter((n) => !n.startsWith('item '))).toEqual([]);
  });
});
