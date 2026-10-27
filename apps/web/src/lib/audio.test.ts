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
  it('plays one builder track in every game, and leaves a battle’s music playing', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic();
    expect(FakeAudio.made[0]!.src).toMatch(/\/audio\/music\/teambuilder\.mp3$/);
    expect(FakeAudio.made[0]!.volume).toBe(0.4);
    // Locking in opens the battle: its music takes over, and the builder closing after
    // doesn't stop it.
    audio.startMusic('gen5ou');
    audio.stopBuilderMusic();
    expect(FakeAudio.made[0]!.paused).toBe(true);
    expect(FakeAudio.made[1]!.src).toMatch(/\/audio\/music\/gen5\.mp3$/);
    expect(FakeAudio.made[1]!.paused).toBe(false);
  });

  it('keeps the builder track playing when the lead pick opens after the builder', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic();
    // The builder closes and the brief opens in the same render.
    audio.stopBuilderMusic();
    audio.startBuilderMusic();
    await new Promise((r) => setTimeout(r, 0));
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0]!.paused).toBe(false);
    // Closing the brief too fades it out.
    vi.useFakeTimers();
    try {
      audio.stopBuilderMusic();
      vi.advanceTimersByTime(5000);
      expect(FakeAudio.made[0]!.paused).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the tutorial track quieter on lesson screens, and hands over to a practice battle', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startTutorialMusic();
    const tutorial = FakeAudio.made[0]!;
    expect(tutorial.src).toMatch(/\/audio\/music\/tutorial\.mp3$/);
    expect(tutorial.volume).toBeCloseTo(0.4 * 0.3);
    audio.configureAudio({ ...ON, musicVolume: 0.8 });
    expect(tutorial.volume).toBeCloseTo(0.8 * 0.3);
    // The practice battle's music takes over; the lesson screen closing doesn't stop it.
    audio.startMusic('gen3ou');
    audio.stopTutorialMusic();
    expect(tutorial.paused).toBe(true);
    expect(FakeAudio.made[1]!.src).toMatch(/gen3\.mp3$/);
    expect(FakeAudio.made[1]!.paused).toBe(false);
  });

  it('plays the select sound on every tap of a control, and nothing elsewhere', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    document.body.innerHTML =
      '<button>Play</button><button disabled>Off</button><span id="t">text</span>';
    const stop = audio.menuSounds();
    try {
      document.querySelector('button')!.click();
      document
        .querySelector<HTMLButtonElement>('button[disabled]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('t')!.click();
      expect(FakeAudio.made.map((a) => a.src)).toEqual([expect.stringMatching(/select\.mp3$/)]);
    } finally {
      stop();
      document.body.innerHTML = '';
    }
  });
  it('plays the select sound as a control is pressed, not again when the click follows', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    document.body.innerHTML = '<button>Play</button>';
    const stop = audio.menuSounds();
    try {
      const button = document.querySelector('button')!;
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      expect(FakeAudio.made).toHaveLength(1);
      // The pointer's own click (detail 1) doesn't play it a second time.
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      expect(FakeAudio.made).toHaveLength(1);
    } finally {
      stop();
      document.body.innerHTML = '';
    }
  });
  it('plays the select sound on a menu pick only with sound on and effects above 0', async () => {
    const audio = await engine();
    audio.configureAudio(OFF);
    audio.playSelect();
    audio.configureAudio({ ...ON, effectsVolume: 0 });
    audio.playSelect();
    expect(FakeAudio.made).toEqual([]);
    audio.configureAudio(ON);
    audio.playCry('Skarmory', 'gen4ou');
    audio.playSelect();
    const [cry, select] = FakeAudio.made;
    expect(select!.src).toMatch(/\/audio\/sfx\/select\.mp3$/);
    // Subtle: a share of the effects volume.
    expect(select!.volume).toBeCloseTo(0.6 * 0.3);
    expect(select!.paused).toBe(false);
    // It doesn't cut off a cry.
    expect(cry!.paused).toBe(false);
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
