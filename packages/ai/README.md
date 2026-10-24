# @daily-battle/ai

The opponent AI (DESIGN.md §8) and the comparison bots used for evaluation (§9.1). It plays like an average ladder player: it reasons about what it has seen, usually makes sound choices, and sometimes doesn't.

```ts
import { aiForStyle } from '@daily-battle/ai';

const ai = aiForStyle(opponent.style); // a sim-bridge Policy; plug into runBattle
```

## How it chooses

Each decision:

1. **State** (`state.ts`): the AI's own team, with full info from its own request. Its own natures and EVs come from the set data, since all teams in this game do. It also reads what it has seen of the foe: species, HP %, status, boosts, and revealed moves, item, and ability. Plus weather, hazards, and screens on both sides.
2. **Belief** (`belief.ts`, §8.2): for each foe Pokémon it has seen:
   - It starts from that species' usage-weighted sets.
   - It drops sets that contradict anything revealed and renormalizes.
   - It never models foes it hasn't seen. In Gen 4 that's the ones not yet sent out; in Gen 5, Team Preview shows all six species from the start (with no HP reading, so they count as healthy), but never their sets.
   - In informed mode (`knownSets`, for M5's retry simulations), belief collapses to the real sets.
3. **Scoring** (`score.ts`, §8.3): every legal action gets a utility in "fraction of a Pokémon's HP" units. Damage numbers come from `@smogon/calc` in the format's generation, averaged over the top candidate sets.
   - **Attacks:** expected damage plus KO chance, both weighted by the chance of landing the hit (moving first, or surviving to move), minus the damage expected in return.
   - **Status moves:**
     - Hazards: only when not already up, worth more early and when more foes remain.
     - Setup: when it's safe.
     - Status: on a healthy target that isn't already statused and isn't immune. Will-O-Wisp is worth more against physical attackers.
     - Recovery: scales with missing HP.
     - Rapid Spin: when our side has hazards.
     - Roar/Whirlwind: against boosts or into hazards.
     - Self-KO moves: carry a cost.
     - Against Magic Bounce (Gen 5), hazards and status moves count against us in proportion to the chance the foe has it.
   - **Switches:** the matchup gain over staying in, minus the free hit and entry hazards, minus a fixed switching cost, plus a small bonus for resisting the foe's STABs, plus Regenerator's heal on the way out (Gen 5). After a faint, the switch-in with the best matchup.
   - **Mega Evolution** (Gen 6): `move N mega` scores the move from Mega form, at its old Speed (in Gen 6 the turn order uses the pre-Mega Speed), plus the preset's `mega` bonus for keeping the boost all battle. Damage uses the Mega form once it has Mega Evolved, or while a stone holder is assumed able to. A revealed Mega narrows that foe's sets to the stone; once a foe has Mega Evolved, no other foe is assumed to. Pokémon are tracked by base species.
   - **Gen 6 mechanics:** Sticky Web, Defog clearing both sides, terrains, 5-turn ability weather, Sleep Clause, powder immunity for Grass, paralysis immunity for Electric, Gale Wings and Prankster priority. Fairy and Assault Vest come from the calc.
   - **Gen 3 mechanics:** sleep moves are scored under Sleep Clause, as in Gen 6 but without powder immunity, and Electric types can be paralyzed. Type-based physical and special, Explosion halving Defense, and Gen 3 items come from the calc. `eval --format gen3ou` reports the skill gaps.
   - **Team Preview** (Gen 5): `scoreLeads` rates each of ours as the lead by its average matchup against the foe's six, plus half a hazard's early value for a setter; the lead is then sampled with the usual softmax noise. The naive bot leads with its first Pokémon.
4. **Choice** (`choose.ts`, §8.4): softmax over scores at the preset's temperature, sampled with the seeded `rng`. Soft biases:
   - A bonus for the highest-damage move.
   - Occasionally aiming at the foe's likely switch-in when it's threatened. This is often a wrong read, on purpose.

**Determinism:** all randomness comes from the `rng` passed to `choose`, so a battle replays exactly from its seeds (§7). Lint bans `Math.random` and runtime `@pkmn/sim` imports here.

## Presets (`presets.ts`, §8.5)

`balance`, `offense`, and `stall` are picked from the daily opponent's style:

- `offense` values damage and setup more, and switches less.
- `stall` values hazards, status, and recovery more, and switches more freely.
- All three are hand-tuned in v1. M9 retunes them from playtests.

Comparison bots (`bots.ts`):

- **random:** sim-bridge's `RandomPolicy`.
- **naive:** always uses its strongest attack and never switches unless forced.
- **mid:** the balance preset.
- **strong:** the same features with low noise and no biases or guessing.

## Evaluation

```sh
pnpm --filter @daily-battle/ai eval [--n 200] [--assert] [--debug]
```

**Matchups:** each one pairs a team drawn from a weekly pool (6 of 12, sets by weight) with that week's generated opponent. It's played twice with the policies swapped between teams, so team strength cancels out.

**`--assert` requires:** mid vs naive ≥ 60%, mid vs random ≥ 90%, strong vs mid ≥ 50%. CI runs `--n 100 --assert`.

Last run (2026-10-21, `--n 200`, 81s):

| Pairing         | Win rate | Record    |
| --------------- | -------- | --------- |
| mid vs random   | 97.9%    | 391-8-1   |
| mid vs naive    | 68.9%    | 273-122-5 |
| strong vs mid   | 52.0%    | 207-191-2 |
| naive vs random | 98.3%    | 393-7-0   |

Mid AI behavior against naive:

- **Switching:** 11.9% of move decisions.
- **Strongest move:** chosen 64.4% of the time.
- **Hazards:** set in 37% of battles, first on turn 6.5 on average.
- **Speed:** 0.9 ms per decision.

**Known limits (v1):**

- **The strong bot is only modestly stronger than mid.** It scores 52–58% depending on seeds, because it uses the same one-turn scoring with less noise. A clearly stronger bot needs lookahead, which §9.1 allows and M5's skill checks will need.
- **Battles against naive are short** (about 17 turns), because both sides attack hard.
- **Ladder targets aren't tuned yet.** Switch rate, max-damage rate, and first-hazard turn are logged so M9 can tune against real play.

## Tests

- **Behavior** (`behavior.test.ts`, real battles, near-greedy settings): the AI takes an available KO, prefers a super-effective attack over a resisted one, sets Stealth Rock on turn 1 when safe, switches out of a hopeless matchup to an immunity, and recovers when low against a passive foe.
- **Hidden info** (`hidden-info.test.ts`): across 20 battles, the foe's team is swapped for the same species with different, still-hidden sets. The AI's choices must stay identical until its own log shows a difference.
- **Units:** belief filtering and fallback, calc wrapper (OHKO, immunity, HP cap), softmax and sampling, determinism.
