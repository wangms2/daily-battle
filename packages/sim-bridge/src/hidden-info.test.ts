// Enforces DESIGN.md §7/§13: a policy only ever sees its own side's information.
//
// For every decision, the view handed to the policy is flattened into id tokens
// (species, move, and item names). Any token that names something on the
// opponent's team must already have appeared in that side's own protocol log.
// Abilities are left out: Gen 4 species data legitimately lists possible
// abilities, so they can show up without being revealed.
import { setsFor } from '@daily-battle/data';
import { toID, type PokemonSet } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { RandomPolicy } from './policies/random';
import { deriveSeed, makeRng } from './rng';
import { runBattle } from './run';
import { randomTeam } from './teams';
import type { Policy, SideID, SideView } from './types';

/** Fields on the client battle that hold dex data or machinery, not battle state. */
const SKIP_KEYS = new Set(['gens', 'gen', 'handler', 'provider']);
/**
 * The client's own markers, not facts about a team: it sets `lastMove` to
 * `healing-wish` after Lunar Dance as well as Healing Wish.
 */
const CLIENT_MARKERS = new Set(['healing-wish']);

function addTokens(text: string, out: Set<string>) {
  for (const part of text.split(/[|:,]/)) {
    const id = toID(part);
    if (id) out.add(id);
  }
}

/** Every string (and key) reachable from `value`, split and normalized to ids. */
export function tokens(value: unknown, out = new Set<string>(), seen = new WeakSet<object>()) {
  if (typeof value === 'string' && !CLIENT_MARKERS.has(value)) addTokens(value, out);
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (SKIP_KEYS.has(key)) continue;
    addTokens(key, out);
    tokens(child, out, seen);
  }
  return out;
}

function teamFacts(team: PokemonSet[]): Set<string> {
  return new Set(team.flatMap((s) => [s.species, s.item, ...s.moves].map(toID).filter(Boolean)));
}

interface Snapshot {
  side: SideID;
  logLength: number;
  tokens: Set<string>;
}

/** Facts about `opponent` visible in a snapshot but not yet in the side's log. */
export function leaks(
  snapshot: Snapshot,
  log: readonly string[],
  own: PokemonSet[],
  opponent: PokemonSet[],
): string[] {
  const ownFacts = teamFacts(own);
  const revealed = new Set<string>();
  for (const line of log.slice(0, snapshot.logLength)) addTokens(line, revealed);
  return [...teamFacts(opponent)].filter(
    (fact) => !ownFacts.has(fact) && !revealed.has(fact) && snapshot.tokens.has(fact),
  );
}

function recordingPolicy(
  snapshots: Snapshot[],
  logs: Partial<Record<SideID, readonly string[]>>,
): Policy {
  const inner = new RandomPolicy();
  return {
    choose(view, rng) {
      logs[view.side] = view.log;
      snapshots.push({
        side: view.side,
        logLength: view.log.length,
        tokens: tokens({ request: view.request, battle: view.battle }),
      });
      return inner.choose(view, rng);
    },
  };
}

function playRecorded(i: number, format = 'gen4ou') {
  const data = setsFor(format);
  const rng = makeRng(deriveSeed('hidden-info:teams', i));
  const teams = { p1: randomTeam(rng, data), p2: randomTeam(rng, data) };
  const snapshots: Snapshot[] = [];
  const logs: Partial<Record<SideID, readonly string[]>> = {};
  const policy = recordingPolicy(snapshots, logs);
  runBattle({
    format,
    seed: deriveSeed('hidden-info:battle', i),
    p1: { team: teams.p1, policy, seed: deriveSeed('hidden-info:p1', i) },
    p2: { team: teams.p2, policy, seed: deriveSeed('hidden-info:p2', i) },
  });
  return { teams, snapshots, logs };
}

const opposite = (side: SideID): SideID => (side === 'p1' ? 'p2' : 'p1');

describe('hidden information', () => {
  // In Gen 5, Team Preview reveals all six species up front (in the log), never their sets.
  it.each(['gen4ou', 'gen5ou', 'gen6ou'])(
    'never shows a %s policy unrevealed opponent species, moves, or items',
    (format) => {
      const found: string[] = [];
      let checked = 0;
      let opponentFactsSeen = 0;
      for (let i = 0; i < 20; i++) {
        const { teams, snapshots, logs } = playRecorded(i, format);
        for (const s of snapshots) {
          checked++;
          const opponent = teams[opposite(s.side)];
          const leaked = leaks(s, logs[s.side]!, teams[s.side], opponent);
          if (leaked.length) found.push(`battle ${i}, ${s.side}: ${leaked.join(', ')}`);
          opponentFactsSeen += [...teamFacts(opponent)].filter((f) => s.tokens.has(f)).length;
        }
      }
      expect(checked).toBeGreaterThan(500);
      // The views do carry opponent info once revealed, so the scan isn't vacuous.
      expect(opponentFactsSeen).toBeGreaterThan(checked);
      expect(found).toEqual([]);
    },
    120_000,
  );

  it("keeps a gen6ou foe's Mega Stone hidden until it Mega Evolves", () => {
    let megas = 0;
    for (let i = 0; i < 20; i++) {
      const { teams, snapshots, logs } = playRecorded(i, 'gen6ou');
      for (const side of ['p1', 'p2'] as const) {
        const log = logs[side]!;
        const opponent = opposite(side);
        for (const set of teams[opponent]) {
          const stone = toID(set.item);
          if (!stone.endsWith('ite') && !/ite[xy]$/.test(stone)) continue;
          const reveal = log.findIndex(
            (l) => l.startsWith(`|-mega|${opponent}a:`) && toID(l).includes(stone),
          );
          if (reveal >= 0) megas++;
          // No view handed to this side before the reveal names the stone.
          const before = snapshots.filter(
            (s) => s.side === side && (reveal < 0 || s.logLength <= reveal),
          );
          for (const s of before) {
            if (teams[side].some((own) => toID(own.item) === stone)) continue;
            expect(s.tokens.has(stone), `battle ${i}: ${set.item}`).toBe(false);
          }
        }
      }
    }
    // RandomPolicy picks Mega moves often enough that some battles reveal a stone.
    expect(megas).toBeGreaterThan(0);
  }, 120_000);

  it('catches a leak (negative control)', () => {
    const { teams, snapshots, logs } = playRecorded(0);
    const first = snapshots.find((s) => s.side === 'p1')!;
    // A leaky view that exposes the opponent's full team.
    const leaky = { ...first, tokens: tokens({ battle: teams.p2 }) };
    expect(leaks(leaky, logs.p1!, teams.p1, teams.p2).length).toBeGreaterThan(0);
  });

  it('hands policies only the documented view fields, with their own request', () => {
    const views: SideView[] = [];
    const inner = new RandomPolicy();
    const rng = makeRng(deriveSeed('hidden-info:shape', 0));
    const team = () => randomTeam(rng);
    const spy: Policy = {
      choose(view, r) {
        views.push(view);
        return inner.choose(view, r);
      },
    };
    runBattle({
      seed: deriveSeed('hidden-info:shape', 1),
      p1: { team: team(), policy: spy, seed: deriveSeed('hidden-info:shape', 2) },
      p2: { team: team(), policy: spy, seed: deriveSeed('hidden-info:shape', 3) },
    });
    for (const view of views) {
      expect(Object.keys(view).sort()).toEqual(['battle', 'log', 'request', 'side']);
      if (view.request.requestType !== 'wait') expect(view.request.side.id).toBe(view.side);
    }
  });
});
