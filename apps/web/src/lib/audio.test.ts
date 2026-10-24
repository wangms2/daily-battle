import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FORMATS, setsFor } from '@daily-battle/data';
import { speciesDataFor } from '@daily-battle/data/species';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A stand-in for HTMLAudioElement that records what the engine asks of it. */
class FakeAudio {
  static made: FakeAudio[] = [];
  volume = 1;
  playbackRate = 1;
  preservesPitch = true;
  paused = true;
  duration = NaN;
  currentTime = 0;
  constructor(public src: string) {
    FakeAudio.made.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener() {}
}

const ON = { sound: true, musicVolume: 0.4, effectsVolume: 0.6 };
const OFF = { ...ON, sound: false };

/** A fresh engine (its state is module-level) with Audio faked. */
async function engine() {
  vi.resetModules();
  return import('./audio');
}

beforeEach(() => {
  FakeAudio.made = [];
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => vi.unstubAllGlobals());

describe('sound', () => {
  it('loads and plays nothing while it is off (the default)', async () => {
    const audio = await engine();
    audio.configureAudio(OFF);
    audio.startMusic('gen4ou');
    audio.playCry('Skarmory', 'gen4ou');
    audio.playChime();
    expect(FakeAudio.made).toEqual([]);
  });

  it("plays the battle's generation track at the music volume", async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startMusic('gen3ou');
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0]!.src).toMatch(/\/audio\/music\/gen3\.mp3$/);
    expect(FakeAudio.made[0]!.volume).toBe(0.4);
    expect(FakeAudio.made[0]!.paused).toBe(false);
  });

  it('starts the wanted music when sound is turned on mid-battle, and stops it when turned off', async () => {
    const audio = await engine();
    audio.configureAudio(OFF);
    audio.startMusic('gen5ou');
    expect(FakeAudio.made).toEqual([]);
    audio.configureAudio(ON);
    const track = FakeAudio.made[0]!;
    expect(track.src).toMatch(/gen5\.mp3$/);
    audio.configureAudio({ ...ON, musicVolume: 0.9 });
    expect(track.volume).toBe(0.9);
    audio.configureAudio(OFF);
    expect(track.paused).toBe(true);
  });

  it('uses game-era cries for Gen 3 to 5, current ones for Gen 6 and Megas', async () => {
    const audio = await engine();
    expect(audio.cryUrl('Skarmory', 'gen3ou')).toMatch(/\/cries\/legacy\/skarmory\.mp3$/);
    expect(audio.cryUrl('Skarmory', 'gen5ou')).toMatch(/\/cries\/legacy\/skarmory\.mp3$/);
    expect(audio.cryUrl('Skarmory', 'gen6ou')).toMatch(/\/cries\/latest\/skarmory\.mp3$/);
    expect(audio.cryUrl('Charizard-Mega-X', 'gen6ou')).toMatch(
      /\/cries\/latest\/charizardmegax\.mp3$/,
    );
  });

  it('plays one cry at a time at the effects volume, and faint cries lower', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.playCry('Skarmory', 'gen4ou');
    audio.playCry('Blissey', 'gen4ou', { faint: true });
    const [first, second] = FakeAudio.made;
    expect(first!.paused).toBe(true);
    expect(second!.paused).toBe(false);
    expect(second!.volume).toBe(0.6);
    expect(second!.playbackRate).toBeLessThan(1);
    expect(second!.preservesPitch).toBe(false);
  });

  it('keeps effects silent at zero volume, music on its own slider', async () => {
    const audio = await engine();
    audio.configureAudio({ ...ON, effectsVolume: 0 });
    audio.playCry('Skarmory', 'gen4ou');
    expect(FakeAudio.made).toEqual([]);
    audio.startMusic('gen4ou');
    expect(FakeAudio.made).toHaveLength(1);
  });

  it.each(Object.keys(FORMATS))('ships a cry for every %s species and Mega', async (format) => {
    const audio = await engine();
    const species = [
      ...Object.keys(setsFor(format).species),
      ...Object.values(speciesDataFor(format).species).flatMap((s) =>
        Object.values(s.megas ?? {}).map((m) => m.forme),
      ),
    ];
    const onDisk = (url: string) =>
      existsSync(resolve(import.meta.dirname, '../../public', `.${url}`));
    // Run `pnpm --filter web audio` to download any that are missing.
    expect(species.map((s) => audio.cryUrl(s, format)).filter((u) => !onDisk(u))).toEqual([]);
  });

  it('ships a battle track for every generation', async () => {
    for (const { gen } of Object.values(FORMATS)) {
      expect(
        existsSync(resolve(import.meta.dirname, `../../public/audio/music/gen${gen}.mp3`)),
      ).toBe(true);
    }
  });
});
