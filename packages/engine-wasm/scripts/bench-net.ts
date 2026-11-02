// Times the network's forward pass in WASM at a few batch sizes.
// Usage: pnpm --filter @daily-battle/engine-wasm exec tsx scripts/bench-net.ts [file.wasm]
// Needs tools/net/data/export/net.dbnet and net.fix (python export.py).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Engine, NET_OBS, type NetInput, type WasmModule } from '../src/index';
import { distPath } from '../src/node';

declare const WebAssembly: { Module: new (bytes: Uint8Array) => WasmModule };

const dir = fileURLToPath(new URL('../../../tools/net/data/export/', import.meta.url));
const wasm = process.argv[2] ?? distPath(6);
const engine = new Engine(new WebAssembly.Module(readFileSync(wasm)));
engine.netLoad(readFileSync(`${dir}net.dbnet`));

const b = readFileSync(`${dir}net.fix`);
const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
const { floats: nf, ids: ni, actions: na } = NET_OBS;
const rows: NetInput[] = [];
let at = 4;
for (let r = v.getUint32(0, true); r > 0; r--) {
  const floats = Array.from({ length: nf }, () => ((at += 4), v.getFloat32(at - 4, true)));
  const ids = Array.from({ length: ni }, () => ((at += 2), v.getUint16(at - 2, true)));
  const mask = Array.from({ length: na }, () => b[at++]!);
  at += (2 * na + 1) * 4;
  rows.push({ floats, ids, mask });
}

console.log(`${wasm}: ${rows.length} fixture rows`);
// Rounds interleave the batch sizes, so a busy spell on the machine hits all of them alike.
const sizes = [1, 8, 32, 128];
const best = sizes.map(() => Infinity);
for (let round = 0; round < 6; round++) {
  sizes.forEach((batch, k) => {
    const input = Array.from({ length: batch }, (_, i) => rows[i % rows.length]!);
    engine.netForward(input);
    const reps = Math.max(1, Math.round(64 / batch));
    const t = performance.now();
    for (let i = 0; i < reps; i++) engine.netForward(input);
    best[k] = Math.min(best[k]!, (performance.now() - t) / (reps * batch));
  });
}
sizes.forEach((batch, k) =>
  console.log(`batch ${String(batch).padStart(3)}: ${best[k]!.toFixed(2)} ms/position`),
);
