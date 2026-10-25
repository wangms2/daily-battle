# Pokémon Daily

A daily Pokémon battle game on Gen 4 OU and Gen 5 OU, two daily games with their own teams and streaks. Build a team each week, then face a new generated opponent every day. The daily games are fully client-side, built on [`@pkmn/sim`](https://github.com/pkmn/ps). Versus rooms with friends (in progress) run on a small Cloudflare Worker; for those locally, run `pnpm --filter server dev` beside the web dev server, which sends `/api` to it.

See [DESIGN.md](DESIGN.md) for the full design and milestone plan.

## Setup

Requires Node 24 (see `.nvmrc`) and pnpm (via corepack).

```sh
corepack enable
pnpm install
```

## Scripts

| Command                    | What it does                               |
| -------------------------- | ------------------------------------------ |
| `pnpm test`                | Run all Vitest suites across the workspace |
| `pnpm lint`                | ESLint over the whole repo                 |
| `pnpm typecheck`           | `tsc --noEmit` in every package            |
| `pnpm format`              | Prettier write (`format:check` in CI)      |
| `pnpm --filter web dev`    | Start the web client dev server            |
| `pnpm --filter web build`  | Production build of the web client         |
| `pnpm --filter server dev` | Run the versus room server on :8787        |

## Layout

```
packages/
  data/        set snapshot scripts + JSON            (M1)
  gen/         seeded generation + constraints        (M3)
  ai/          belief model, scoring, policies        (M4)
  sim-bridge/  wrapper around @pkmn/sim, SideView     (M2)
  pipeline/    offline validation, schedule emitter   (M5)
  versus/      versus room rules and messages         (§18)
apps/
  web/         React + Vite client                    (M6+)
  server/      Worker + Durable Object for rooms      (§18)
```

Packages export their TypeScript source directly, and Vite and Vitest consume it without a separate build step.

## Legal

Unofficial fan project, free and non-commercial. Not affiliated with or endorsed by Nintendo, Creatures Inc., GAME FREAK inc., The Pokémon Company, or Smogon. Pokémon, Pokémon character names, and sprites are © Nintendo, Creatures Inc., and GAME FREAK inc.

Source code is MIT licensed (see [LICENSE](LICENSE)). `@pkmn/*` packages and Pokémon Showdown code are MIT licensed by their authors. Set and usage data come from Smogon and are used with Smogon's permission (see [packages/data/README.md](packages/data/README.md)).
