// Builds one WebAssembly module per generation into dist/genN.wasm.
// Needs Rust with the wasm32-unknown-unknown target:
//   rustup target add wasm32-unknown-unknown
// Usage: pnpm --filter @daily-battle/engine-wasm build:wasm [gen…]

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { ENGINE_GENS, engineFile } from '../src/index';

const root = fileURLToPath(new URL('..', import.meta.url));
const crate = `${root}rust`;
const dist = `${root}dist`;
const built = `${crate}/target/wasm32-unknown-unknown/release/daily_battle_engine.wasm`;

const gens = process.argv.slice(2).map(Number);
mkdirSync(dist, { recursive: true });

for (const gen of gens.length ? gens : ENGINE_GENS) {
  execFileSync(
    'cargo',
    [
      'build',
      '--release',
      '--locked',
      '--target',
      'wasm32-unknown-unknown',
      '--features',
      `gen${gen}`,
    ],
    { cwd: crate, stdio: 'inherit' },
  );
  const out = `${dist}/${engineFile(gen)}`;
  copyFileSync(built, out);
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KiB`;
  console.log(
    `gen${gen}: ${kb(statSync(out).size)} (${kb(gzipSync(readFileSync(out)).length)} gzip)`,
  );
}
