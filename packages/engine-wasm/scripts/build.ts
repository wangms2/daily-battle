// Builds two WebAssembly modules per generation into dist/: genN.wasm (plain)
// and genN-simd.wasm (WASM SIMD, ~3× faster for the Master network; browsers
// without SIMD use the plain one). Both give the same results.
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

const gens = process.argv.slice(2).map(Number);
mkdirSync(dist, { recursive: true });

for (const gen of gens.length ? gens : ENGINE_GENS) {
  for (const simd of [false, true]) {
    // Separate target dirs, so switching RUSTFLAGS doesn't rebuild everything each time.
    const target = `${crate}/target${simd ? '-simd' : ''}`;
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
        '--target-dir',
        target,
        // Arrays merge with .cargo/config.toml's rustflags (RUSTFLAGS would replace them).
        ...(simd
          ? ['--config', `target.wasm32-unknown-unknown.rustflags=["-C","target-feature=+simd128"]`]
          : []),
      ],
      { cwd: crate, stdio: 'inherit' },
    );
    const out = `${dist}/${engineFile(gen, simd)}`;
    copyFileSync(`${target}/wasm32-unknown-unknown/release/daily_battle_engine.wasm`, out);
    const kb = (n: number) => `${(n / 1024).toFixed(0)} KiB`;
    console.log(
      `${engineFile(gen, simd)}: ${kb(statSync(out).size)} (${kb(gzipSync(readFileSync(out)).length)} gzip)`,
    );
  }
}
