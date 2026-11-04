// The advanced coach's gallery: renders tips from scripts/advanced-scan.ts
// (--out JSONL) as one HTML page for the owner to grade (sound / clear /
// useful), each with the board (the judge's first sampled world), the tip's
// text, its facts and numbers, and the oracle's grades.
//   pnpm exec tsx scripts/advanced-gallery.ts --tips a.jsonl[,b.jsonl] --out gallery.html [--max 50] [--concept risk|slow|reads]
import { readFileSync, writeFileSync } from 'node:fs';
import { FORMATS } from '@daily-battle/data';
import { Dex } from '@pkmn/sim';
import { readText, type ReadTip } from '../src/coach/advanced/reads';
import { riskText, type RiskTip } from '../src/coach/advanced/risk';
import { HAZARD_MOVES, PACING_MOVES, slowText, type SlowTip } from '../src/coach/advanced/slow';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const TIPS = arg('tips');
const OUT = arg('out');
if (!TIPS || !OUT) throw new Error('usage: --tips <a.jsonl[,b.jsonl]> --out <gallery.html>');
const MAX = Number(arg('max') ?? 50);
const CONCEPT = arg('concept') ?? 'risk';

interface Row {
  format: string;
  i: number;
  swap: boolean;
  turn: number;
  top: string;
  legal: string[];
  oracle?: Record<string, number>;
  oracleLead?: number;
  tip:
    | ({ concept: 'risk'; kind: 'miss' } & RiskTip)
    | ({ concept: 'slow' } & SlowTip)
    | ({ concept: 'reads' } & ReadTip);
  state: string;
}

/** Slow tips: only the moves the detector still uses. */
function keep(r: Row) {
  const s = r.state.split('/')[0]!.split('=');
  const m = /^move (\d)/.exec((r.tip as SlowTip).choice);
  const id = m ? s[Number(s[6])]!.split(',')[21 + Number(m[1])]!.split(';')[0]!.toLowerCase() : '';
  return HAZARD_MOVES.has(id) || PACING_MOVES.has(id);
}

const rows: Row[] = TIPS.split(',').flatMap((f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Row)
    .filter((r) => r.tip.concept === CONCEPT && (r.tip.concept !== 'slow' || keep(r))),
);
// Spread over formats: round-robin by format, in file order.
const byFormat = new Map<string, Row[]>();
for (const r of rows) byFormat.set(r.format, [...(byFormat.get(r.format) ?? []), r]);
const picked: Row[] = [];
for (let k = 0; picked.length < Math.min(MAX, rows.length); k++)
  for (const list of byFormat.values()) if (list[k] && picked.length < MAX) picked.push(list[k]!);

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (x: number) => `${Math.round(100 * x)}%`;

interface Mon {
  species: string;
  hp: number;
  moves: { id: string; name: string; acc: number | true }[];
}
function side(s: string, dex: typeof Dex): { active: number; mons: Mon[] } {
  const f = s.split('=');
  const mons = f.slice(0, 6).map((m) => {
    const p = m.split(',');
    return {
      species: dex.species.get(p[0]!).name || p[0]!,
      hp: Number(p[6]) / Number(p[7]),
      moves: p.slice(22, 26).map((x) => {
        const mv = dex.moves.get(x.split(';')[0]!);
        return { id: mv.id, name: mv.name || x, acc: mv.accuracy };
      }),
    };
  });
  return { active: Number(f[6]), mons };
}
const moveOf = (mon: Mon, choice: string) => {
  const m = /^move (\d)/.exec(choice);
  return m ? mon.moves[Number(m[1]) - 1] : undefined;
};
const label = (own: { mons: Mon[] }, active: Mon, c: string) => {
  const s = /^switch (\d)/.exec(c);
  return s ? `switch to ${own.mons[Number(s[1]) - 1]?.species}` : (moveOf(active, c)?.name ?? c);
};

const cards = picked.map((r, n) => {
  const dex = Dex.forGen(FORMATS[r.format as keyof typeof FORMATS].gen);
  const [mine, foe] = r.state.split('/').map((s) => side(s, dex)) as [
    ReturnType<typeof side>,
    ReturnType<typeof side>,
  ];
  const me = mine.mons[mine.active]!;
  const them = foe.mons[foe.active]!;
  let text: string;
  let facts: string;
  if (r.tip.concept === 'risk') {
    const safe = moveOf(me, r.tip.safe)!;
    const risky = moveOf(me, r.tip.risky)!;
    text = riskText(safe.name, risky.name, risky.acc === true ? 100 : risky.acc, n);
    facts = `${esc(risky.name)} is ${risky.acc === true ? '—' : `${risky.acc}%`} accurate; a costly miss
    in ${pct(r.tip.bad)} of its outcomes. Win chance (network): ${esc(safe.name)} ${r.tip.values.safe.toFixed(2)},
    ${esc(risky.name)} ${r.tip.values.risky.toFixed(2)}.`;
  } else if (r.tip.concept === 'reads') {
    const t = r.tip;
    const n = {
      choice: label(mine, me, t.choice).replace(/^switch to/, 'switching to'),
      contrast: label(mine, me, t.contrast).replace(/^switch to/, 'switching to'),
      foe: dex.species.get(t.foe).name || t.foe,
      target: dex.species.get(t.target).name || t.target,
    };
    text = readText(t, n, r.turn + n.choice.length);
    facts = `${t.kind}; foe stays ${pct(t.pStay)}, switches to ${esc(n.target)} ${pct(t.pTarget)}.
    Win chance (network) vs stay / vs switch: ${esc(n.choice)} ${t.vsStay.choice.toFixed(2)} / ${t.vsSwitch.choice.toFixed(2)},
    ${esc(n.contrast)} ${t.vsStay.contrast.toFixed(2)} / ${t.vsSwitch.contrast.toFixed(2)}.`;
  } else {
    const t = r.tip;
    const move = moveOf(me, t.choice)!;
    const contrast = label(mine, me, t.contrast);
    const targets = t.targets?.map((x) => ({
      name: dex.species.get(x.species).name,
      frac: x.frac,
    }));
    text = slowText(
      move.id,
      { move: move.name, contrast, foe: them.species, ...(targets ? { targets } : {}) },
      n,
    );
    facts = `${t.kind}: ${esc(move.name)} ${t.values.choice.toFixed(2)} vs ${esc(contrast)} ${t.values.contrast.toFixed(2)}
    (network win chance; ahead by 0.05+ in ${pct(t.worlds)} of worlds)${
      targets
        ? `. Hits: ${targets.map((x) => `${esc(x.name)}${x.frac ? ` ${x.frac.toFixed(3)}` : ''}`).join(', ')}`
        : ''
    }.`;
  }
  const team = (s: ReturnType<typeof side>) =>
    s.mons
      .map(
        (m, i) =>
          `<span class="${i === s.active ? 'act' : ''} ${m.hp <= 0 ? 'ko' : ''}">${esc(m.species)} ${pct(Math.max(0, m.hp))}</span>`,
      )
      .join(' ');
  const oracle = r.oracle
    ? Object.entries(r.oracle)
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `${esc(label(mine, me, c))} ${v.toFixed(2)}`)
        .join(' · ')
    : 'not graded';
  return `<section>
  <h2>#${n + 1} · ${r.format} · battle ${r.i}${r.swap ? 'b' : 'a'} · turn ${r.turn}</h2>
  <p class="tip">${esc(text)}</p>
  <p><b>You:</b> ${team(mine)}<br><b>Foe</b> (sampled world): ${team(foe)}</p>
  <p><b>${esc(me.species)}</b> vs <b>${esc(them.species)}</b>. Moves: ${me.moves
    .map((m) => `${esc(m.name)} (${m.acc === true ? '—' : `${m.acc}%`})`)
    .join(', ')}</p>
  <p><b>Facts:</b> ${facts}</p>
  <p><b>Oracle</b> (100k on the true state): ${oracle}${r.oracleLead !== undefined ? ` — advice ahead by ${r.oracleLead.toFixed(2)}` : ''}</p>
  <p class="grade">${['sound', 'clear', 'useful']
    .map((g) => `<label><input type="checkbox" data-n="${n + 1}" data-g="${g}"> ${g}</label>`)
    .join(' ')} <input class="note" data-n="${n + 1}" placeholder="note"></p>
</section>`;
});

writeFileSync(
  OUT,
  `<!doctype html><meta charset="utf-8"><title>Advanced coach gallery: ${CONCEPT}</title>
<style>body{font:15px system-ui;max-width:900px;margin:2em auto;padding:0 1em}section{border:1px solid #ccc;border-radius:8px;padding:.5em 1em;margin:1em 0}
h2{font-size:1em;color:#555}.tip{font-size:1.15em;background:#eef6ff;padding:.5em;border-radius:6px}.act{font-weight:bold}.ko{color:#aaa;text-decoration:line-through}
.note{width:50%}button{font-size:1em;padding:.4em 1em}</style>
<h1>Advanced coach: ${CONCEPT} tips (${picked.length} of ${rows.length})</h1>
<p>Grade each tip: <b>sound</b> (the advice is right), <b>clear</b> (the words make sense), <b>useful</b> (worth saying). Then press Copy and paste the result back.</p>
${cards.join('\n')}
<button onclick="navigator.clipboard.writeText(JSON.stringify([...document.querySelectorAll('section')].map((s,i)=>({n:i+1,...Object.fromEntries([...s.querySelectorAll('input[type=checkbox]')].map(c=>[c.dataset.g,c.checked])),note:s.querySelector('.note').value}))));this.textContent='Copied'">Copy grades</button>`,
);
console.log(`wrote ${picked.length} tips to ${OUT}`);
