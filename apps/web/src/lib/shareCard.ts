// The share image: the same facts as the share text (lib/share.ts), drawn as
// a card in the home screens' look (a lid, seam and ball, stone ground), with
// team sprites in place of names. The lid takes the colour of the game played,
// so a glance tells the generation.
// Drawn on a canvas in the browser from self-hosted assets, so nothing leaves
// the device until the player shares it.
import { LIDS, MASCOT } from './genColors';
import {
  isShareAll,
  isShareGame,
  levelLabel,
  shareHeader,
  shortHeadline,
  type AnyShare,
  type ShareAll,
  type ShareGame,
  type ShareModel,
  type ShareRow,
  type Stars,
} from './share';
import { getSprite } from './sprites';

/** Logical size: the common link-preview shape. Drawn at 2× for sharp text. */
export const CARD_W = 1200;
export const CARD_H = 630;
const SCALE = 2;

// Light theme tokens (styles.css :root), and the home screens' clay.
const C = {
  bg: '#f5f5f7',
  surface: '#ffffff',
  surface2: '#efeff3',
  border: '#dcdce4',
  text: '#1b1d26',
  muted: '#646778',
  gold: '#a9842f',
  goldSoft: '#f3ead6',
  goldText: '#1b1408',
  good: '#3d7a5a',
  bad: '#a33a46',
  forfeit: '#b2b3bc', // muted at about half strength, as on the result card
  clay: '#a3646a',
  clayDeep: '#8a4f58',
  seam: '#2b2d36',
  stone: '#f4f3f1',
};
/** The home screens' clay, for a share without a game. */
const CLAY = { lid: C.clay, deep: C.clayDeep, button: C.clay };

const FONT = '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}, ${EMOJI}`;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The part of a sprite that isn't transparent (sprites carry wide empty margins). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The opaque box in RGBA pixels `data` of a `width`×`height` image. */
export function opaqueBox(data: Uint8ClampedArray, width: number, height: number): Box {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0
    ? { x: 0, y: 0, w: width, h: height }
    : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** A sprite's opaque box; the whole image if it can't be read. */
function trimmed(img: HTMLImageElement): Box {
  const whole = { x: 0, y: 0, w: img.width, h: img.height };
  try {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    if (!g) return whole;
    g.drawImage(img, 0, 0);
    return opaqueBox(g.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
  } catch {
    return whole;
  }
}

/** How much to scale `box` to fit within `room`, up to `max`; whole or half steps from 1×, so pixels stay crisp. */
function fitScale(box: Box, room: number, max: number): number {
  const k = Math.min(max, room / Math.max(box.w, box.h));
  return k >= 1 ? Math.floor(k * 2) / 2 : k;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** ✓ or ✗ in the result colour, centred on (x, y). */
function mark(ctx: CanvasRenderingContext2D, won: boolean, x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = won ? C.good : C.bad;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (won) {
    ctx.moveTo(x - 9, y + 1);
    ctx.lineTo(x - 3, y + 8);
    ctx.lineTo(x + 10, y - 8);
  } else {
    ctx.moveTo(x - 8, y - 8);
    ctx.lineTo(x + 8, y + 8);
    ctx.moveTo(x + 8, y - 8);
    ctx.lineTo(x - 8, y + 8);
  }
  ctx.stroke();
  ctx.restore();
}

const SQ = 40;
const SQ_GAP = 8;

/** Box icons are 40×30; a row of them, drawn at whole or half steps so pixels stay crisp. */
const ICON_W = 40;
const ICON_H = 30;

/** An icon in greys and faded: a Pokémon that fainted. */
function faded(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  try {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    if (!g) return img;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 0.3 * d.data[i]! + 0.59 * d.data[i + 1]! + 0.11 * d.data[i + 2]!;
      // A mid grey, a little see-through: clearly out, still recognisable.
      const l = 95 + v * 0.45;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = l;
      d.data[i + 3] = d.data[i + 3]! * 0.8;
    }
    g.putImageData(d, 0, 0);
    return c;
  } catch {
    return img;
  }
}

/** Each try's team icons, by row, loaded once per card. */
type Icons = Map<string, HTMLImageElement | null>;

const loadIcons = (rows: ShareRow[]): Promise<Icons> => {
  const names = [...new Set(rows.flatMap((r) => r.team?.map((s) => s.species) ?? []))];
  return Promise.all(names.map((n) => loadImage(getSprite(n, 'icon')))).then(
    (imgs) => new Map(names.map((n, i) => [n, imgs[i]!])),
  );
};

/**
 * One try: its mark, then the team's icons, fainted ones greyed (or, for a try
 * saved without its team, six squares: green = Pokémon left). Returns the right edge.
 */
function tryRow(
  ctx: CanvasRenderingContext2D,
  r: ShareRow,
  x: number,
  y: number,
  icons?: Icons,
  k = 2,
): number {
  mark(ctx, r.result === 'win', x + 12, y + SQ / 2);
  let sx = x + 40;
  if (r.team && icons) {
    const w = ICON_W * k;
    const h = ICON_H * k;
    // Icons carry empty sides; neighbours overlap into them.
    const step = w - 6 * k;
    ctx.imageSmoothingEnabled = false;
    // Those still standing first, then the fainted, each in team order.
    const order = [...r.team.filter((s) => !s.fainted), ...r.team.filter((s) => s.fainted)];
    for (const s of order) {
      const img = icons.get(s.species);
      if (img) {
        // Icons sit low in their box; centre the box on the row, nudged up a touch.
        const src = s.fainted || r.result === 'forfeit' ? faded(img) : img;
        ctx.drawImage(src, sx, y + SQ / 2 - h / 2 - 4, w, h);
      }
      sx += step;
    }
    return sx - step + w;
  }
  for (let i = 0; i < 6; i++) {
    roundRect(ctx, sx, y, SQ, SQ, 7);
    if (i < r.remaining) {
      ctx.fillStyle = r.result === 'forfeit' ? C.forfeit : C.good;
      ctx.fill();
    } else {
      ctx.fillStyle = C.surface2;
      ctx.fill();
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    sx += SQ + SQ_GAP;
  }
  return sx - SQ_GAP;
}

/** Text in a rounded pill; returns its width. */
function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  { bg, fg, size, weight = 700 }: { bg: string; fg: string; size: number; weight?: number },
): number {
  ctx.font = font(weight, size);
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.75;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size * 0.55, y + h / 2 + 1);
  return w;
}

/** The home screens' serif, for the name and the headline. */
const serif = (size: number) => `600 ${size}px Fraunces, Georgia, serif`;

/** A soft shadow on the ground under a sprite, centred on (cx, y). */
function groundShadow(ctx: CanvasRenderingContext2D, cx: number, y: number, rx: number) {
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(1, 0.14);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, 'rgb(0 0 0 / 0.26)');
  g.addColorStop(1, 'rgb(0 0 0 / 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const loadFonts = () =>
  Promise.all([
    ...[500, 600, 700].map((w) => document.fonts?.load(`${w} 24px "IBM Plex Sans"`)),
    document.fonts?.load('600 40px Fraunces'),
  ]).catch(() => {});

/** A blank card, the stone of the home screens' lower half, drawn at 2×. */
function blankCard() {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.stone;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  return { canvas, ctx };
}

const LEFT = 96;
const RIGHT = CARD_W - 96;
/** The lid's text line. */
const MID = 78;

/** The lid with "Pokémon Daily · {header}" on it, the dark seam, and the ball. */
/** Which ball sits on the seam: a Poké Ball for Normal, Ultra for Hard, Premier for Easy. */
export type BallKind = 'poke' | 'ultra' | 'premier';

export const ballFor = (level: string | undefined): BallKind =>
  level === 'Hard' ? 'ultra' : level === 'Easy' ? 'premier' : 'poke';

const ULTRA = { top: '#26252b', band: '#f2c230' };
const PREMIER_RED = '#d1434b';

/** A ball at (cx, cy) of radius r, with a ring of width r/4 (the card's style). */
function drawBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  kind: BallKind,
  button: string,
) {
  const ring = kind === 'premier' ? PREMIER_RED : C.seam;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = C.stone;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (kind === 'ultra') {
    // The Ultra Ball: a black top with its two gold bands.
    ctx.fillStyle = ULTRA.top;
    ctx.fillRect(cx - r, cy - r, r * 2, r);
    ctx.fillStyle = ULTRA.band;
    ctx.fillRect(cx - r, cy - r * 0.62, r * 0.5, r * 0.42);
    ctx.fillRect(cx + r * 0.5, cy - r * 0.62, r * 0.5, r * 0.42);
  }
  if (kind !== 'poke') {
    // Its middle line.
    ctx.fillStyle = ring;
    ctx.fillRect(cx - r, cy - r * 0.09, r * 2, r * 0.18);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.27;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = kind === 'poke' ? button : C.stone;
  ctx.fill();
  ctx.lineWidth = r * 0.13;
  ctx.stroke();
}

function drawLid(
  ctx: CanvasRenderingContext2D,
  colors: typeof CLAY,
  header: string,
  ball: BallKind = 'poke',
) {
  const lid = ctx.createLinearGradient(0, 0, CARD_W, 150);
  lid.addColorStop(0, colors.lid);
  lid.addColorStop(1, colors.deep);
  ctx.fillStyle = lid;
  ctx.fillRect(0, 0, CARD_W, 150);
  ctx.fillStyle = C.seam;
  ctx.fillRect(0, 150, CARD_W, 12);
  ctx.save();
  ctx.shadowColor = 'rgb(0 0 0 / 0.28)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(CARD_W / 2, 156, 34, 0, Math.PI * 2);
  ctx.fillStyle = C.stone;
  ctx.fill();
  ctx.restore();
  drawBall(ctx, CARD_W / 2, 156, 30, ball, colors.button);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = serif(38);
  ctx.fillText('Pokémon Daily', LEFT, MID);
  const nameW = ctx.measureText('Pokémon Daily').width;
  ctx.fillStyle = 'rgb(255 255 255 / 0.86)';
  ctx.font = font(500, 28);
  ctx.fillText(`· ${header}`, LEFT + nameW + 14, MID + 2);
}

/** "🔥 5-day streak" in gold, or "Streak reset" in grey, ending at `rightX`. */
function streakPill(
  ctx: CanvasRenderingContext2D,
  streak: string,
  rightX: number,
  y: number,
  size = 20,
) {
  const reset = streak === 'Streak reset';
  const text = reset ? streak : `🔥 ${streak}`;
  ctx.font = font(700, size);
  const w = ctx.measureText(text).width + size * 1.1;
  pill(ctx, text, rightX - w, y, {
    bg: reset ? C.surface2 : C.goldSoft,
    fg: reset ? C.muted : C.goldText,
    size,
  });
}

/** Who played and where to play, in white under the title on the lid, so the card's body stays calm. */
function headerUrl(ctx: CanvasRenderingContext2D, url: string | undefined, trainer?: string) {
  ctx.textBaseline = 'middle';
  let x = LEFT;
  if (trainer) {
    ctx.fillStyle = '#ffffff';
    ctx.font = font(600, 21);
    const t = `Trainer ${trainer}`;
    ctx.fillText(t, x, MID + 42);
    x += ctx.measureText(t).width;
  }
  if (!url) return;
  ctx.fillStyle = 'rgb(255 255 255 / 0.78)';
  ctx.font = font(500, 21);
  ctx.fillText(`${trainer ? ' · ' : ''}${url.replace(/^https?:\/\//, '')}`, x, MID + 42);
}

/**
 * The team, sprites standing on a shadow, names under them: two rows of three at
 * the right, or (`row`) one row of six across the card, under the headline.
 */
function drawTeam(
  ctx: CanvasRenderingContext2D,
  team: ShareModel['team'],
  sprites: (HTMLImageElement | null)[],
  /** Which of `team` fainted in the deciding try: they're greyed, after those still standing. */
  fainted?: boolean[],
  row = false,
) {
  const cellW = row ? (RIGHT - LEFT) / 6 : 160;
  const gridX = row ? LEFT : RIGHT - cellW * 3;
  const room = row ? 150 : 136;
  const slots = team.map((_, i) => i);
  const order = fainted
    ? [...slots.filter((i) => !fainted[i]), ...slots.filter((i) => fainted[i])]
    : slots;
  order.forEach((t, i) => {
    const s = team[t]!;
    const out = !!fainted?.[t];
    const cx = gridX + (row ? i : i % 3) * cellW + cellW / 2;
    const base = row ? 452 : 322 + Math.floor(i / 3) * 160; // sprite baseline
    const img = sprites[t];
    if (img) {
      // The sprite itself (without its empty margin), as large as fits its cell,
      // up to 2×, standing on the shadow.
      const b = trimmed(img);
      const k = fitScale(b, room, 2);
      const w = b.w * k;
      const h = b.h * k;
      groundShadow(ctx, cx, base + 2, Math.max(36, w * 0.5));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(out ? faded(img) : img, b.x, b.y, b.w, b.h, cx - w / 2, base - h, w, h);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.font = font(600, 17);
    ctx.fillStyle = out ? C.muted : s.swapped ? C.gold : C.text;
    ctx.fillText(s.swapped ? `${s.species}*` : s.species, cx, base + 28, cellW - 8);
    ctx.textAlign = 'left';
  });
}

const loadTeam = (team: ShareModel['team']) =>
  Promise.all(team.map((s) => loadImage(getSprite(s.species, 'front'))));

export async function drawShareCard(m: ShareModel): Promise<HTMLCanvasElement> {
  await loadFonts();
  const sprites = await loadTeam(m.team);
  const { canvas, ctx } = blankCard();
  const left = LEFT;
  const right = RIGHT;
  const mid = MID;

  // Header: the game's lid with the name and date; the streak on the right.
  drawLid(ctx, m.format ? LIDS[m.format] : CLAY, shareHeader(m), ballFor(m.level));
  if (m.streak) streakPill(ctx, m.streak, right, mid - 18);

  // Headline.
  const y = 222;
  ctx.textBaseline = 'middle';
  if (m.status === 'firstTry') {
    const w = pill(ctx, '⭐ First try', left, y - 21, {
      bg: C.gold,
      fg: C.goldText,
      size: 24,
    });
    ctx.fillStyle = C.text;
    ctx.font = serif(34);
    ctx.fillText(`${m.rows[0]!.remaining}/6 left`, left + w + 18, y);
  } else {
    let x = left;
    if (m.cleared || m.status === 'failed') {
      mark(ctx, m.cleared, x + 12, y);
      x += 40;
    }
    ctx.fillStyle = m.status === 'pending' ? C.muted : C.text;
    ctx.font = serif(34);
    ctx.fillText(m.headline, x, y);
  }

  // The team greys out who fainted in the deciding try (a forfeit, all of them).
  const last = m.rows.at(-1);
  const fainted = last?.team && last.team.map((s) => s.fainted || last.result === 'forfeit');
  drawTeam(ctx, m.team, sprites, fainted, true);

  // The game's stars, bottom right, under the team: kept whatever the streak.
  if (m.stars) starPills(ctx, m.stars, right, CARD_H - 70, 20, false);

  headerUrl(ctx, m.url, m.trainer);
  return canvas;
}

/** "⭐ 10 first tries" in soft gold and "✓ 23 clears" in grey, ending at `rightX`. */
function starPills(
  ctx: CanvasRenderingContext2D,
  stars: Stars,
  rightX: number,
  y: number,
  size: number,
  short: boolean,
) {
  const first = short
    ? `⭐ ${stars.firstTries}`
    : `⭐ ${stars.firstTries} first ${stars.firstTries === 1 ? 'try' : 'tries'}`;
  const clears = short
    ? `✓ ${stars.clears}`
    : `✓ ${stars.clears} ${stars.clears === 1 ? 'clear' : 'clears'}`;
  ctx.font = font(700, size);
  const cw = ctx.measureText(clears).width + size * 1.1;
  pill(ctx, clears, rightX - cw, y, { bg: C.surface2, fg: C.text, size });
  ctx.font = font(700, size);
  const fw = ctx.measureText(first).width + size * 1.1;
  pill(ctx, first, rightX - cw - 8 - fw, y, { bg: C.goldSoft, fg: C.goldText, size });
}

const GAME_ROW = 84;
const GAME_GAP = 18;

/**
 * Today's games on one card (two to four): a row each with the game's mascot on
 * its colour, its name and short headline, the deciding try's squares, and its
 * streak. No teams: they don't fit four times.
 */
export async function drawShareAllCard(all: ShareAll): Promise<HTMLCanvasElement> {
  await loadFonts();
  const mascots = await Promise.all(
    all.games.map((m) => {
      const mascot = m.format && MASCOT[m.format];
      return mascot ? loadImage(getSprite(mascot.species, 'front', undefined, mascot.gen)) : null;
    }),
  );
  const icons = await loadIcons(all.games.map((m) => m.rows.at(-1)!));
  const { canvas, ctx } = blankCard();
  drawLid(ctx, CLAY, all.date);

  // The rows sit in the space under the ball (the address is up on the lid); four
  // games sit a little closer together.
  const gap = all.games.length > 3 ? 14 : GAME_GAP;
  const top = 196;
  const bottom = CARD_H - 28;
  const height = all.games.length * GAME_ROW + (all.games.length - 1) * gap;
  let y = top + Math.max(0, (bottom - top - height) / 2);
  all.games.forEach((m, i) => {
    // The mascot on its game's colour.
    const tile = GAME_ROW - 4;
    roundRect(ctx, LEFT, y + 2, tile, tile, 12);
    ctx.fillStyle = m.format ? LIDS[m.format].lid : C.clay;
    ctx.fill();
    const img = mascots[i];
    if (img) {
      // The mascot itself (without its empty margin), whole and centred in the tile.
      const pixel = m.format === 'gen3ou';
      const b = trimmed(img);
      const k = (tile - 12) / Math.max(b.w, b.h);
      const w = b.w * k;
      const h = b.h * k;
      ctx.imageSmoothingEnabled = !pixel;
      ctx.drawImage(img, b.x, b.y, b.w, b.h, LEFT + (tile - w) / 2, y + 2 + (tile - h) / 2, w, h);
    }
    // Easy or Hard: that ball in the tile's corner, as on the single game's card.
    if (m.level) drawBall(ctx, LEFT + tile - 6, y + 10, 14, ballFor(m.level), C.clay);

    // Name, then the short headline.
    const x = LEFT + tile + 22;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = serif(30);
    ctx.fillText(m.game ?? '', x, y + 24);
    const nameW = ctx.measureText(m.game ?? '').width;
    const extra = [m.level, m.coached && 'Coached'].filter(Boolean).join(' · ');
    if (extra) {
      ctx.fillStyle = C.muted;
      ctx.font = font(600, 20);
      ctx.fillText(`· ${extra}`, x + nameW + 10, y + 26);
    }
    if (m.status === 'firstTry') {
      pill(ctx, '⭐ First try', x, y + 46, { bg: C.gold, fg: C.goldText, size: 18 });
    } else {
      ctx.fillStyle = m.status === 'pending' ? C.muted : C.text;
      ctx.font = font(600, 21);
      ctx.fillText(shortHeadline(m), x, y + 62);
    }

    // The deciding try's squares, then the streak at the right edge.
    tryRow(ctx, m.rows.at(-1)!, 464, y + (GAME_ROW - SQ) / 2, icons);
    // With stars, the streak sits above them; alone, it's centred.
    if (m.streak) streakPill(ctx, m.streak, RIGHT, m.stars ? y + 4 : y + GAME_ROW / 2 - 16, 18);
    if (m.stars)
      starPills(ctx, m.stars, RIGHT, m.streak ? y + 46 : y + GAME_ROW / 2 - 16, 16, true);
    y += GAME_ROW + gap;
  });

  headerUrl(ctx, all.url, all.trainer);
  return canvas;
}

const LEVEL_ROW = 80;

/**
 * One game at several difficulties: the game's lid, a row for each difficulty
 * on the left (its ball and name with the short headline, then the deciding
 * try's squares and the streak), and the shared team on the right.
 */
export async function drawShareGameCard(g: ShareGame): Promise<HTMLCanvasElement> {
  await loadFonts();
  const [sprites, icons] = await Promise.all([
    loadTeam(g.team),
    loadIcons(g.levels.map((m) => m.rows.at(-1)!)),
  ]);
  const { canvas, ctx } = blankCard();
  const colors = g.format ? LIDS[g.format] : CLAY;
  drawLid(ctx, colors, shareHeader(g));

  const gap = g.levels.length > 3 ? 12 : GAME_GAP;
  const top = 196;
  const bottom = CARD_H - 28;
  const height = g.levels.length * LEVEL_ROW + (g.levels.length - 1) * gap;
  // The left column ends before the team's first sprite.
  const colRight = RIGHT - 160 * 3 - 24;
  let y = top + Math.max(0, (bottom - top - height) / 2);
  for (const m of g.levels) {
    drawBall(ctx, LEFT + 13, y + 14, 13, ballFor(m.level), colors.button);
    const x = LEFT + 36;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = serif(26);
    const label = levelLabel(m);
    ctx.fillText(label, x, y + 14);
    const labelW = ctx.measureText(label).width;
    ctx.fillStyle = m.status === 'pending' ? C.muted : C.text;
    ctx.font = font(600, 19);
    const head = m.status === 'firstTry' ? '⭐ First try!' : shortHeadline(m);
    ctx.fillText(head, x + labelW + 14, y + 16, colRight - (x + labelW + 14));
    // Squares end at LEFT + 320, leaving room for the streak before the team.
    tryRow(ctx, m.rows.at(-1)!, LEFT, y + 34, icons, 1);
    if (m.streak) streakPill(ctx, m.streak, colRight, y + 40, 16);
    y += LEVEL_ROW + gap;
  }

  drawTeam(ctx, g.team, sprites);
  headerUrl(ctx, g.url, g.trainer);
  return canvas;
}

/** The PNG for any kind of share. */
export async function anyShareCardBlob(m: AnyShare): Promise<Blob | null> {
  const canvas = await (isShareAll(m)
    ? drawShareAllCard(m)
    : isShareGame(m)
      ? drawShareGameCard(m)
      : drawShareCard(m));
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function shareCardBlob(m: ShareModel): Promise<Blob | null> {
  const canvas = await drawShareCard(m);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
