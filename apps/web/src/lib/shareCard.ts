// The share image: the same facts as the share text (lib/share.ts), drawn as
// a card in the home screens' look (a lid, seam and ball, stone ground), with
// team sprites in place of names. The lid takes the colour of the game played,
// so a glance tells the generation.
// Drawn on a canvas in the browser from self-hosted assets, so nothing leaves
// the device until the player shares it.
import { LIDS, MASCOT } from './genColors';
import { condenseTries, tryCount } from './results';
import {
  isShareAll,
  shareHeader,
  shortHeadline,
  type ShareAll,
  type ShareModel,
  type ShareRow,
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
const ROW_H = 52;
/** Try rows that fit between the headline and the address (rows start at y 270). */
const MAX_ROWS = 5;

/** One try: its mark, then six squares (green = Pokémon left). Returns the right edge. */
function tryRow(ctx: CanvasRenderingContext2D, r: ShareRow, x: number, y: number): number {
  mark(ctx, r.result === 'win', x + 12, y + SQ / 2);
  let sx = x + 40;
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
function drawLid(ctx: CanvasRenderingContext2D, colors: typeof CLAY, header: string) {
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
  ctx.beginPath();
  ctx.arc(CARD_W / 2, 156, 30, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = C.seam;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CARD_W / 2, 156, 9, 0, Math.PI * 2);
  ctx.fillStyle = colors.button;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();

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

function footer(ctx: CanvasRenderingContext2D, url: string | undefined) {
  if (!url) return;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.muted;
  ctx.font = font(500, 20);
  ctx.fillText(url.replace(/^https?:\/\//, ''), LEFT, CARD_H - 44);
}

export async function drawShareCard(m: ShareModel): Promise<HTMLCanvasElement> {
  await loadFonts();
  const sprites = await Promise.all(m.team.map((s) => loadImage(getSprite(s.species, 'front'))));
  const { canvas, ctx } = blankCard();
  const left = LEFT;
  const right = RIGHT;
  const mid = MID;

  // Header: the game's lid with the name and date; the streak on the right.
  drawLid(ctx, m.format ? LIDS[m.format] : CLAY, shareHeader(m));
  if (m.streak) streakPill(ctx, m.streak, right, mid - 18);

  // Headline.
  let y = 222;
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

  // The tries that counted. The left column fits MAX_ROWS above the address;
  // a longer day keeps its first try, a count, and its last tries.
  y = 270;
  for (const r of condenseTries(m.rows, MAX_ROWS, MAX_ROWS - 2)) {
    if ('more' in r) {
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.muted;
      ctx.font = font(600, 22);
      ctx.fillText(`⋯ ${tryCount(r.more)} more`, left + 40, y + SQ / 2);
    } else {
      tryRow(ctx, r, left, y);
    }
    y += ROW_H;
  }

  // Team: two rows of three, sprites standing on a shadow, names under them.
  const cellW = 160;
  const gridX = right - cellW * 3;
  m.team.forEach((s, i) => {
    const cx = gridX + (i % 3) * cellW + cellW / 2;
    const base = 322 + Math.floor(i / 3) * 160; // sprite baseline
    const img = sprites[i];
    if (img) {
      // Half-pixel steps at the 2× canvas, as large as fits a 136px cell, 1× to 2×.
      const k = Math.min(
        2,
        Math.max(1, Math.floor((136 / Math.max(img.width, img.height)) * 2) / 2),
      );
      const w = img.width * k;
      const h = img.height * k;
      groundShadow(ctx, cx, base + 2, Math.max(36, w * 0.5));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, cx - w / 2, base - h, w, h);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.font = font(600, 17);
    ctx.fillStyle = s.swapped ? C.gold : C.text;
    ctx.fillText(s.swapped ? `${s.species}*` : s.species, cx, base + 28, cellW - 8);
    ctx.textAlign = 'left';
  });

  footer(ctx, m.url);
  return canvas;
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
  const { canvas, ctx } = blankCard();
  drawLid(ctx, CLAY, all.date);

  // The rows sit in the middle of the space between the ball and the address.
  const top = 200;
  const bottom = CARD_H - 76;
  const height = all.games.length * GAME_ROW + (all.games.length - 1) * GAME_GAP;
  let y = top + Math.max(0, (bottom - top - height) / 2);
  all.games.forEach((m, i) => {
    // The mascot on its game's colour.
    const tile = GAME_ROW - 4;
    roundRect(ctx, LEFT, y + 2, tile, tile, 12);
    ctx.fillStyle = m.format ? LIDS[m.format].lid : C.clay;
    ctx.fill();
    const img = mascots[i];
    if (img) {
      // Gen 3's pixel art at its own size; later sprites have a wide margin, so they're
      // drawn a little larger than the tile and clipped to it.
      const pixel = m.format === 'gen3ou';
      const k = pixel ? 1 : (tile * 1.2) / Math.max(img.width, img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.save();
      roundRect(ctx, LEFT, y + 2, tile, tile, 12);
      ctx.clip();
      ctx.imageSmoothingEnabled = !pixel;
      ctx.drawImage(img, LEFT + (tile - w) / 2, y + 2 + (tile - h) / 2, w, h);
      ctx.restore();
    }

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
    tryRow(ctx, m.rows.at(-1)!, 560, y + (GAME_ROW - SQ) / 2);
    if (m.streak) streakPill(ctx, m.streak, RIGHT, y + GAME_ROW / 2 - 16, 18);
    y += GAME_ROW + GAME_GAP;
  });

  footer(ctx, all.url);
  return canvas;
}

/** The PNG for either kind of share. */
export async function anyShareCardBlob(m: ShareModel | ShareAll): Promise<Blob | null> {
  const canvas = await (isShareAll(m) ? drawShareAllCard(m) : drawShareCard(m));
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function shareCardBlob(m: ShareModel): Promise<Blob | null> {
  const canvas = await drawShareCard(m);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
