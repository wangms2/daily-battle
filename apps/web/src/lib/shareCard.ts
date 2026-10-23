// The share image: the same facts as the share text (lib/share.ts), drawn as
// a clean card in the app's light theme, with team sprites in place of names.
// Drawn on a canvas in the browser from self-hosted assets, so nothing leaves
// the device until the player shares it.
import { condenseTries, tryCount } from './results';
import type { ShareModel, ShareRow } from './share';
import { getSprite } from './sprites';

/** Logical size: the common link-preview shape. Drawn at 2× for sharp text. */
export const CARD_W = 1200;
export const CARD_H = 630;
const SCALE = 2;

// Light theme tokens (styles.css :root).
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
};
const FONT = 'Verdana, Tahoma, "DejaVu Sans", ui-sans-serif, system-ui, sans-serif';
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
/** Try rows that fit between the headline and the address (rows start at y 252). */
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

export async function drawShareCard(m: ShareModel): Promise<HTMLCanvasElement> {
  const [logo, ...sprites] = await Promise.all([
    loadImage(`${import.meta.env.BASE_URL}favicon.svg`),
    ...m.team.map((s) => loadImage(getSprite(s.species, 'front'))),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Page and card.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  roundRect(ctx, 40, 40, CARD_W - 80, CARD_H - 80, 16);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const left = 96;
  const right = CARD_W - 96;

  // Header: mark, name and date; the streak on the right.
  if (logo) ctx.drawImage(logo, left, 84, 44, 44);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  ctx.font = font(600, 30);
  ctx.fillText('Daily Battle', left + 60, 107);
  const nameW = ctx.measureText('Daily Battle').width;
  ctx.fillStyle = C.muted;
  ctx.font = font(500, 30);
  ctx.fillText(`· ${m.game ? `${m.game} · ` : ''}${m.date}`, left + 60 + nameW + 12, 107);
  if (m.streak) {
    const reset = m.streak === 'Streak reset';
    const text = reset ? m.streak : `🔥 ${m.streak}`;
    ctx.font = font(700, 20);
    const w = ctx.measureText(text).width + 22;
    pill(ctx, text, right - w, 89, {
      bg: reset ? C.surface2 : C.goldSoft,
      fg: reset ? C.muted : C.goldText,
      size: 20,
    });
  }

  // Headline.
  let y = 196;
  ctx.textBaseline = 'middle';
  if (m.status === 'firstTry') {
    const w = pill(ctx, '⭐ First try', left, y - 21, {
      bg: C.gold,
      fg: C.goldText,
      size: 24,
    });
    ctx.fillStyle = C.text;
    ctx.font = font(600, 28);
    ctx.fillText(`${m.rows[0]!.remaining}/6 left`, left + w + 16, y);
  } else {
    let x = left;
    if (m.cleared || m.status === 'failed') {
      mark(ctx, m.cleared, x + 12, y);
      x += 40;
    }
    ctx.fillStyle = m.status === 'pending' ? C.muted : C.text;
    ctx.font = font(600, 28);
    ctx.fillText(m.headline, x, y);
  }

  // The tries that counted. The left column fits MAX_ROWS above the address;
  // a longer day keeps its first try, a count, and its last tries.
  y = 252;
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

  // Team: two rows of three, sprites on a shared baseline, names under them.
  const cellW = 150;
  const gridX = right - cellW * 3;
  m.team.forEach((s, i) => {
    const cx = gridX + (i % 3) * cellW + cellW / 2;
    const base = 260 + Math.floor(i / 3) * 150; // sprite baseline
    const img = sprites[i];
    if (img) {
      // Whole-pixel scaling at the 2× canvas: 1× or 1.5× logical.
      const k = Math.max(img.width, img.height) * 1.5 <= 116 ? 1.5 : 1;
      const w = img.width * k;
      const h = img.height * k;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, cx - w / 2, base - h, w, h);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.font = font(600, 17);
    ctx.fillStyle = s.swapped ? C.gold : C.text;
    ctx.fillText(s.swapped ? `${s.species}*` : s.species, cx, base + 26, cellW - 8);
    ctx.textAlign = 'left';
  });

  // Footer: where to play.
  if (m.url) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 20);
    ctx.fillText(m.url.replace(/^https?:\/\//, ''), left, CARD_H - 84);
  }
  return canvas;
}

export async function shareCardBlob(m: ShareModel): Promise<Blob | null> {
  const canvas = await drawShareCard(m);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
