# @daily-battle/sim-bridge

The headless battle harness (M2). It is the only package that drives `@pkmn/sim`'s `Battle`. Policies (the opponent AI, test bots, and later the player's UI) only ever see a `SideView` of their own side.

```ts
import { RandomPolicy, randomTeam, makeRng, runBattle } from '@daily-battle/sim-bridge';

const rng = makeRng('1,2,3,4');
const result = runBattle({
  seed: '5,6,7,8', // battle rng: damage rolls, crits, accuracy
  p1: { team: randomTeam(rng), policy: new RandomPolicy(), seed: '9,10,11,12' },
  p2: { team: randomTeam(rng), policy: new RandomPolicy(), seed: '13,14,15,16' },
});
// { winner: 'p1' | 'p2' | null, turns, endReason: 'win' | 'tie' | 'turnCap', choices, spectatorLog }
```

## How it works

- **Driver:** `runBattle` drives a `Battle` synchronously through its `send` callback. Sim output is split with `extractChannelMessages` into the p1, p2, and spectator channels, exactly as Showdown splits `|split|` lines. That makes it deterministic and lets it run unchanged in a Web Worker (M7).
- **Views:** each side gets its own [`@pkmn/client`](https://www.npmjs.com/package/@pkmn/client) `Battle`, fed only that side's channel plus its own request. It's built with `@pkmn/sim`'s `Dex`, so no second copy of the dex data is needed.
- **Choosing:** when a side has a request, its policy gets `SideView { side, request, battle, log }` and an `rng: () => number` seeded per side. It returns a choice string (`move 2`, `switch 4`).
- **Errors:** an invalid choice throws `BattleError`, carrying the seed, turn, side, and choice. Battles that reach `maxTurns` (default 300) end in a tie with `endReason: 'turnCap'`.
- **Replay:** `replayBattle(input, result.choices)` replays a battle from its seed, teams, and recorded choices, reproducing the same log. This is the basis of mid-battle resume (DESIGN.md §7).

## Hidden information

DESIGN.md §7 requires that policy code can't see the opponent's hidden info. Three things enforce that:

1. **Structure:** a `SideView` is built only from the side's own channel and request. The opponent's request and the sim's `sides` are never passed in.
2. **Lint:** ESLint bans runtime imports of `@pkmn/sim` and of the battle driver in `packages/ai/**` and `src/policies/**`. Type imports are allowed.
3. **Test:** `src/hidden-info.test.ts` flattens every view a policy receives across 20 random battles (both sides) into name tokens.
   - It fails if any species, move, or item on the opponent's team appears before that side's own log revealed it.
   - A negative control proves the checker catches a leak.
   - A positive check proves revealed opponent info does show up, so the scan isn't vacuous.

## Soak run

```sh
pnpm --filter @daily-battle/sim-bridge soak [--n 1000] [--seed soak] [--only INDEX]
```

The soak run plays `RandomPolicy` against `RandomPolicy` on random legal teams drawn from `@daily-battle/data`. Battle `i` depends only on the seed and `i`, so `--only i` reruns a failure exactly. CI runs 1,000 battles. Vitest runs 100.

Last local run (2026-10-21): 1,000 battles, 0 errors. p1 won 504, p2 won 488, with 7 ties and 1 turn cap. Turns averaged 61.5. It took 40.7s, about 25 battles/s.

## Spike findings (M0, `@pkmn/sim` 0.10.11)

- **`gen4ou` is bundled.** `Dex.formats.get('gen4ou')` exists with `mod: 'gen4'`, so there's no need to load Showdown's `formats.ts` or vendor the full repo.
- **Ruleset:** `Standard`, `Evasion Abilities Clause`, `Baton Pass Stat Trap Clause`, `Freeze Clause Mod`, `Sleep Moves Clause`, `!Sleep Clause Mod`. Banlist: `AG`, `Uber`, `Arena Trap`, `Quick Claw`, `Soul Dew`, `Swagger`.
  - Gen 4 OU uses **Sleep Moves Clause** (sleep-inducing moves are banned outright) instead of the classic Sleep Clause Mod.
- **Garchomp is Uber in current gen4ou**, so DESIGN.md's share examples no longer match the format.
- **The sim does not validate teams** passed to `setPlayer`. Generated and player teams must go through `TeamValidator.get('gen4ou').validateTeam` explicitly. `randomTeam` does this.
- **Gen 5 OU** (`gen5ou`, same sim version) adds Team Preview: before turn 1 each side gets a `team` request, answered with `team N…` (`leadChoice`), and the client lists all six foe species from the `|poke|` lines with HP `0/0` until each is sent out. `legalChoices` lists one lead per Pokémon. `soak --format gen5ou` runs Gen 5 battles.
