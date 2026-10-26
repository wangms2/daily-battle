import { aiFor } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import { deriveSeed, makeRng, randomTeam, runBattle, type Policy } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { startPosition } from '../battle';
import type { Position } from '../types';
import { buildReview, type Decision } from './review';
import { Coach, TIP_GAP, tipGap, type CoachTurn } from './simple';

const data = setsFor('gen3ou');
const coachAt = (pos: Omit<Position, 'seed'>, seed = 'coach'): CoachTurn =>
  new Coach(data).turn(startPosition('gen3ou', { ...pos, seed }).view('p1')!);

const SWAMPERT = { species: 'Swampert', moves: ['Surf', 'Earthquake', 'Protect', 'Toxic'] };
const MENCE = { species: 'Salamence', setId: 'salamence-dragon-dance' };

describe('Simple coach warnings', () => {
  it('warns about type immunities', () => {
    const t = coachAt({ p1: [SWAMPERT], p2: [MENCE] });
    expect(t.warnings['move 2']).toMatchObject({ rule: 'noEffect', lesson: 'gen3-types' });
    expect(t.warnings['move 2']!.text).toContain('immune to Ground');
    expect(t.warnings['move 1']).toBeUndefined();
  });

  it('doesn’t ask again about a warning the player ignored', () => {
    const coach = new Coach(data);
    const s = startPosition('gen3ou', { p1: [SWAMPERT], p2: [MENCE], seed: 'coach' });
    expect(coach.turn(s.view('p1')!).warnings['move 2']).toBeDefined();
    coach.record(s.view('p1')!, 'move 2');
    s.choose('p1', 'move 2');
    s.choose('p2', 'move 1');
    expect(s.ended).toBe(false);
    expect(coach.turn(s.view('p1')!).warnings['move 2']).toBeUndefined();
  });

  it('warns about Levitate, which every Gengar has', () => {
    const t = coachAt({
      p1: [{ species: 'Metagross', moves: ['Meteor Mash', 'Earthquake'] }],
      p2: [{ species: 'Gengar', setId: 'gengar-offensive' }],
    });
    expect(t.warnings['move 2']!.text).toContain('Levitate');
  });

  it('warns about status that can’t land', () => {
    const jirachi = { species: 'Jirachi', moves: ['Toxic', 'Thunder Wave', 'Psychic'] };
    const steel = coachAt({
      p1: [jirachi],
      p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
    });
    expect(steel.warnings['move 1']).toMatchObject({ rule: 'noEffect', lesson: 'gen3-status' });
    const ground = coachAt({
      p1: [jirachi],
      p2: [{ species: 'Swampert', setId: 'swampert-standard-defensive' }],
    });
    expect(ground.warnings['move 2']!.text).toContain('immune to Electric');
  });

  it('applies Sleep Clause only to sleep the player caused', () => {
    const venusaur = { species: 'Venusaur', moves: ['Sleep Powder', 'Giga Drain'] };
    const t = coachAt({
      p1: [venusaur],
      p2: [
        { species: 'Snorlax', setId: 'snorlax-utility-lax' },
        { species: 'Blissey', setId: 'blissey-utility' },
      ],
      rounds: [
        { p1: 'move Sleep Powder', p2: 'move 1' },
        { p1: 'move Giga Drain', p2: 'switch Blissey' },
      ],
    });
    expect(t.warnings['move 1']!.text).toContain('Sleep Clause');
  });

  it('warns when Spikes are already at three layers', () => {
    const t = coachAt({
      p1: [{ species: 'Skarmory', moves: ['Spikes', 'Drill Peck'] }],
      p2: [{ species: 'Blissey', setId: 'blissey-utility' }],
      rounds: [1, 2, 3].map(() => ({ p1: 'move Spikes', p2: 'move 1' })),
    });
    expect(t.warnings['move 1']).toMatchObject({ rule: 'noEffect', lesson: 'gen3-spikes' });
  });

  it('warns about switching into a knockout', () => {
    const t = coachAt({
      p1: [SWAMPERT, { species: 'Heracross', setId: 'heracross-standard' }],
      p2: [MENCE],
    });
    expect(t.warnings['switch 2']).toMatchObject({ rule: 'switchKo', lesson: 'gen3-switching' });
  });

  it('knows our own abilities: Levitate takes no Earthquake on the way in', () => {
    const t = coachAt({
      p1: [
        { species: 'Forretress', setId: 'forretress-standard' },
        { species: 'Gengar', setId: 'gengar-offensive' },
      ],
      p2: [{ species: 'Tyranitar', moves: ['Earthquake', 'Rock Slide'] }],
    });
    expect(t.warnings['switch 2']?.text ?? '').not.toContain('Earthquake');
  });

  it('doesn’t blame a switch for Explosion, which knocks out whatever stays in too', () => {
    const t = coachAt({
      p1: [
        { species: 'Dugtrio', setId: 'dugtrio-choice-band' },
        { species: 'Jynx', setId: 'jynx-special-sweeper' },
      ],
      p2: [{ species: 'Gengar', setId: 'gengar-offensive' }],
    });
    expect(t.warnings['switch 2']?.text ?? '').not.toContain('Explosion');
  });

  it('warns about staying in to be knocked out when a safe switch exists', () => {
    const t = coachAt({
      p1: [
        { species: 'Heracross', setId: 'heracross-standard' },
        { species: 'Swampert', setId: 'swampert-standard-defensive' },
      ],
      p2: [MENCE],
    });
    expect(t.tip?.rule).toBe('koThreat');
    expect(t.warnings['move 1']).toMatchObject({ rule: 'staysKo' });
    expect(t.warnings['move 1']!.text).toContain('Swampert takes that hit much better');
    expect(t.warnings['switch 2']).toBeUndefined();
  });

  it('warns about a weak move when another one knocks out', () => {
    const t = coachAt({
      p1: [{ species: 'Blissey', moves: ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Ice Beam'] }],
      p2: [MENCE],
    });
    expect(t.warnings['move 1']).toMatchObject({ rule: 'canKo', lesson: 'gen3-winning' });
    expect(t.warnings['move 4']).toBeUndefined();
  });
});

describe('Simple coach tips', () => {
  it('points out a wall and a teammate that hits it harder', () => {
    const t = coachAt({
      p1: [
        { species: 'Raikou', moves: ['Thunderbolt', 'Crunch'] },
        { species: 'Heracross', moves: ['Megahorn', 'Brick Break'] },
      ],
      p2: [{ species: 'Blissey', setId: 'blissey-utility' }],
    });
    expect(t.tip).toMatchObject({ rule: 'walled', lesson: 'gen3-switching' });
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

  it('suggests setting up when the foe can barely hurt you', () => {
    const t = coachAt({
      p1: [{ species: 'Jirachi', moves: ['Psychic', 'Calm Mind'] }],
      p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
    });
    expect(t.tip).toMatchObject({ rule: 'setupWindow', lesson: 'gen3-setup' });
  });
});

describe('Simple coach in real battles', () => {
  // Words for reads and plans over several turns: Simple never uses them.
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

  it('speaks rarely, keeps to one-turn wording, and reviews the battle', () => {
    let decisions = 0;
    let warned = 0;
    let tips = 0;
    for (let i = 0; i < 4; i++) {
      const coach = new Coach(data);
      const easy = aiFor({ difficulty: 'easy', style: 'balance', data });
      const ignored = new Set<string>();
      let lastTip = -Infinity;
      const player: Policy = {
        choose(view, rng) {
          const t = coach.turn(view);
          const choice = easy.choose(view, rng);
          for (const note of [t.tip, ...Object.values(t.warnings)])
            if (note) expect(note.text).not.toMatch(BANNED);
          if (view.request.requestType === 'move') decisions++;
          if (t.tip) {
            // Never two tips close together (urgent ones may come a little sooner).
            const turn = view.battle.turn;
            expect(turn - lastTip).toBeGreaterThanOrEqual(tipGap(t.tip.rule));
            lastTip = turn;
            tips++;
          }
          const w = t.warnings[choice];
          if (w) {
            // A warning the player ignored doesn't ask again.
            expect(ignored.has(w.text)).toBe(false);
            ignored.add(w.text);
            warned++;
          }
          coach.record(view, choice);
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
    expect(decisions).toBeGreaterThan(50);
    expect(warned / decisions).toBeLessThan(0.1);
    expect(tips / decisions).toBeLessThan(0.2);
  }, 60_000);
});

describe('buildReview', () => {
  const d = (turn: number, choice: string, scores: [string, number][]): Decision => ({
    turn,
    me: 'Metagross',
    foe: 'Zapdos',
    choice,
    scored: scores.map(([c, score]) => ({
      choice: c,
      score,
      kind: c.startsWith('move') ? 'move' : 'switch',
      damage: 0,
    })),
    labels: { 'move 1': 'Meteor Mash', 'move 2': 'Rock Slide', 'switch 2': 'Swampert' },
    hits: { 'move 1': { damage: 0.3, ko: 0 }, 'move 2': { damage: 0.5, ko: 0.6 } },
    taken: { 'switch 2': 0.2 },
    threat: 0.6,
  });

  it('picks the biggest explainable gaps, in turn order, and good turns', () => {
    const review = buildReview(
      [
        d(1, 'move 1', [
          ['move 1', 0.2],
          ['move 2', 1.0],
          ['switch 2', 0.1],
        ]),
        d(2, 'move 1', [
          ['move 1', 0.2],
          ['move 2', 0.3],
          ['switch 2', 0.9],
        ]),
        d(3, 'move 2', [
          ['move 1', 0.2],
          ['move 2', 1.2],
          ['switch 2', 0.1],
        ]),
        d(4, 'move 1', [
          ['move 1', 0.5],
          ['move 2', 0.6],
          ['switch 2', 0.1],
        ]),
      ],
      { switching: 'gen3-switching', attacking: 'gen3-winning' },
    );
    expect(review.key.map((k) => [k.turn, k.better, k.lesson])).toEqual([
      [1, 'Rock Slide', 'gen3-winning'],
      [2, 'Swampert', 'gen3-switching'],
    ]);
    expect(review.key[0]!.text).toBe('Rock Slide could knock out Zapdos. Meteor Mash couldn’t.');
    expect(review.key[1]!.text).toContain('Swampert would take only about 20%');
    expect(review.good.map((g) => g.turn)).toEqual([3]);
  });
});
