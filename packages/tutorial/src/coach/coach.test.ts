import { aiFor, turnFacts, type UtilityPolicy } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { deriveSeed, makeRng, randomTeam, runBattle, type Policy } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { startPosition } from '../battle';
import type { Position } from '../types';
import { choiceKey, Judge, soundPick, type Verdict } from './judge';
import { buildReview, decision } from './review';
import { Coach, TIP_GAP, tipGap, type CoachTurn } from './simple';

const data = setsFor('gen3ou');
const viewAt = (pos: Omit<Position, 'seed'>, seed = 'coach') =>
  startPosition('gen3ou', { ...pos, seed }).view('p1')!;
const coachAt = (pos: Omit<Position, 'seed'>, seed = 'coach'): CoachTurn =>
  new Coach(data).turn(viewAt(pos, seed));
/** A verdict that `choice` is clearly worse than `top`. */
const worse = (choice: string, top: string, gap = 0.2): Verdict => ({
  choice,
  top,
  worse: true,
  gap,
  agree: 1,
  value: 0.3,
  topValue: 0.3 + gap,
});
/** The coach's warning on `choice` when the judge prefers `top`. */
const warnAt = (pos: Omit<Position, 'seed'>, choice: string, top: string) =>
  new Coach(data).warn(viewAt(pos), worse(choice, top));

const SWAMPERT = { species: 'Swampert', moves: ['Surf', 'Earthquake', 'Protect', 'Toxic'] };
const MENCE = { species: 'Salamence', setId: 'salamence-dragon-dance' };

describe('Simple coach warnings', () => {
  it('warns about type immunities, with the lesson', () => {
    const w = warnAt({ p1: [SWAMPERT], p2: [MENCE] }, 'move 2', 'move 1');
    expect(w).toMatchObject({ rule: 'noEffect', lesson: 'gen3-immune' });
    expect(w!.text).toContain('immune to Ground');
  });

  it('warns only when the judge finds the pick clearly worse', () => {
    const view = viewAt({ p1: [SWAMPERT], p2: [MENCE] });
    const v = { ...worse('move 2', 'move 1'), worse: false };
    expect(new Coach(data).warn(view, v)).toBeUndefined();
  });

  it('doesn’t ask again about a warning the player ignored, even after a reload', () => {
    const coach = new Coach(data);
    const s = startPosition('gen3ou', { p1: [SWAMPERT], p2: [MENCE], seed: 'coach' });
    const w = coach.warn(s.view('p1')!, worse('move 2', 'move 1'))!;
    coach.record(s.view('p1')!, 'move 2', w);
    s.choose('p1', 'move 2');
    s.choose('p2', 'move 1');
    expect(s.ended).toBe(false);
    expect(coach.warn(s.view('p1')!, worse('move 2', 'move 1'))).toBeUndefined();
    // A reload: a new coach told what was ignored.
    const again = new Coach(data);
    again.ignore(coach.ignored);
    expect(again.warn(s.view('p1')!, worse('move 2', 'move 1'))).toBeUndefined();
  });

  it('warns about Levitate, which every Gengar has', () => {
    const w = warnAt(
      {
        p1: [{ species: 'Metagross', moves: ['Meteor Mash', 'Earthquake'] }],
        p2: [{ species: 'Gengar', setId: 'gengar-offensive' }],
      },
      'move 2',
      'move 1',
    );
    expect(w!.text).toContain('Levitate');
  });

  it('warns about status that can’t land', () => {
    const jirachi = { species: 'Jirachi', moves: ['Toxic', 'Thunder Wave', 'Psychic'] };
    const steel = warnAt(
      { p1: [jirachi], p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }] },
      'move 1',
      'move 3',
    );
    // Status has no course lesson yet, so there's nothing to link.
    expect(steel).toMatchObject({ rule: 'noEffect' });
    expect(steel!.lesson).toBeUndefined();
    const ground = warnAt(
      { p1: [jirachi], p2: [{ species: 'Swampert', setId: 'swampert-standard-defensive' }] },
      'move 2',
      'move 3',
    );
    expect(ground!.text).toContain('immune to Electric');
  });

  it('applies Sleep Clause only to sleep the player caused', () => {
    const venusaur = { species: 'Venusaur', moves: ['Sleep Powder', 'Giga Drain'] };
    const w = warnAt(
      {
        p1: [venusaur],
        p2: [
          { species: 'Snorlax', setId: 'snorlax-utility-lax' },
          { species: 'Blissey', setId: 'blissey-utility' },
        ],
        rounds: [
          { p1: 'move Sleep Powder', p2: 'move 1' },
          { p1: 'move Giga Drain', p2: 'switch Blissey' },
        ],
      },
      'move 1',
      'move 2',
    );
    expect(w!.text).toContain('Sleep Clause');
  });

  it('warns when Spikes are already at three layers', () => {
    const w = warnAt(
      {
        p1: [{ species: 'Skarmory', moves: ['Spikes', 'Drill Peck'] }],
        p2: [{ species: 'Blissey', setId: 'blissey-utility' }],
        rounds: [1, 2, 3].map(() => ({ p1: 'move Spikes', p2: 'move 1' })),
      },
      'move 1',
      'move 2',
    );
    expect(w).toMatchObject({ rule: 'noEffect' });
    expect(w!.lesson).toBeUndefined();
  });

  it('warns about switching into a knockout', () => {
    const w = warnAt(
      { p1: [SWAMPERT, { species: 'Heracross', setId: 'heracross-standard' }], p2: [MENCE] },
      'switch 2',
      'move 1',
    );
    expect(w).toMatchObject({ rule: 'switchKo' });
    expect(w!.lesson).toBeUndefined();
  });

  it('knows our own abilities: Levitate takes no Earthquake on the way in', () => {
    const w = warnAt(
      {
        p1: [
          { species: 'Forretress', setId: 'forretress-standard' },
          { species: 'Gengar', setId: 'gengar-offensive' },
        ],
        p2: [{ species: 'Tyranitar', moves: ['Earthquake', 'Rock Slide'] }],
      },
      'switch 2',
      'move 1',
    );
    expect(w?.text ?? '').not.toContain('Earthquake');
  });

  it('doesn’t blame a switch for Explosion, which knocks out whatever stays in too', () => {
    const w = warnAt(
      {
        p1: [
          { species: 'Dugtrio', setId: 'dugtrio-choice-band' },
          { species: 'Jynx', setId: 'jynx-special-sweeper' },
        ],
        p2: [{ species: 'Gengar', setId: 'gengar-offensive' }],
      },
      'switch 2',
      'move 1',
    );
    expect(w?.text ?? '').not.toContain('Explosion');
  });

  it('warns about staying in to be knocked out when the judge prefers a safe switch', () => {
    const pos = {
      p1: [
        { species: 'Heracross', setId: 'heracross-standard' },
        { species: 'Swampert', setId: 'swampert-standard-defensive' },
      ],
      p2: [MENCE],
    };
    expect(coachAt(pos).tip?.rule).toBe('koThreat');
    const w = warnAt(pos, 'move 1', 'switch 2');
    expect(w).toMatchObject({ rule: 'staysKo' });
    expect(w!.text).toContain('Swampert takes the hit much better');
  });

  it('warns about a weak move when another one knocks out', () => {
    const w = warnAt(
      {
        p1: [{ species: 'Blissey', moves: ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Ice Beam'] }],
        p2: [MENCE],
      },
      'move 1',
      'move 4',
    );
    expect(w).toMatchObject({ rule: 'missedKo', lesson: 'gen3-turn' });
  });
});

describe('Simple coach tips', () => {
  const WALLED = {
    p1: [
      { species: 'Raikou', moves: ['Thunderbolt', 'Crunch'] },
      { species: 'Heracross', moves: ['Megahorn', 'Brick Break'] },
    ],
    p2: [{ species: 'Blissey', setId: 'blissey-utility' }],
  };

  it('points out a wall and a teammate that hits it harder, once the judge agrees', () => {
    const coach = new Coach(data);
    const view = viewAt(WALLED);
    expect(coach.turn(view)).toEqual({ pending: true });
    expect(coach.confirm(view, 'switch 2')).toMatchObject({
      rule: 'walled',
      lesson: 'gen3-switching-course',
    });
    // Asking again about the same turn gives the same answer.
    expect(coach.turn(view).tip?.rule).toBe('walled');
  });

  it('stays quiet when the judge prefers something else, and can give the tip later', () => {
    const coach = new Coach(data);
    const view = viewAt(WALLED);
    coach.turn(view);
    expect(coach.confirm(view, 'move 1')).toBeUndefined();
    expect(coach.turn(view)).toEqual({});
    // Not shown, so not used up: a later decision can still give it.
    const later = viewAt(WALLED, 'later');
    expect(coach.turn(later).pending).toBe(true);
    expect(coach.confirm(later, 'switch 2')?.rule).toBe('walled');
  });

  it('in a lesson, gives no tip about an idea taught later', () => {
    // "Salamence is faster and can knock it out": Speed is lesson 7.
    const pos = {
      p1: [
        { species: 'Heracross', setId: 'heracross-standard' },
        { species: 'Swampert', setId: 'swampert-standard-defensive' },
      ],
      p2: [MENCE],
    };
    expect(new Coach(data, 'gen3ou', 'easy', 7).turn(viewAt(pos)).tip?.rule).toBe('koThreat');
    expect(new Coach(data, 'gen3ou', 'easy', 6).turn(viewAt(pos)).tip?.rule).not.toBe('koThreat');
  });

  it('notices a Choice lock, and Spikes with a spinner on the team', () => {
    const locked = coachAt({
      p1: [{ species: 'Heracross', moves: ['Megahorn', 'Rock Slide'], item: 'Choice Band' }],
      // Skarmory resists Megahorn, so no knockout tip comes first.
      p2: [{ species: 'Skarmory', moves: ['Drill Peck', 'Toxic'] }],
      rounds: [{ p1: 'move Megahorn', p2: 'move Toxic' }],
    });
    expect(locked.tip?.text).toBe(
      'Choice Band locks Heracross into Megahorn until it switches out.',
    );
    const spikes = coachAt({
      p1: [
        { species: 'Starmie', moves: ['Surf', 'Rapid Spin'] },
        { species: 'Blissey', moves: ['Seismic Toss'] },
      ],
      p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
      rounds: [{ p1: 'move Surf', p2: 'move Spikes' }],
    });
    expect(spikes.tip?.rule).toBe('spikes');
    expect(spikes.tip?.text).toContain('Rapid Spin');
  });

  it('notes a sleeping foe, once', () => {
    const coach = new Coach(data);
    const s = startPosition('gen3ou', {
      p1: [{ species: 'Venusaur', moves: ['Sleep Powder', 'Giga Drain'] }],
      p2: [{ species: 'Snorlax', setId: 'snorlax-utility-lax' }],
      seed: 'coach',
      rounds: [{ p1: 'move Sleep Powder', p2: 'move 1' }],
    });
    expect(coach.turn(s.view('p1')!).tip?.rule).toBe('foeAsleep');
    // Asking again about the same turn gives the same answer.
    expect(coach.turn(s.view('p1')!).tip?.rule).toBe('foeAsleep');
    for (let i = 0; i < TIP_GAP; i++) {
      s.choose('p1', 'move 2');
      s.choose('p2', 'move 1');
      const v = s.view('p1');
      if (!v || v.request.requestType !== 'move') break;
      expect(coach.turn(v).tip?.rule).not.toBe('foeAsleep');
    }
  });

  it('suggests setting up when the foe can barely hurt you and the judge agrees', () => {
    const coach = new Coach(data);
    const view = viewAt({
      p1: [{ species: 'Jirachi', moves: ['Psychic', 'Calm Mind'] }],
      p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
    });
    expect(coach.turn(view).pending).toBe(true);
    expect(coach.confirm(view, 'move 2')).toMatchObject({
      rule: 'setupWindow',
    });
  });
});

describe.skipIf(!engineBuilt(3))('Simple coach, knowing the foe’s choice', () => {
  // Machamp (Bulk Up, Cross Chop, Rock Slide, Hidden Power Ghost) against
  // Tyranitar, with Celebi and Jirachi seen in the back.
  const TTAR = {
    seed: 'ttar',
    p1: [
      { species: 'Blissey', moves: ['Soft-Boiled', 'Seismic Toss'] },
      { species: 'Machamp', setId: 'machamp-bulk-up' },
    ],
    p2: [
      { species: 'Tyranitar', setId: 'tyranitar-bulky-physical-attacker' },
      { species: 'Celebi', setId: 'celebi-leech-seed-3-attacks' },
      { species: 'Jirachi', setId: 'jirachi-wish-calm-mind' },
    ],
    rounds: [
      { p1: 'move Soft-Boiled', p2: 'switch Celebi' },
      { p1: 'move Soft-Boiled', p2: 'switch Jirachi' },
      { p1: 'switch Machamp', p2: 'switch Tyranitar' },
    ],
  };
  const s = startPosition('gen3ou', TTAR);
  const view = s.view('p1')!;
  let judge: Judge | undefined;
  /** The tip when the foe, played by `difficulty`, has chosen `actual`. */
  const tipFor = (difficulty: 'easy' | 'normal', actual: string) => {
    if (!judge) {
      judge = new Judge(loadEngine(3), data);
      judge.begin(view, 'ttar');
      while (judge.step());
    }
    const ai = aiFor({ difficulty, style: 'balance', data }) as UtilityPolicy;
    const foe = s.view('p2')!;
    const likely: Record<string, number> = {};
    for (const { choice, p } of ai.likely(foe)) likely[choiceKey(foe.request, choice)!] = p;
    const values = judge.against({ actual, likely })!;
    const coach = new Coach(data);
    expect(coach.turn(view)).toEqual({ pending: true });
    return coach.confirm(view, judge.best!, (c) => soundPick(c, values));
  };

  it('doesn’t call the knockout when Tyranitar is switching out, and says why', () => {
    // Normal switches to Celebi almost every time here.
    const tip = tipFor('normal', 'switch:celebi');
    expect(tip?.rule).toBe('likelySwitch');
    expect(tip?.text).toBe(
      'Tyranitar is 4× weak to Fighting, so it’s likely to switch out, perhaps to Celebi. Consider reading the switch with Hidden Power Ghost.',
    );
  });

  it('calls the knockout when Tyranitar stays in', () => {
    // Easy mostly attacks.
    expect(tipFor('easy', 'move:rockslide')?.rule).toBe('canKo');
  });

  it('stays quiet when the foe made an unlikely choice', () => {
    // Easy switching out: Hidden Power Ghost works this time, but it wasn't the sound pick.
    expect(tipFor('easy', 'switch:celebi')).toBeUndefined();
  });
});

describe('Simple coach in real battles', () => {
  // Words for reads and plans over several turns: Simple never uses them. (Its
  // one read, a foe likely to switch out of a knockout, says why from what's seen.)
  const BANNED = /predict|\bread\b|likely switch|next turn|double|they.ll switch|mind game/i;

  it('never peeks at the foe’s hidden set', () => {
    const turn = (setId: string) =>
      coachAt({
        p1: [SWAMPERT, { species: 'Heracross', setId: 'heracross-standard' }],
        p2: [{ species: 'Salamence', setId }],
      });
    expect(turn('salamence-mixed')).toEqual(turn('salamence-dragon-dance'));
    expect(turn('salamence-choice-band')).toEqual(turn('salamence-dragon-dance'));
  });

  it.skipIf(!engineBuilt(3))(
    'speaks rarely, keeps to one-turn wording, and reviews the battle',
    () => {
      let decisions = 0;
      let warned = 0;
      let tips = 0;
      const engine = loadEngine(3);
      for (let i = 0; i < 3; i++) {
        const coach = new Coach(data);
        const judge = new Judge(engine, data, { iterations: 4000 });
        const easy = aiFor({ difficulty: 'easy', style: 'balance', data });
        const ignored = new Set<string>();
        let lastTip = -Infinity;
        const player: Policy = {
          choose(view, rng) {
            const t = coach.turn(view);
            const choice = easy.choose(view, rng);
            if (view.request.requestType === 'move') decisions++;
            judge.begin(view, `coach:${i}:${decisions}`);
            const v = judge.settle(choice, Infinity);
            const tip =
              t.tip ?? (t.pending && judge.best ? coach.confirm(view, judge.best) : undefined);
            if (tip) {
              expect(tip.text).not.toMatch(BANNED);
              // Never two tips close together (urgent ones may come a little sooner).
              const turn = view.battle.turn;
              expect(turn - lastTip).toBeGreaterThanOrEqual(tipGap(tip.rule));
              lastTip = turn;
              tips++;
            }
            const w = v && coach.warn(view, v);
            if (w) {
              expect(w.text).not.toMatch(BANNED);
              // A warning the player ignored doesn't ask again.
              expect(ignored.has(w.text)).toBe(false);
              ignored.add(w.text);
              warned++;
            }
            coach.record(view, choice, w ?? null, v);
            return choice;
          },
        };
        const rng = makeRng(deriveSeed(`coach:${i}`, 0));
        runBattle({
          format: 'gen3ou',
          seed: deriveSeed(`coach:${i}`, 1),
          p1: { team: randomTeam(rng, data), policy: player, seed: deriveSeed(`coach:${i}`, 2) },
          p2: { team: randomTeam(rng, data), policy: easy, seed: deriveSeed(`coach:${i}`, 3) },
        });
        const review = coach.review();
        expect(review.key.length).toBeLessThanOrEqual(3);
        for (const t of [...review.key, ...review.good]) expect(t.text).not.toMatch(BANNED);
      }
      expect(decisions).toBeGreaterThan(40);
      expect(warned / decisions).toBeLessThan(0.2);
      expect(tips / decisions).toBeLessThan(0.25);
    },
    120_000,
  );
});

describe('buildReview', () => {
  const facts = (pos: Omit<Position, 'seed'>) => turnFacts(viewAt(pos), data);
  const POS = {
    p1: [
      { species: 'Blissey', moves: ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Ice Beam'] },
      { species: 'Swampert', setId: 'swampert-standard-defensive' },
    ],
    p2: [MENCE],
  };

  it('reviews the judge’s clearly worse turns with the warning’s words, and its top choices', () => {
    const f = facts(POS);
    const coach = new Coach(data);
    const view = viewAt(POS);
    const bad = worse('move 1', 'move 4');
    const small = { ...worse('move 3', 'move 4', 0.05), worse: false };
    const decisions = [
      decision(0, f, 'move 1', bad, coach.warn(view, bad)),
      decision(1, f, 'move 3', small),
      decision(2, f, 'move 4', { ...worse('move 4', 'move 4', 0), worse: false }),
      decision(3, f, 'move 2', undefined),
    ].filter((d) => d !== undefined);
    expect(decisions).toHaveLength(3);
    const review = buildReview(decisions);
    expect(review.key).toHaveLength(1);
    expect(review.key[0]).toMatchObject({ decision: 0, chose: 'Seismic Toss', better: 'Ice Beam' });
    expect(review.key[0]!.text).toBe(coach.warn(view, bad)!.text);
    expect(review.good.map((g) => g.chose)).toEqual(['Ice Beam']);
  });

  it('praises a warning listened to, only when the new pick is fine', () => {
    const f = facts(POS);
    const view = viewAt(POS);
    const note = new Coach(data).warn(view, worse('move 1', 'move 4'))!;
    const heeded = { choice: 'move 1', note };
    const fine = { ...worse('move 4', 'move 4', 0), worse: false };
    const caught = buildReview([decision(0, f, 'move 4', fine, undefined, heeded)!]);
    expect(caught.good[0]).toMatchObject({
      first: 'move 1',
      firstChose: 'Seismic Toss',
      choice: 'move 4',
      text: `Good catch: you changed your pick after the coach’s warning. ${note.text}`,
    });
    // Picking something clearly worse instead isn't a good catch.
    const stillBad = worse('move 3', 'move 4');
    const missed = buildReview([decision(0, f, 'move 3', stillBad, undefined, heeded)!]);
    expect(missed.good).toEqual([]);
  });

  it('says what Explosion costs when it praises it', () => {
    const f = facts({
      p1: [{ species: 'Metagross', moves: ['Explosion', 'Meteor Mash'] }],
      p2: [{ species: 'Starmie', moves: ['Surf'] }],
    });
    const r = buildReview([
      decision(0, f, 'move 1', { ...worse('move 1', 'move 1', 0), worse: false })!,
    ]);
    expect(r.good[0]?.text).toBe(
      'Good choice: Explosion could knock out Starmie, though it knocks out Metagross too.',
    );
  });
});
