import { coachNetJudge } from '@daily-battle/ai/version';
import { describe, expect, it } from 'vitest';
import type { Attempt, DayState, Settings } from '../state/schema';
import { coachAvailable, coachOn, coachWarning } from './coach';

const attempt = (over: Partial<Attempt>): Attempt => ({
  result: 'loss',
  remaining: 0,
  ts: 1,
  lead: 'Swampert',
  team: [],
  battleSeed: '1',
  aiSeed: '2',
  choices: [],
  engine: 'e',
  ...over,
});
const day = (...attempts: Attempt[]): DayState => ({ swapUsed: false, attempts });
const settings = (coach: boolean) => ({ coach: { gen3ou: coach } }) as unknown as Settings;

describe('daily coach', () => {
  it('is offered in every game, except against Master', () => {
    expect(coachAvailable('gen3ou', 'easy')).toBe(true);
    expect(coachAvailable('gen3ou', 'hard')).toBe(true);
    expect(coachAvailable('gen3ou', 'master')).toBe(false);
    expect(coachAvailable('gen4ou', 'normal')).toBe(true);
    expect(coachAvailable('gen6ou', 'master')).toBe(false);
  });

  it('judges with the network against Normal and Hard, Normal being no difficulty in a battle', () => {
    expect(coachNetJudge(undefined)).toBe(true);
    expect(coachNetJudge('normal')).toBe(true);
    expect(coachNetJudge('hard')).toBe(true);
    expect(coachNetJudge('easy')).toBe(false);
  });

  it('follows the setting, except for a battle already under way', () => {
    expect(coachOn(settings(true), 'gen3ou', undefined, 'normal')).toBe(true);
    expect(coachOn(settings(true), 'gen3ou', undefined, 'master')).toBe(false);
    const playing = day(attempt({ result: 'inProgress' }));
    expect(coachOn(settings(true), 'gen3ou', playing, 'normal')).toBe(false);
    const coached = day(attempt({ result: 'inProgress', coached: true }));
    expect(coachOn(settings(false), 'gen3ou', coached, 'normal')).toBe(true);
  });

  it('warns only while the regular first try is still ahead', () => {
    expect(coachWarning(undefined, 'easy', 4)).toBe(
      'Turning on the coach ends your 4-day Easy streak. Coached wins build a Coached streak of their own.',
    );
    expect(coachWarning(undefined, 'normal', 0)).toMatch(/^Coached battles don’t count/);
    // Mid-battle, the first try is still undecided.
    expect(coachWarning(day(attempt({ result: 'inProgress' })), 'normal', 2)).toMatch(
      /ends your 2-day streak/,
    );
    // Already played, or already helped: nothing left to lose.
    expect(coachWarning(day(attempt({ result: 'win' })), 'normal', 2)).toBeNull();
    expect(coachWarning(day(attempt({ coached: true })), 'normal', 0)).toBeNull();
  });
});
