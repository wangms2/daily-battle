// Sound (DESIGN.md §21): battle music and Pokémon cries, as on Showdown, plus a
// short chime for versus. Off by default; while it's off nothing is downloaded
// or played. Music plays in battles only, one track per generation, and loops
// with a short crossfade (the tracks end in a fade-out). One effect plays at a
// time, so a fast turn doesn't stack cries. All audio access goes through here.
import { genOf } from '@daily-battle/data';
import { toId } from './data';

export interface AudioSettings {
  sound: boolean;
  /** 0 to 1. */
  musicVolume: number;
  /** 0 to 1. Cries and the versus chime. */
  effectsVolume: number;
}

/** Seconds of overlap when the music loops back to its start. */
const CROSSFADE = 2.5;
/** How long the music fades out when a battle ends. */
const FADE_OUT_MS = 1200;
/** Faint cries play lower and slower, as in the games. */
const FAINT_RATE = 0.8;

const base = () => `${import.meta.env.BASE_URL}audio/`;
const musicUrl = (format: string) => `${base()}music/gen${genOf(format)}.mp3`;

/** Gen 3 to 5 use the game-era cries; Gen 6 and every Mega the current ones. */
export function cryUrl(species: string, format: string): string {
  const style = genOf(format) >= 6 || /-Mega(-[XY])?$/.test(species) ? 'latest' : 'legacy';
  return `${base()}cries/${style}/${toId(species)}.mp3`;
}

let settings: AudioSettings = { sound: false, musicVolume: 0.5, effectsVolume: 0.5 };
/** The battle music wanted now (a format), whether or not it's playing. */
let wanted: string | null = null;
let track: { format: string; now: HTMLAudioElement; next: HTMLAudioElement | null } | null = null;
/** A track fading out after its battle, and its timer. */
let fading: { els: HTMLAudioElement[]; timer: ReturnType<typeof setInterval> } | null = null;
let effect: HTMLAudioElement | null = null;
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
  if (track) {
    track.now.volume = next.musicVolume;
    if (track.next) track.next.volume = next.musicVolume;
  }
}

/** A battle's music: its generation's track, from the start, looping until `stopMusic`. */
export function startMusic(format: string): void {
  wanted = format;
  if (settings.sound) startTrack(format);
}

/** Fades the battle music out (the battle ended, or the screen closed). */
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

function startTrack(format: string) {
  if (track?.format === format) return;
  stopTrack();
  const now = loop(format);
  track = { format, now, next: null };
  play(now);
}

/** One pass of a track that starts the next pass shortly before it ends. */
function loop(format: string): HTMLAudioElement {
  const el = new Audio(musicUrl(format));
  el.volume = settings.musicVolume;
  el.addEventListener('timeupdate', () => {
    if (!track || track.now !== el || track.next || !el.duration) return;
    if (el.duration - el.currentTime > CROSSFADE) return;
    const next = loop(format);
    next.volume = 0;
    track.next = next;
    play(next);
    const started = Date.now();
    const blend = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / (CROSSFADE * 1000));
      if (track?.next !== next) return clearInterval(blend);
      next.volume = settings.musicVolume * t;
      el.volume = settings.musicVolume * (1 - t);
      if (t >= 1) {
        clearInterval(blend);
        el.pause();
        track = { format, now: next, next: null };
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
