# web

The Daily Battle client: React, Vite, and Tailwind CSS v4, with Radix UI for sheets and dialogs. M6 covers the weekly team builder, the daily brief, settings, and saved state. The battle screen comes in M7.

```sh
pnpm --filter web dev        # dev server
pnpm --filter web build      # production build
pnpm test                    # unit tests (from the repo root)
pnpm --filter web e2e        # Playwright: full flow at six screen sizes, light and dark
pnpm --filter web sprites    # (re)download sprites for every species in the set data
```

## Design

The full spec is in DESIGN.md §12 and the M6 plan.

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
- **Beginner hints:** the team checklist ("4/5 · Missing …"), its weaknesses sheet, and the brief's tip line only appear with hints on. M7 adds type-effectiveness labels on move buttons.

## Code map

| Path               | What it is                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `src/App.tsx`      | Picks the screen for today; owns the top-bar sheets                                           |
| `src/screens/`     | `TeamBuilder`, `DailyBrief`                                                                   |
| `src/sheets/`      | Set picker, Pokémon info, welcome, stats, settings, team checklist, confirm                   |
| `src/ui/`          | Pokémon tile, sheet, top bar, buttons, switch, icons                                          |
| `src/state/`       | `state.v1` schema, reducer, localStorage with in-memory fallback, store context, clock        |
| `src/lib/`         | Set and species helpers, type matchups, sprites (`getSprite`), schedule loading               |
| `public/schedule/` | Published weekly schedules from `@daily-battle/pipeline`                                      |
| `public/sprites/`  | Self-hosted animated front and back sprites and box icons                                     |
| `e2e/`             | Playwright flow test (`flow.spec.ts`) and an opt-in screenshot set (`LOOK=1`, `look.spec.ts`) |

## State and rules

- **Weekly team:** locked once a week (6 Pokémon, any of each species' sets).
- **Daily change:** one per local day, either swapping in a benched pool Pokémon or changing a set. The change sticks for the rest of the week, and the day records it (for the share asterisk in M8).
- **Lead:** chosen freely each day.
- **Storage:** if storage is blocked, the app keeps working in memory and shows a notice.
- **Schedule:** if a week's schedule file is missing, the client generates the same content in the browser and logs a warning.

## Sprites

The sprites are Showdown-style animated GIFs and Gen 7 box icons from [PokeAPI/sprites](https://github.com/PokeAPI/sprites), downloaded by `scripts/sprites.ts` for exactly the species in the set data and committed here. Nothing is hotlinked. Pokémon and sprites © Nintendo, Creatures Inc., GAME FREAK inc. The animated sprites are by the Smogon sprite community. Daily Battle is an unofficial, free fan project.
