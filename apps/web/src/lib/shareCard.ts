// The share image: the same facts as the share text (lib/share.ts), drawn as
// a card in the home screens' look (a lid, seam and ball, stone ground), with
// team sprites in place of names. The lid takes the colour of the game played,
// so a glance tells the generation.
// Drawn on a canvas in the browser from self-hosted assets, so nothing leaves
// the device until the player shares it.
import type { FormatId } from '@daily-battle/data/formats';
import { condenseTries, tryCount } from './results';
import type { ShareModel, ShareRow } from './share';
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
/**
 * Each game's lid: one colour from its games, deep enough for white text, and
 * the ball's centre button. Emerald for Gen 3, Diamond's steel blue for Gen 4,
 * Black for Gen 5 (with a white button), and Y's red for Gen 6.
 */
export const LIDS: Record<FormatId, { lid: string; deep: string; button: string }> = {
  gen3ou: { lid: '#2f7a5c', deep: '#24624a', button: '#2f7a5c' },
  gen4ou: { lid: '#4a6890', deep: '#3a5578', button: '#4a6890' },
  gen5ou: { lid: '#2a2b31', deep: '#1c1d22', button: '#e2e2e8' },
  gen6ou: { lid: '#a83a48', deep: '#8c2e3b', button: '#a83a48' },
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

export async function drawShareCard(m: ShareModel): Promise<HTMLCanvasElement> {
  await Promise.all([
    ...[500, 600, 700].map((w) => document.fonts?.load(`${w} 24px "IBM Plex Sans"`)),
    document.fonts?.load('600 40px Fraunces'),
  ]).catch(() => {});
  const sprites = await Promise.all(m.team.map((s) => loadImage(getSprite(s.species, 'front'))));

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // The page is the stone of the home screens' lower half.
  ctx.fillStyle = C.stone;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const left = 96;
  const right = CARD_W - 96;

  // Header: the game's lid, the dark seam, and the ball on it.
  const colors = m.format ? LIDS[m.format] : CLAY;
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

  // The name and date on the lid; the streak on the right.
  const mid = 78;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = serif(38);
  ctx.fillText('Pokémon Daily', left, mid);
  const nameW = ctx.measureText('Pokémon Daily').width;
  ctx.fillStyle = 'rgb(255 255 255 / 0.86)';
  ctx.font = font(500, 28);
  ctx.fillText(`· ${m.game ? `${m.game} · ` : ''}${m.date}`, left + nameW + 14, mid + 2);
  if (m.streak) {
    const reset = m.streak === 'Streak reset';
    const text = reset ? m.streak : `🔥 ${m.streak}`;
    ctx.font = font(700, 20);
    const w = ctx.measureText(text).width + 22;
    pill(ctx, text, right - w, mid - 18, {
      bg: reset ? C.surface2 : C.goldSoft,
      fg: reset ? C.muted : C.goldText,
      size: 20,
    });
  }

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

  // Footer: where to play.
  if (m.url) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 20);
    ctx.fillText(m.url.replace(/^https?:\/\//, ''), left, CARD_H - 44);
  }
  return canvas;
}

export async function shareCardBlob(m: ShareModel): Promise<Blob | null> {
  const canvas = await drawShareCard(m);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
