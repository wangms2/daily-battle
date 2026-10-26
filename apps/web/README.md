# web

The Pokémon Daily client: React, Vite, and Tailwind CSS v4, with Radix UI for sheets and dialogs. It covers the weekly team builder, the daily brief, settings, saved state (M6), and the battle screen (M7).

```sh
pnpm --filter web dev        # dev server
pnpm --filter web build      # production build
pnpm test                    # unit tests (from the repo root)
pnpm --filter web e2e        # Playwright on the production build: flow and battles at six sizes, light and dark
pnpm --filter web sprites    # (re)download sprites for every species in the set data
pnpm --filter web fx         # (re)download the battle backgrounds and effects
pnpm --filter web audio      # (re)download and convert the Pokémon cries
```

## Design

The full spec is in DESIGN.md §12 and the M6 and M7 plans.

- **Layout:**
  - Mobile-first, and **no screen scrolls**, down to 360×640 portrait.
  - Each screen is a fixed-height layout where the grids shrink to fit.
  - Sheets are sized to their content.
  - From 900px wide, the builder and brief switch to side-by-side panels.
- **Look:** modern and crisp: 8px corners, 1px borders, near-flat shadows, IBM Plex Sans. Every color, radius, and shadow is a token in `src/styles.css`. The palette uses muted colors from the Sinnoh legendaries:
  - Dialga's steel blue for actions and selection.
  - Palkia's pearl and mauve for soft highlights.
  - Giratina's gold for the lead and streak, and its crimson for destructive actions.
  - Light and dark themes follow the system setting.
- **Flow:**
  - The app opens straight to today's task: the builder if there's no team this week, otherwise the daily brief.
  - A welcome sheet appears once, on first run.
  - Stats and Settings open as sheets from the top bar.
- **Beginner hints:** the team checklist ("4/5 · Missing …"), its weaknesses sheet, and the brief's tip line only appear with hints on. In battle, hints add type-effectiveness labels on move buttons, a Speed range in the foe's sheet, and one-time explainers for mechanics like Stealth Rock or sandstorm.

## Battle

- **Engine:** the simulator and the opponent AI run in a Web Worker (`src/battle/battle.worker.ts`), warmed up when the daily brief opens. The worker turns each turn into frames: Showdown battle text from `@pkmn/view`, an animation event, and a snapshot of what your side can see. Hidden opponent info never reaches the UI.
- **Field:** Showdown-style, on a background picked per day (Gen 4 or Gen 5 scenery, by game). Each Pokémon has a floating name, HP bar, and the foe's bar also carries six team marks (icons once revealed, Poké Balls until then; fainted ones grey out). Your own team is on the bench row. Hazards are drawn on the ground, screens show as tinted glass, and weather drifts over the scene. Damage, status, and boosts float up as labels, and ability or item reveals pop up as banners. Everything is placed in the background image's coordinates, scaled by one CSS factor (`--s`), so sprites stay on their platforms at any size. On phones the field keeps the scene's shape and the log takes the spare height.
- **Screen:** the field, then the log (newest at the bottom; ⤢ opens it full-screen), then a "What will X do?" prompt, type-tinted move buttons, and the bench. A forced switch replaces the controls with "Who comes in?". From 900px wide, the log becomes a side panel.
- **Playback:** Slow, Normal (default), or Fast, from the top bar. Tap the field or log, or press Space, Enter, or Escape, to skip to the end of the turn. When only one choice is legal, it's sent for you.
- **Details:** tap a Pokémon's name and HP bar (hover on desktop) for a small card with the essentials: for foes, only what's been revealed. Long-press a move for its details. On a touch screen, tapping a benched Pokémon opens its details with a Switch button; with a mouse, hover shows them and a click switches. A run after the day is decided is labelled and shared as practice, never as a try.
- **Resume:** each attempt saves its seeds, team, and your choices as you go, so a reload replays them back to the same turn. An unfinished attempt from a past day, or from an older engine version, counts as a forfeit. Today's change is locked while a battle is in progress.
- **Difficulty:** Easy, Normal (default), or Hard, picked per game on the daily brief (`src/ui/Difficulty.tsx`, `src/lib/difficulty.ts`). Each has its own tries and streak; Home and the share header name Easy and Hard. Hard's engine is a WebAssembly module per generation (`src/battle/hardEngine.ts`), fetched by the worker only for Hard, and Hard's choices are saved so a resume doesn't search again. Building it needs Rust (see `packages/engine-wasm`); without it, the build simply has no Hard. DESIGN.md §4.5–4.6.
- **Licensing:** the Showdown client is AGPL-3.0, so none of its code is used. The layout, rendering, and animations here are our own.

## Code map

| Path               | What it is                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `src/App.tsx`      | Picks the screen for today; owns the top-bar sheets                                            |
| `src/screens/`     | `TeamBuilder`, `DailyBrief`, `Battle` (and `BattleRoute`, which wires it to saved state)       |
| `src/battle/`      | Battle engine, worker, worker client, frame types; `ui/` holds the field, controls, and sheets |
| `src/sheets/`      | Set picker, Pokémon info, welcome, stats, settings, team checklist, confirm                    |
| `src/ui/`          | Pokémon tile, sheet, top bar, buttons, switch, icons                                           |
| `src/state/`       | `state` v2 schema, reducer, localStorage with in-memory fallback, store context, clock         |
| `src/lib/`         | Set and species helpers, type matchups, sprites, fx, schedule loading, results and share       |
| `public/schedule/` | Published weekly schedules from `@daily-battle/pipeline`                                       |
| `public/sprites/`  | Self-hosted animated front and back sprites and box icons                                      |
| `e2e/`             | Playwright flow and battle tests, and an opt-in screenshot set (`LOOK=1`, `look.spec.ts`)      |

## State and rules

- **Weekly team:** locked once a week (6 Pokémon, any of each species' sets).
- **Daily change:** one per local day, either swapping in a benched pool Pokémon or changing a set. The change sticks for the rest of the week, and the day records it (the share marks a swapped-in species with `*`).
- **Lead:** chosen freely each day.
- **Practice runs:** once today's counted tries are done, the daily change gives way to a practice change per run (`day.practiceChange`, cleared when a run starts). It never touches the weekly team, unless that run is won: then it carries over.
- **Streak:** consecutive days won within 3 tries. The 3rd loss (giving up counts) or a missed day breaks it; later tries are practice. A first-try win gets a ⭐. Streaks and stats are derived from the saved attempts in `src/lib/results.ts`, not stored (state v2 dropped the old `stats` block).
- **Results and sharing:** the end card shows today's tries as rows, the streak, and Share; the daily brief shows a summary strip once you've played. `src/lib/share.ts` builds the share text (DESIGN.md §11) and sends it with the Web Share API, the clipboard, or a sheet to copy from.
- **Storage:** if storage is blocked, the app keeps working in memory and shows a notice.
- **Schedule:** if a week's schedule file is missing, the client generates the same content in the browser and logs a warning.

## Sprites

The sprites are Showdown-style animated GIFs and Gen 7 box icons from [PokeAPI/sprites](https://github.com/PokeAPI/sprites), downloaded by `scripts/sprites.ts` for exactly the species in the set data and committed here (plus the With friends crowd on the home screen, `src/lib/friends.ts`). Nothing is hotlinked. Pokémon and sprites © Nintendo, Creatures Inc., GAME FREAK inc. The animated sprites are by the Smogon sprite community. Pokémon Daily is an unofficial, free fan project.

Sound (off by default) lives in `public/audio/`: `cries/legacy/` and `cries/latest/` from [PokeAPI/cries](https://github.com/PokeAPI/cries), converted to MP3 by `scripts/audio.ts`, and one battle track per generation in `music/` (supplied files, prepared as in DESIGN.md §21). `src/lib/audio.ts` plays them. Pokémon music and cries © Nintendo, Creatures Inc., GAME FREAK inc.

The battle backgrounds (Gen 4 and Gen 5), hazard sprites, weather overlays, and Poké Ball mark come from Pokémon Showdown's `fx/` folder, which Showdown dedicates to the public domain (CC0). `scripts/fx.ts` downloads them from a pinned commit into `public/fx/`.

## Deploy (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick `daily-battle`.
2. Build command `bash scripts/cf-build.sh` (installs pnpm via npm with retries; the builder's own pnpm download times out), deploy command `npx wrangler deploy` (config in `wrangler.jsonc`).
3. Build variables: `SKIP_DEPENDENCY_INSTALL=1`, `NODE_VERSION=24`, and `VITE_SITE_URL=https://<your production URL>` (for link previews; previews fall back to their own URL).
4. Every push to `main` deploys; branches get preview URLs. `public/_headers` sets caching and a self-only CSP (covered by `e2e/deploy.spec.ts`).

New weeks: `pnpm --filter @daily-battle/pipeline schedule --from <monday> --weeks <n>` (existing weeks are skipped). Schedules are published through the week of 2027-03-29; generate the next batch by about **March 1, 2027** so there are always a few weeks of headroom. Each week takes ~20–35 minutes on a 20-thread PC, too slow for GitHub's 2-core private runners, so run it locally, then commit `apps/web/public/schedule/` and `packages/pipeline/reports/` and push (CI deploys). If a week is ever missing, the client builds it in the browser, but without the pipeline's difficulty checks. Playtest reports: testers use Settings → Copy playtest report; compare with `pnpm --filter @daily-battle/pipeline calibrate <files…>`.
