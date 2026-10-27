// Sound (DESIGN.md §21): battle music and Pokémon cries, as on Showdown, plus a
// short chime for versus and a select sound on every tap. Off by default; while it's
// off nothing is downloaded or played. Music plays in battles (one track per
// generation), in the team builder (a track per generation; Gen 4's by day or night),
// on Link Battle's menus (the versus track) and on lesson screens (the tutorial
// track; a lesson's practice battle plays the battle music), and loops with a short
// crossfade (the tracks end in a fade-out). One effect plays at a time, so a fast
// turn doesn't stack cries. All audio access goes through here.
//
// Volume goes through Web Audio gain, not the elements' `volume`: iOS ignores
// `volume`, so the sliders did nothing there.
import { genOf } from '@daily-battle/data';
import { toId } from './data';

export interface AudioSettings {
  sound: boolean;
  /** 0 to 1. */
  musicVolume: number;
  /** 0 to 1. Cries, the menu select sound, and the versus chime. */
  effectsVolume: number;
}

/**
 * Tracks supplied unmastered play at this share of the music volume, to sit
 * with the others: the tutorial track is about 10 dB louder than the team
 * builder's, which it matches.
 */
const TRACK_GAIN: Record<string, number> = { tutorial: 0.3 };
const level = (key: string) => settings.musicVolume * (TRACK_GAIN[key] ?? 1);

/** Seconds of overlap when the music loops back to its start. */
const CROSSFADE = 2.5;
/** How long the music fades out when a battle ends, or another screen's track takes over. */
const FADE_OUT_MS = 1200;
/** How long a track takes to fade in when it starts, so it never jumps in at full level. */
const FADE_IN_MS = 600;
/** Faint cries play lower and slower, as in the games. */
const FAINT_RATE = 0.8;
/**
 * Cries play at this share of the effects volume. They're mastered loud (about
 * -9 LUFS momentary, peaks at full scale); at half they sit just above the
 * battle music (-18.5 LUFS, the loudest track) instead of 9 dB over it.
 */
const CRY_LEVEL = 0.5;

const base = () => `${import.meta.env.BASE_URL}audio/`;
const musicUrl = (file: string) => `${base()}music/${file}.mp3`;

/** Generations with their own team builder track; any other plays Gen 3's. */
const BUILDER_GENS = [3, 4, 5, 6];

/** Whether the app shows its dark (night) colours. */
function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark' || theme === 'light') return theme === 'dark';
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The file a track plays now: `gen3`…`gen6` (battles), `tutorial` and `versus` are
 * their own; `builder-gen<N>` is that generation's builder track, and Gen 4's has a
 * day and a night version, for light and dark mode.
 */
function fileFor(key: string): string {
  const gen = /^builder-gen(\d+)$/.exec(key)?.[1];
  if (!gen) return key;
  if (gen === '4') return `teambuilder-gen4-${isDark() ? 'night' : 'day'}`;
  return `teambuilder-gen${BUILDER_GENS.includes(Number(gen)) ? gen : 3}`;
}

/** Gen 3 to 5 use the game-era cries; Gen 6 and every Mega the current ones. */
export function cryUrl(species: string, format: string): string {
  const style = genOf(format) >= 6 || /-Mega(-[XY])?$/.test(species) ? 'latest' : 'legacy';
  return `${base()}cries/${style}/${toId(species)}.mp3`;
}

let settings: AudioSettings = { sound: false, musicVolume: 0.5, effectsVolume: 0.5 };
/** The track wanted now (its key), whether or not it's playing. */
let wanted: string | null = null;
let track: { key: string; now: HTMLAudioElement; next: HTMLAudioElement | null } | null = null;
/** Tracks fading out (a battle ended, or another track took over), and their timer. */
let fading: { els: HTMLAudioElement[]; timer: ReturnType<typeof setInterval> } | null = null;
let effect: HTMLAudioElement | null = null;
let select: HTMLAudioElement | null = null;
let context: AudioContext | null = null;

const play = (el: HTMLAudioElement) => void el.play()?.catch(() => {});

/** Each element's path through Web Audio, where there is one. */
const plugs = new WeakMap<HTMLAudioElement, { source: AudioNode; gain: GainNode }>();

/** An audio element whose volume is a Web Audio gain (iOS ignores an element's `volume`). */
function sound(url: string): HTMLAudioElement {
  const el = new Audio(url);
  const ctx = audioContext();
  if (ctx && typeof ctx.createMediaElementSource === 'function') {
    try {
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      source.connect(gain).connect(output(ctx));
      plugs.set(el, { source, gain });
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    } catch {
      // Falls back to the element's own volume.
    }
  }
  return el;
}

function setVolume(el: HTMLAudioElement, value: number): void {
  const plug = plugs.get(el);
  if (plug) plug.gain.gain.value = value;
  else el.volume = value;
}

const volumeOf = (el: HTMLAudioElement) => plugs.get(el)?.gain.gain.value ?? el.volume;

/** Stops an element for good, and frees its Web Audio nodes. */
function unplug(el: HTMLAudioElement): void {
  el.pause();
  const plug = plugs.get(el);
  if (!plug) return;
  plug.source.disconnect();
  plug.gain.disconnect();
  plugs.delete(el);
}

/** Applies the player's settings; called on every render, so it only acts on changes. */
export function configureAudio(next: AudioSettings): void {
  const was = settings;
  settings = next;
  if (!next.sound) {
    if (was.sound) {
      stopTrack();
      if (effect) unplug(effect);
      effect = null;
    }
    return;
  }
  if (!was.sound && wanted) startTrack(wanted);
  // Ready the select sound, so the first tap doesn't wait for it.
  loadSelect();
  if (track) {
    setVolume(track.now, level(track.key));
    if (track.next) setVolume(track.next, level(track.key));
  }
}

/** A battle's music: its generation's track, from the start, looping until `stopMusic`. */
export function startMusic(format: string): void {
  want(`gen${genOf(format)}`);
}

/**
 * The team builder's track for a game's generation (the lead pick plays it on).
 * It's mastered about 3 dB quieter than the battle tracks, so it sits under the menus.
 */
export function startBuilderMusic(format: string): void {
  hold(`builder-gen${genOf(format)}`);
}

/** Fades the builder's track out, unless a battle's music has already taken over. */
export function stopBuilderMusic(format: string): void {
  release(`builder-gen${genOf(format)}`);
}

/** How many open screens want each menu track. */
const holds: Record<string, number> = {};

function hold(key: string) {
  holds[key] = (holds[key] ?? 0) + 1;
  want(key);
}

/**
 * A screen with a menu track closed. The track stops a moment later unless the
 * next screen wants it too (the builder hands over to the lead pick), so it
 * plays on without starting over.
 */
function release(key: string) {
  holds[key] = Math.max(0, (holds[key] ?? 0) - 1);
  setTimeout(() => {
    if (!holds[key] && wanted === key) stopMusic();
  }, 0);
}

const TUTORIAL = 'tutorial';

/** The lesson screens' track (intro, demos, practice). A practice battle plays the battle music. */
export function startTutorialMusic(): void {
  hold(TUTORIAL);
}

/** Stops the tutorial track, if it's the one playing (a battle may have taken over). */
export function stopTutorialMusic(): void {
  release(TUTORIAL);
}

const VERSUS = 'versus';

/** Link Battle's menus: its home, a room's lobby, and the screens between rounds. */
export function startVersusMusic(): void {
  hold(VERSUS);
}

/** Fades the versus track out, unless the next screen wants it too. */
export function stopVersusMusic(): void {
  release(VERSUS);
}

function want(key: string) {
  wanted = key;
  if (settings.sound) startTrack(key);
}

/** Fades the music out (the battle ended, or the screen closed). */
export function stopMusic(): void {
  wanted = null;
  fadeOut();
}

/** Fades the playing track out, so the next one never cuts in. */
function fadeOut() {
  if (!track) return;
  const { now, next } = track;
  track = null;
  endFade();
  const els = [now, next].filter((e): e is HTMLAudioElement => !!e);
  const from = els.map(volumeOf);
  const started = Date.now();
  const timer = setInterval(() => {
    const t = Math.min(1, (Date.now() - started) / FADE_OUT_MS);
    els.forEach((e, i) => setVolume(e, from[i]! * (1 - t)));
    if (t >= 1) endFade();
  }, 50);
  fading = { els, timer };
}

/** Stops a fade-out now, silencing what was fading. */
function endFade() {
  if (!fading) return;
  clearInterval(fading.timer);
  fading.els.forEach(unplug);
  fading = null;
}

function stopTrack() {
  endFade();
  if (track) unplug(track.now);
  if (track?.next) unplug(track.next);
  track = null;
}

function startTrack(key: string) {
  if (track?.key === key) return;
  fadeOut();
  const now = loop(key);
  track = { key, now, next: null };
  setVolume(now, 0);
  play(now);
  const started = Date.now();
  const rise = setInterval(() => {
    const t = Math.min(1, (Date.now() - started) / FADE_IN_MS);
    if (track?.now !== now || track.next) return clearInterval(rise);
    setVolume(now, level(key) * t);
    if (t >= 1) clearInterval(rise);
  }, 50);
}

/**
 * One pass of a track that starts the next pass shortly before it ends. The next
 * pass picks its file then, so if dark mode changed meanwhile, Gen 4's builder
 * crossfades from the day track into the night one (or back) at the loop, never mid-tune.
 */
function loop(key: string): HTMLAudioElement {
  const el = sound(musicUrl(fileFor(key)));
  setVolume(el, level(key));
  el.addEventListener('timeupdate', () => {
    if (!track || track.now !== el || track.next || !el.duration) return;
    if (el.duration - el.currentTime > CROSSFADE) return;
    const next = loop(key);
    setVolume(next, 0);
    track.next = next;
    play(next);
    const started = Date.now();
    const blend = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / (CROSSFADE * 1000));
      if (track?.next !== next) return clearInterval(blend);
      setVolume(next, level(key) * t);
      setVolume(el, level(key) * (1 - t));
      if (t >= 1) {
        clearInterval(blend);
        unplug(el);
        track = { key, now: next, next: null };
      }
    }, 50);
  });
  return el;
}

/** A Pokémon's cry (`faint` plays it lower, as it goes down). Replaces any effect playing. */
export function playCry(species: string, format: string, { faint = false } = {}): void {
  if (!settings.sound || !settings.effectsVolume) return;
  if (effect) unplug(effect);
  const el = sound(cryUrl(species, format));
  setVolume(el, settings.effectsVolume * CRY_LEVEL);
  if (faint) {
    el.preservesPitch = false;
    el.playbackRate = FAINT_RATE;
  }
  el.addEventListener('ended', () => unplug(el));
  effect = el;
  play(el);
}

/**
 * Called on every tap and key: browsers (iOS above all) only let sound start from
 * one. Wakes Web Audio and starts a track the browser held back.
 */
function wake(): void {
  if (!settings.sound) return;
  if (context && context.state !== 'running') void context.resume().catch(() => {});
  if (track?.now.paused && !document.hidden) play(track.now);
}

/** Web Audio, made on first use (everything that plays shares it). */
function audioContext(): AudioContext | null {
  const Ctx =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx) return null;
  context ??= new Ctx();
  return context;
}

let master: AudioNode | null = null;
/**
 * Where every sound goes: a limiter just under full scale, so a cry over the
 * music can't clip or jump out, at any volume.
 */
function output(ctx: AudioContext): AudioNode {
  if (master) return master;
  if (typeof ctx.createDynamicsCompressor !== 'function') return (master = ctx.destination);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  return (master = limiter);
}

/** The select sound plays at this share of the effects volume: a subtle tick under the cries. */
const SELECT_LEVEL = 0.3;

/** The select sound, decoded once: a buffer starts at once, an <audio> element only after loading. */
let selectBuffer: AudioBuffer | null = null;
let selectLoading = false;
function loadSelect(): void {
  const ctx = audioContext();
  if (!ctx || selectBuffer || selectLoading) return;
  selectLoading = true;
  fetch(`${base()}sfx/select.mp3`)
    .then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b))
    .then(
      (buffer) => (selectBuffer = buffer),
      () => (selectLoading = false),
    );
}

/**
 * The menu select sound (see `menuSounds`). Played apart from the effect, so it
 * never cuts off a cry: from the decoded buffer once it's ready, else an element.
 */
export function playSelect(): void {
  if (!settings.sound || !settings.effectsVolume) return;
  const ctx = audioContext();
  if (ctx && selectBuffer) {
    if (ctx.state === 'suspended') void ctx.resume();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = selectBuffer;
    gain.gain.value = settings.effectsVolume * SELECT_LEVEL;
    source.connect(gain).connect(output(ctx));
    source.start();
    return;
  }
  loadSelect();
  if (select) unplug(select);
  select = sound(`${base()}sfx/select.mp3`);
  setVolume(select, settings.effectsVolume * SELECT_LEVEL);
  play(select);
}

/** What counts as a control, for the select sound. */
const CONTROL = 'button, a[href], [role="button"], [role="radio"], [role="switch"], [role="tab"]';

/**
 * Plays the select sound on every tap of a control, in menus and battles alike
 * (moves, switches, sheets). Returns the cleanup.
 */
export function menuSounds(root: Document = document): () => void {
  const onControl = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest?.(CONTROL);
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
    playSelect();
  };
  // The sound starts as the control is pressed, not when it's let go.
  const onDown = (e: PointerEvent) => {
    wake();
    if (e.button === 0) onControl(e.target);
  };
  // A keyboard press (Enter or Space) clicks without a pointer: detail is 0.
  const onClick = (e: MouseEvent) => {
    wake();
    if (e.detail === 0) onControl(e.target);
  };
  // iOS only lets sound start from a touch's end or a key, not its start.
  const events = ['touchend', 'keydown'] as const;
  root.addEventListener('pointerdown', onDown, true);
  root.addEventListener('click', onClick, true);
  events.forEach((e) => root.addEventListener(e, wake, true));
  return () => {
    root.removeEventListener('pointerdown', onDown, true);
    root.removeEventListener('click', onClick, true);
    events.forEach((e) => root.removeEventListener(e, wake, true));
  };
}

/** The chime's peak, as a share of the effects volume: about as loud as a cry. */
const CHIME_LEVEL = 0.15;

/** A short two-note chime (versus: your battle started, or it's your turn). Synthesized, no file. */
export function playChime(): void {
  if (!settings.sound || !settings.effectsVolume) return;
  const ctx = audioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [i, freq] of [660, 880].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    const start = t + i * 0.14;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(CHIME_LEVEL * settings.effectsVolume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain).connect(output(ctx));
    osc.start(start);
    osc.stop(start + 0.24);
  }
}

// Music pauses with the tab and picks up where it was when the player comes back.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!track) return;
    const els = [track.now, track.next].filter((e): e is HTMLAudioElement => !!e);
    if (document.hidden) els.forEach((e) => e.pause());
    else if (settings.sound) {
      // iOS suspends Web Audio in the background.
      if (context && context.state !== 'running') void context.resume().catch(() => {});
      els.forEach(play);
    }
  });
}
