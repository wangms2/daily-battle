// Sound (DESIGN.md §21): battle music and Pokémon cries, as on Showdown, plus a
// short chime for versus and a select sound on every tap. Off by default; while it's
// off nothing is downloaded or played. Music plays in battles (one track per
// generation), in the team builder (one track for all) and on lesson screens (the
// tutorial track; a lesson's practice battle plays the battle music), and loops with a
// short crossfade (the tracks end in a fade-out). One effect plays at a
// time, so a fast turn doesn't stack cries. All audio access goes through here.
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
const level = (name: string) => settings.musicVolume * (TRACK_GAIN[name] ?? 1);

/** Seconds of overlap when the music loops back to its start. */
const CROSSFADE = 2.5;
/** How long the music fades out when a battle ends. */
const FADE_OUT_MS = 1200;
/** Faint cries play lower and slower, as in the games. */
const FAINT_RATE = 0.8;

const base = () => `${import.meta.env.BASE_URL}audio/`;
/** A track by name: `gen3`…`gen6` (battles) or `teambuilder`. */
const musicUrl = (name: string) => `${base()}music/${name}.mp3`;

/** Gen 3 to 5 use the game-era cries; Gen 6 and every Mega the current ones. */
export function cryUrl(species: string, format: string): string {
  const style = genOf(format) >= 6 || /-Mega(-[XY])?$/.test(species) ? 'latest' : 'legacy';
  return `${base()}cries/${style}/${toId(species)}.mp3`;
}

let settings: AudioSettings = { sound: false, musicVolume: 0.5, effectsVolume: 0.5 };
/** The track wanted now (its name), whether or not it's playing. */
let wanted: string | null = null;
let track: { name: string; now: HTMLAudioElement; next: HTMLAudioElement | null } | null = null;
/** A track fading out after its battle, and its timer. */
let fading: { els: HTMLAudioElement[]; timer: ReturnType<typeof setInterval> } | null = null;
let effect: HTMLAudioElement | null = null;
let select: HTMLAudioElement | null = null;
let context: AudioContext | null = null;

const play = (el: HTMLAudioElement) => void el.play()?.catch(() => {});

/** Applies the player's settings; called on every render, so it only acts on changes. */
export function configureAudio(next: AudioSettings): void {
  const was = settings;
  settings = next;
  if (!next.sound) {
    if (was.sound) {
      stopTrack();
      effect?.pause();
      effect = null;
    }
    return;
  }
  if (!was.sound && wanted) startTrack(wanted);
  // Ready the select sound, so the first tap doesn't wait for it.
  loadSelect();
  if (track) {
    track.now.volume = level(track.name);
    if (track.next) track.next.volume = level(track.name);
  }
}

/** A battle's music: its generation's track, from the start, looping until `stopMusic`. */
export function startMusic(format: string): void {
  want(`gen${genOf(format)}`);
}

const BUILDER = 'teambuilder';

/**
 * The team builder's track, the same in every generation. It's mastered about
 * 3 dB quieter than the battle tracks, so it sits under the menus.
 */
export function startBuilderMusic(): void {
  hold(BUILDER);
}

/** Fades the builder's track out, unless a battle's music has already taken over. */
export function stopBuilderMusic(): void {
  release(BUILDER);
}

/** How many open screens want each menu track. */
const holds: Record<string, number> = {};

function hold(name: string) {
  holds[name] = (holds[name] ?? 0) + 1;
  want(name);
}

/**
 * A screen with a menu track closed. The track stops a moment later unless the
 * next screen wants it too (the builder hands over to the lead pick), so it
 * plays on without starting over.
 */
function release(name: string) {
  holds[name] = Math.max(0, (holds[name] ?? 0) - 1);
  setTimeout(() => {
    if (!holds[name] && wanted === name) stopMusic();
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

function want(name: string) {
  wanted = name;
  if (settings.sound) startTrack(name);
}

/** Fades the music out (the battle ended, or the screen closed). */
export function stopMusic(): void {
  wanted = null;
  if (!track) return;
  const { now, next } = track;
  track = null;
  endFade();
  const els = [now, next].filter((e): e is HTMLAudioElement => !!e);
  const from = els.map((e) => e.volume);
  const started = Date.now();
  const timer = setInterval(() => {
    const t = Math.min(1, (Date.now() - started) / FADE_OUT_MS);
    els.forEach((e, i) => (e.volume = from[i]! * (1 - t)));
    if (t >= 1) endFade();
  }, 50);
  fading = { els, timer };
}

/** Stops a fade-out now, silencing what was fading. */
function endFade() {
  if (!fading) return;
  clearInterval(fading.timer);
  fading.els.forEach((e) => e.pause());
  fading = null;
}

function stopTrack() {
  endFade();
  track?.now.pause();
  track?.next?.pause();
  track = null;
}

function startTrack(name: string) {
  if (track?.name === name) return;
  stopTrack();
  const now = loop(name);
  track = { name, now, next: null };
  play(now);
}

/** One pass of a track that starts the next pass shortly before it ends. */
function loop(name: string): HTMLAudioElement {
  const el = new Audio(musicUrl(name));
  el.volume = level(name);
  el.addEventListener('timeupdate', () => {
    if (!track || track.now !== el || track.next || !el.duration) return;
    if (el.duration - el.currentTime > CROSSFADE) return;
    const next = loop(name);
    next.volume = 0;
    track.next = next;
    play(next);
    const started = Date.now();
    const blend = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / (CROSSFADE * 1000));
      if (track?.next !== next) return clearInterval(blend);
      next.volume = level(name) * t;
      el.volume = level(name) * (1 - t);
      if (t >= 1) {
        clearInterval(blend);
        el.pause();
        track = { name, now: next, next: null };
      }
    }, 50);
  });
  return el;
}

/** A Pokémon's cry (`faint` plays it lower, as it goes down). Replaces any effect playing. */
export function playCry(species: string, format: string, { faint = false } = {}): void {
  if (!settings.sound || !settings.effectsVolume) return;
  effect?.pause();
  const el = new Audio(cryUrl(species, format));
  el.volume = settings.effectsVolume;
  if (faint) {
    el.preservesPitch = false;
    el.playbackRate = FAINT_RATE;
  }
  effect = el;
  play(el);
}

/** Web Audio, made on first use (the chime and the select sound share it). */
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
    source.connect(gain).connect(ctx.destination);
    source.start();
    return;
  }
  loadSelect();
  select?.pause();
  select = new Audio(`${base()}sfx/select.mp3`);
  select.volume = settings.effectsVolume * SELECT_LEVEL;
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
  const onDown = (e: PointerEvent) => e.button === 0 && onControl(e.target);
  // A keyboard press (Enter or Space) clicks without a pointer: detail is 0.
  const onClick = (e: MouseEvent) => e.detail === 0 && onControl(e.target);
  root.addEventListener('pointerdown', onDown, true);
  root.addEventListener('click', onClick, true);
  return () => {
    root.removeEventListener('pointerdown', onDown, true);
    root.removeEventListener('click', onClick, true);
  };
}
/** A short two-note chime (versus: your battle started, or it's your turn). Synthesized, no file. */
export function playChime(): void {
  if (!settings.sound || !settings.effectsVolume) return;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  context ??= new Ctx();
  const t = context.currentTime;
  for (const [i, freq] of [660, 880].entries()) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = freq;
    const start = t + i * 0.14;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25 * settings.effectsVolume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain).connect(context.destination);
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
    else if (settings.sound) els.forEach(play);
  });
}
