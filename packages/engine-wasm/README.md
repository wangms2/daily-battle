# @daily-battle/engine-wasm

[poke-engine](https://github.com/pmariglia/poke-engine) (MIT, by pmariglia) compiled to WebAssembly: one small module per generation, used by the Hard AI (DESIGN.md §4.6).

## Build

Needs Rust stable with the WebAssembly target:

```sh
rustup target add wasm32-unknown-unknown
pnpm --filter @daily-battle/engine-wasm build:wasm        # every gen in ENGINE_GENS
pnpm --filter @daily-battle/engine-wasm build:wasm 3 4    # just some
```

This writes `dist/gen3.wasm` … `dist/gen6.wasm` (0.65–0.73 MB each, 170–195 KB gzipped). `dist/` and `rust/target/` are not committed: CI builds them once in its `wasm` job and passes them to the other jobs. Without them, the web build has no Hard, and the Hard tests skip.

## Pieces

- `rust/`: a `cdylib` crate around poke-engine, pinned to a commit of our fork [`wangms2/poke-engine`](https://github.com/wangms2/poke-engine). The fork adds `perform_mcts_seeded`: MCTS with a fixed iteration count and a seeded rng, and no clock, so a search is reproducible. The crate exposes a raw ABI (`alloc`, `search`, `options`, `check`, `roundtrip`, `damage`, with results read back through `out_ptr`/`out_len`) over strings, with no wasm-bindgen.
- `src/index.ts`: `Engine`, which wraps a compiled `WebAssembly.Module`. `search(state, iterations, seed)` returns each side's options with visits and values, and `unknown(names)` (over the module's `check`) lists the names the engine doesn't know.
- `src/node.ts`: `loadEngine(gen)` and `engineBuilt(gen)` for Node (tests, eval, pipeline).
- `src/version.ts`: `ENGINE_GENS`, `WASM_VERSION` (bump when the module could choose differently for the same input; it's in Hard's engine string), `hasEngine`, `engineFile`. It has no runtime dependencies, so the web app's main bundle and the versus package can import it.

## Adding a generation

1. Add its feature in `rust/Cargo.toml` (poke-engine has gens 1–9) and its number in `ENGINE_GENS`.
2. Make sure `packages/ai/src/hard/translate.ts` covers the gen's mechanics, then run the coverage test in `hard.test.ts`. It checks that the engine knows every species, move, and ability in the gen's sets.
3. Run `pnpm --filter @daily-battle/ai eval --format <format> --hard` to check its strength.
