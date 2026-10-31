import { describe, expect, it } from 'vitest';
import { observeSpeed, speedRange, Tracker, type TurnStart } from './track';

const BASE: Record<string, number> = {
  Jolteon: 130,
  Swampert: 60,
  Charizard: 100,
  'Charizard-Mega-X': 100,
};
const tracker = () =>
  new Tracker('p1', {
    baseSpe: (f) => BASE[f] ?? 80,
    priority: (m) => (m === 'Quick Attack' ? 1 : 0),
  });
const start = (turn: number, over: Partial<TurnStart> = {}): TurnStart => ({
  turn,
  ok: true,
  ownSpeed: 200,
  foeKey: 'jolteon',
  foeForme: 'Jolteon',
  foeOddity: () => false,
  ...over,
});
const LEADS = [
  '|switch|p1a: Swampert|Swampert, L100, M|404/404',
  '|switch|p2a: Jolteon|Jolteon, L100, F|100/100',
  '|turn|1',
];

describe('Tracker', () => {
  it('reads events with env turn numbers and end-of-step HP', () => {
    const t = tracker();
    t.sync([
      ...LEADS,
      '|move|p2a: Jolteon|Thunderbolt|p1a: Swampert',
      '|-immune|p1a: Swampert',
      '|move|p1a: Swampert|Earthquake|p2a: Jolteon',
      '|-damage|p2a: Jolteon|0 fnt',
      '|faint|p2a: Jolteon',
      '|upkeep|',
      '|switch|p2a: Charizard|Charizard, L100, M|100/100',
      '|turn|2',
    ]);
    expect(t.turn).toBe(2);
    expect(t.foeAppeared).toEqual(['jolteon', 'charizard']);
    expect(
      t.events.map((e) => [e.kind, e.mine, e.turn, e.forme, e.move, e.hpOwn, e.hpFoe]),
    ).toEqual([
      [2, true, 0, 'Swampert', '', 1, 1],
      [2, false, 0, 'Jolteon', '', 1, 1],
      [1, false, 1, 'Jolteon', 'Thunderbolt', 1, 0],
      [1, true, 1, 'Swampert', 'Earthquake', 1, 0],
      // The forced switch is its own step, still turn 1.
      [2, false, 1, 'Charizard', '', 1, 1],
    ]);
  });

  it('marks the Mega Evolution move and tracks the new forme', () => {
    const t = tracker();
    t.sync([
      ...LEADS.slice(0, 1),
      '|switch|p2a: Charizard|Charizard, L100, M|100/100',
      '|turn|1',
      '|detailschange|p2a: Charizard|Charizard-Mega-X, L100, M',
      '|-mega|p2a: Charizard|Charizard|Charizardite X',
      '|move|p2a: Charizard|Dragon Claw|p1a: Swampert',
      '|-damage|p1a: Swampert|202/404',
      '|upkeep|',
    ]);
    const last = t.events.at(-1)!;
    expect([last.forme, last.mega, last.hpOwn]).toEqual(['Charizard-Mega-X', true, 0.5]);
  });

  it('narrows the foe Speed from turn order', () => {
    const t = tracker();
    const log = [...LEADS];
    t.sync(log);
    const prior = speedRange(130);
    expect(t.speedOf('jolteon', 'Jolteon')).toEqual(prior);
    t.start(start(1));
    log.push(
      '|move|p1a: Swampert|Earthquake|p2a: Jolteon',
      '|move|p2a: Jolteon|Thunderbolt|p1a: Swampert',
      '|upkeep|',
      '|turn|2',
    );
    t.sync(log);
    // Slower than our 200, below its slowest possible stat: kept as the evidence says (env).
    expect(t.speedOf('jolteon', 'Jolteon')).toEqual(observeSpeed(prior, false, 200));
    expect(t.speedOf('jolteon', 'Jolteon')).toEqual([100, 200]);
  });

  it('takes no evidence from priority gaps, switches, or turns without a start', () => {
    const t = tracker();
    const log = [...LEADS];
    const prior = speedRange(130);
    const play = (n: number, lines: string[], s?: TurnStart) => {
      if (s) t.start(s);
      log.push(...lines, '|upkeep|', `|turn|${n + 1}`);
      t.sync(log);
    };
    play(
      1,
      [
        '|move|p1a: Swampert|Quick Attack|p2a: Jolteon',
        '|move|p2a: Jolteon|Thunderbolt|p1a: Swampert',
      ],
      start(1, { ownSpeed: 400 }),
    );
    play(
      2,
      [
        '|move|p1a: Swampert|Earthquake|p2a: Jolteon',
        '|move|p2a: Jolteon|Thunderbolt|p1a: Swampert',
      ],
      start(2, { ok: false, ownSpeed: 400 }),
    );
    play(3, [
      '|move|p1a: Swampert|Earthquake|p2a: Jolteon',
      '|move|p2a: Jolteon|Thunderbolt|p1a: Swampert',
    ]);
    play(
      4,
      [
        '|move|p1a: Swampert|Earthquake|p2a: Jolteon',
        '|move|p2a: Jolteon|Thunderbolt|p1a: Swampert',
        '|-enditem|p2a: Jolteon|Sitrus Berry|[eat]',
      ],
      start(4, { ownSpeed: 400 }),
    );
    expect(t.speedOf('jolteon', 'Jolteon')).toEqual(prior);
    // A clean turn: Jolteon outspeeds 300, so it's at least 300.
    play(
      5,
      [
        '|move|p2a: Jolteon|Thunderbolt|p1a: Swampert',
        '|move|p1a: Swampert|Earthquake|p2a: Jolteon',
      ],
      start(5, { ownSpeed: 300 }),
    );
    expect(t.speedOf('jolteon', 'Jolteon')).toEqual([300, prior[1]]);
  });
});
