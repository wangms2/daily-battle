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
  listeners: Record<string, (() => void)[]> = {};
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
  addEventListener(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  /** Plays on to `time` (seconds) of a track `duration` long. */
  at(time: number, duration: number) {
    this.currentTime = time;
    this.duration = duration;
    this.listeners.timeupdate?.forEach((fn) => fn());
  }
}

const ON = { sound: true, musicVolume: 0.4, effectsVolume: 0.6 };
const OFF = { ...ON, sound: false };

/** A fresh engine (its state is module-level) with Audio faked. */
async function engine() {
  vi.resetModules();
  return import('./audio');
}

/** Whether the device is in dark mode, for `matchMedia`. */
let dark = false;

beforeEach(() => {
  FakeAudio.made = [];
  dark = false;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark') && dark }));
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Lets fades (in, out, and the loop's crossfade) finish. */
const settle = () => vi.advanceTimersByTime(5000);

describe('sound', () => {
  it('plays each game’s builder track, and leaves a battle’s music playing', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic('gen5ou');
    settle();
    expect(FakeAudio.made[0]!.src).toMatch(/\/audio\/music\/teambuilder-gen5\.mp3$/);
    expect(FakeAudio.made[0]!.volume).toBe(0.4);
    // Locking in opens the battle: its music takes over (the builder's fades out),
    // and the builder closing after doesn't stop it.
    audio.startMusic('gen5ou');
    audio.stopBuilderMusic('gen5ou');
    settle();
    expect(FakeAudio.made[0]!.paused).toBe(true);
    expect(FakeAudio.made[1]!.src).toMatch(/\/audio\/music\/gen5\.mp3$/);
    expect(FakeAudio.made[1]!.paused).toBe(false);
  });

  it.each([
    ['gen3ou', 'teambuilder-gen3'],
    ['gen5ou', 'teambuilder-gen5'],
    ['gen6ou', 'teambuilder-gen6'],
  ])('plays %s’s builder track', async (format, file) => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic(format);
    expect(FakeAudio.made[0]!.src).toMatch(new RegExp(`/${file}\\.mp3$`));
  });

  it('plays Gen 4’s builder track by day in light mode and by night in dark mode', async () => {
    let audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic('gen4ou');
    expect(FakeAudio.made[0]!.src).toMatch(/teambuilder-gen4-day\.mp3$/);
    dark = true;
    audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic('gen4ou');
    expect(FakeAudio.made[1]!.src).toMatch(/teambuilder-gen4-night\.mp3$/);
  });

  it('switches Gen 4’s track after dark mode turns on only at its loop, with a crossfade', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic('gen4ou');
    settle();
    const day = FakeAudio.made[0]!;
    dark = true;
    // Mid-tune, nothing changes.
    day.at(20, 46);
    settle();
    expect(FakeAudio.made).toHaveLength(1);
    expect(day.volume).toBe(0.4);
    // At the loop point the night track blends in as the day one blends out.
    day.at(44, 46);
    const night = FakeAudio.made[1]!;
    expect(night.src).toMatch(/teambuilder-gen4-night\.mp3$/);
    expect(night.volume).toBe(0);
    vi.advanceTimersByTime(1250);
    expect(day.volume).toBeGreaterThan(0.1);
    expect(night.volume).toBeGreaterThan(0.1);
    expect(day.paused).toBe(false);
    settle();
    expect(day.paused).toBe(true);
    expect(night.volume).toBe(0.4);
  });

  it('fades a track in when it starts, never at full volume at once', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startMusic('gen3ou');
    const track = FakeAudio.made[0]!;
    expect(track.volume).toBe(0);
    vi.advanceTimersByTime(300);
    expect(track.volume).toBeGreaterThan(0);
    expect(track.volume).toBeLessThan(0.4);
    settle();
    expect(track.volume).toBe(0.4);
  });

  it('keeps the builder track playing when the lead pick opens after the builder', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startBuilderMusic('gen3ou');
    // The builder closes and the brief opens in the same render.
    audio.stopBuilderMusic('gen3ou');
    audio.startBuilderMusic('gen3ou');
    vi.advanceTimersByTime(0);
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0]!.paused).toBe(false);
    // Closing the brief too fades it out.
    audio.stopBuilderMusic('gen3ou');
    settle();
    expect(FakeAudio.made[0]!.paused).toBe(true);
  });

  it('plays the versus track on, from Link Battle’s home into a room', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startVersusMusic();
    expect(FakeAudio.made[0]!.src).toMatch(/\/audio\/music\/versus\.mp3$/);
    audio.stopVersusMusic();
    audio.startVersusMusic();
    settle();
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0]!.paused).toBe(false);
    // Building a team: the game's builder track takes over, the versus one fades out.
    audio.startBuilderMusic('gen6ou');
    audio.stopVersusMusic();
    settle();
    expect(FakeAudio.made[0]!.paused).toBe(true);
    expect(FakeAudio.made[1]!.src).toMatch(/teambuilder-gen6\.mp3$/);
    expect(FakeAudio.made[1]!.paused).toBe(false);
  });

  it('plays the tutorial track quieter on lesson screens, and hands over to a practice battle', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startTutorialMusic();
    settle();
    const tutorial = FakeAudio.made[0]!;
    expect(tutorial.src).toMatch(/\/audio\/music\/tutorial\.mp3$/);
    expect(tutorial.volume).toBeCloseTo(0.4 * 0.3);
    audio.configureAudio({ ...ON, musicVolume: 0.8 });
    expect(tutorial.volume).toBeCloseTo(0.8 * 0.3);
    // The practice battle's music takes over; the lesson screen closing doesn't stop it.
    audio.startMusic('gen3ou');
    audio.stopTutorialMusic();
    settle();
    expect(tutorial.paused).toBe(true);
    expect(FakeAudio.made[1]!.src).toMatch(/gen3\.mp3$/);
    expect(FakeAudio.made[1]!.paused).toBe(false);
  });

  it('sets volume through Web Audio, which iOS obeys, behind a limiter', async () => {
    const gains: { gain: { value: number } }[] = [];
    const node = () => ({ connect: (n: unknown) => n, disconnect() {} });
    const limiter = {
      ...node(),
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    };
    const connected: unknown[] = [];
    class FakeContext {
      state = 'suspended';
      destination = {};
      resume = vi.fn(() => {
        this.state = 'running';
        return Promise.resolve();
      });
      createMediaElementSource = () => ({
        connect: (n: unknown) => n,
        disconnect() {},
      });
      createGain = () => {
        const g = {
          gain: { value: 1 },
          connect: (n: unknown) => (connected.push(n), n),
          disconnect() {},
        };
        gains.push(g);
        return g;
      };
      createDynamicsCompressor = () => limiter;
    }
    vi.stubGlobal('AudioContext', FakeContext);
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startMusic('gen3ou');
    settle();
    const track = FakeAudio.made[0]!;
    // The element's own volume stays at full; its gain sets the level.
    expect(track.volume).toBe(1);
    expect(gains.at(-1)!.gain.value).toBe(0.4);
    audio.configureAudio({ ...ON, musicVolume: 0.9 });
    expect(gains.at(-1)!.gain.value).toBe(0.9);
    expect(connected).toContain(limiter);
    expect(limiter.threshold.value).toBe(-3);
    audio.playCry('Skarmory', 'gen4ou');
    expect(FakeAudio.made[1]!.volume).toBe(1);
    expect(gains.at(-1)!.gain.value).toBeCloseTo(0.6 * 0.5);
  });

  it('wakes Web Audio and a held-back track on the next tap', async () => {
    const resume = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        destination = {};
        resume = resume;
        createMediaElementSource = () => ({ connect: (n: unknown) => n, disconnect() {} });
        createGain = () => ({ gain: { value: 1 }, connect: (n: unknown) => n, disconnect() {} });
      },
    );
    const audio = await engine();
    audio.configureAudio(ON);
    audio.startMusic('gen3ou');
    const track = FakeAudio.made[0]!;
    // The browser refused to start it without a tap.
    track.paused = true;
    resume.mockClear();
    const stop = audio.menuSounds();
    try {
      document.dispatchEvent(new Event('touchend'));
      expect(resume).toHaveBeenCalled();
      expect(track.paused).toBe(false);
    } finally {
      stop();
    }
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
  it('plays the select sound as a mouse presses a control, not again when the click follows', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    document.body.innerHTML = '<button>Play</button>';
    const stop = audio.menuSounds();
    try {
      const button = document.querySelector('button')!;
      const down = { bubbles: true, button: 0, pointerType: 'mouse' };
      button.dispatchEvent(new PointerEvent('pointerdown', down));
      expect(FakeAudio.made).toHaveLength(1);
      // The pointer's own click (detail 1) doesn't play it a second time.
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      expect(FakeAudio.made).toHaveLength(1);
    } finally {
      stop();
      document.body.innerHTML = '';
    }
  });
  it('plays the select sound as a touch lands, but in a scrolling list only on a tap', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    document.body.innerHTML =
      '<button id="menu">Play</button>' +
      '<div id="list" style="overflow-y: auto"><button>Lesson 1</button><button>Lesson 2</button></div>';
    // jsdom has no layout: the list is taller than its box, so it scrolls.
    const list = document.getElementById('list')!;
    Object.defineProperty(list, 'scrollHeight', { value: 900 });
    Object.defineProperty(list, 'clientHeight', { value: 400 });
    const stop = audio.menuSounds();
    try {
      const touch = { bubbles: true, button: 0, pointerType: 'touch' };
      const tap = new MouseEvent('click', { bubbles: true, detail: 1 });
      // Most screens don't scroll: the sound starts as the finger lands, once.
      const menu = document.getElementById('menu')!;
      menu.dispatchEvent(new PointerEvent('pointerdown', touch));
      expect(FakeAudio.made).toHaveLength(1);
      menu.dispatchEvent(tap);
      expect(FakeAudio.made).toHaveLength(1);
      // A finger lands on a lesson and scrolls the list: no click, no sound.
      const [first, second] = list.querySelectorAll('button');
      first!.dispatchEvent(new PointerEvent('pointerdown', touch));
      expect(FakeAudio.made).toHaveLength(1);
      // A real tap there: the sound comes with its click.
      second!.dispatchEvent(new PointerEvent('pointerdown', touch));
      second!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      expect(FakeAudio.made).toHaveLength(2);
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
    settle();
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
    settle();
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

  it('plays one cry at a time at half the effects volume, and faint cries lower', async () => {
    const audio = await engine();
    audio.configureAudio(ON);
    audio.playCry('Skarmory', 'gen4ou');
    audio.playCry('Blissey', 'gen4ou', { faint: true });
    const [first, second] = FakeAudio.made;
    expect(first!.paused).toBe(true);
    expect(second!.paused).toBe(false);
    // Cries are mastered about 9 dB over the music: half keeps them from startling.
    expect(second!.volume).toBe(0.3);
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

  it('ships a battle track for every generation, and its builder tracks', async () => {
    const music = (file: string) =>
      existsSync(resolve(import.meta.dirname, `../../public/audio/music/${file}.mp3`));
    for (const { gen } of Object.values(FORMATS)) {
      expect(music(`gen${gen}`)).toBe(true);
      const builder = gen === 4 ? ['gen4-day', 'gen4-night'] : [`gen${gen}`];
      for (const b of builder) expect(music(`teambuilder-${b}`), b).toBe(true);
    }
    expect(music('versus')).toBe(true);
  });
});
