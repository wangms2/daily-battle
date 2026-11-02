# Gen 3 OU — proposed set changes

These come after the build fix (whole-set move picking, which prefers the analysis's first choice and the moves Random Battles use). That fix alone changed:

- **Jolteon:** now Thunderbolt / **HP Ice** / Baton Pass / Roar. Its padding Substitute set merged into this one because they do the same job.
- **Others:** a handful of other Hidden Power and slot picks.

The proposals below are for what's left. Approve all of them, or name the ones to skip.

## Drop: hand-added padding (the species keeps its real sets)

| Species    | Set dropped                          | Keeps                                          |
| ---------- | ------------------------------------ | ---------------------------------------------- |
| Claydol    | Spinner (physically defensive)       | Spinner (offensive)                            |
| Forretress | Spikes setter (physically defensive) | Spikes setter                                  |
| Magneton   | Substitute attacker                  | Steel trapper                                  |
| Registeel  | RestTalk                             | Special wall                                   |
| Charizard  | Sun attacker                         | SubPunch attacker (+ Bellyzard as its fun set) |
| Moltres    | Substitute + Toxic                   | Fast attacker                                  |
| Cloyster   | Spikes setter (offensive)            | Spikes setter (spinner)                        |
| Milotic    | Special wall (Mirror Coat)           | Physical wall                                  |
| Regice     | RestTalk                             | Mixed attacker                                 |
| Smeargle   | Spikes setter (Leftovers)            | Spikes setter (Salac Berry)                    |
| Kingdra    | RestTalk                             | Rain sweeper                                   |
| Porygon2   | Special wall                         | Physical wall                                  |
| Articuno   | Substitute attacker (one attack)     | RestTalk Heal Bell                             |
| Slaking    | Slack Off attacker                   | Choice Band attacker                           |
| Sableye    | Toxic stall                          | Physical wall                                  |
| Golduck    | Mixed attacker                       | Calm Mind sweeper                              |
| Tauros     | Substitute attacker                  | Choice Band attacker                           |
| Blastoise  | RestTalk                             | Spinner                                        |

## Drop: weak or redundant analysis sets

| Species   | Set                                                              | Why                                                                                         |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Salamence | Fast attacker (Rock Slide / Brick Break / HP Grass / Fire Blast) | No Dragon or Flying move, and the Dragon Dance and Choice Band sets already cover its roles |
| Suicune   | Calm Mind sweeper (Defensive)                                    | A fourth Calm Mind set, nearly the same as RestTalk                                         |
| Medicham  | Fast attacker (Leftovers)                                        | Choice Band without the Band; the Choice Band set does it better                            |
| Blaziken  | Mixed attacker (Leftovers), 5%                                   | A weaker copy of its Salac Berry mixed set                                                  |
| Dusclops  | Calm Mind sweeper, 5%                                            | Ice Beam is its only attack                                                                 |
| Alakazam  | Trick attacker (special)                                         | Choice Band with Calm Mind: the Band does nothing for its special attacks                   |

## Fix moves

| Species   | Set                  | Change                                                                          | Why                                                                      |
| --------- | -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Flygon    | Choice Band attacker | Toxic → an attack (Quick Attack or Double-Edge, whichever the validator allows) | Toxic is a wasted slot when locked by Choice Band                        |
| Heracross | Choice Band attacker | Focus Punch → Hidden Power Ghost                                                | Focus Punch is poor under Choice Band; the analysis lists HP Ghost first |
| Linoone   | Choice Band attacker | Flail → Trick                                                                   | Flail does little at full HP; Trick passes the Band to a wall            |
| Slowbro   | Curse sweeper        | Ice Beam → Rest                                                                 | It had no recovery; the analysis lists Rest first                        |

## Relabel: setup sets that don't sweep

| Species   | Set                                              | New label                 |
| --------- | ------------------------------------------------ | ------------------------- |
| Suicune   | Calm Mind (RestTalk)                             | Calm Mind tank (RestTalk) |
| Celebi    | Calm Mind (bulky)                                | Calm Mind tank            |
| Miltank   | Curse sweeper                                    | Curse tank                |
| Jynx      | Calm Mind sweeper                                | Substitute + Lovely Kiss  |
| Gardevoir | Calm Mind (Substitute)                           | Substitute + Hypnosis     |
| Vaporeon  | Substitute attacker                              | Wish passer               |
| Swampert  | Physical wall (Roar) — no Roar after the rebuild | Physical wall (Toxic)     |

## Move to the fun pool (off the standard list)

| Species    | Set                                        | Why                          |
| ---------- | ------------------------------------------ | ---------------------------- |
| Misdreavus | Imprison support                           | A gimmick; good as a fun set |
| Scizor     | Agility + Endure + Reversal (Liechi Berry) | Same: real but gimmicky      |

## Add from Random Battles: standard (optional)

These are real, distinct roles from the random battle sets that the analyses don't cover. Usage still weights them against the species' other sets. All pass the Gen 3 validator.

| Species  | New set        | Moves · item · nature                                            |
| -------- | -------------- | ---------------------------------------------------------------- |
| Breloom  | SubPunch Spore | Spore / Substitute / Focus Punch / HP Rock · Leftovers · Adamant |
| Blissey  | Wish support   | Wish / Protect / Seismic Toss / Toxic · Leftovers · Bold         |
| Skarmory | Staller        | Spikes / Toxic / Protect / Whirlwind · Leftovers · Impish        |

## Fun pool, Gen 3 (one per species, players only, no marker)

Inspired by the random battle sets, plus the two gimmicks moved off the standard list. All 15 pass the Gen 3 validator.

| Species    | Fun set                      | Moves · item · nature                                                       |
| ---------- | ---------------------------- | --------------------------------------------------------------------------- |
| Charizard  | Bellyzard                    | Belly Drum / Substitute / Earthquake / HP Flying · Salac Berry · Adamant    |
| Heracross  | Endure Reversal              | Endure / Reversal / Megahorn / Rock Slide · Salac Berry · Jolly             |
| Blaziken   | Swords Dance Reversal        | Swords Dance / Endure / Reversal / Fire Blast · Salac Berry · Hasty         |
| Snorlax    | Belly Drum                   | Belly Drum / Return / Shadow Ball / Earthquake · Leftovers · Adamant        |
| Smeargle   | Belly Drum + Extreme Speed   | Spore / Belly Drum / Extreme Speed / Substitute · Salac Berry · Jolly       |
| Swampert   | Curse                        | Curse / Earthquake / Rock Slide / Rest · Leftovers · Adamant                |
| Tyranitar  | Special attacker             | Crunch / Fire Blast / Thunderbolt / Ice Beam · Leftovers · Modest           |
| Lapras     | Dragon Dance                 | Dragon Dance / Return / Ice Beam / Rest · Leftovers · Adamant               |
| Marowak    | Belly Drum                   | Belly Drum / Earthquake / Rock Slide / Double-Edge · Thick Club · Adamant   |
| Gyarados   | Taunt + Dragon Dance         | Dragon Dance / Taunt / HP Flying / Earthquake · Leftovers · Adamant         |
| Gengar     | Hypnosis + Destiny Bond lead | Hypnosis / Destiny Bond / Thunderbolt / Ice Punch · Leftovers · Timid       |
| Electrode  | Screen lead                  | Taunt / Light Screen / Explosion / Thunderbolt · Leftovers · Timid (Static) |
| Kingdra    | Dragon Dance                 | Dragon Dance / Hydro Pump / Ice Beam / HP Flying · Leftovers · Naive        |
| Scizor     | Agility Reversal             | Agility / Endure / Reversal / HP Ghost · Liechi Berry (from its analysis)   |
| Misdreavus | Imprison                     | from its analysis                                                           |

Left out:

- **Dragonite with Extreme Speed:** not legal in Gen 3.
- **Belly Drum Hariyama:** legal, but four fun sets already use Belly Drum.

## Keep: flags that are actually fine

- **Gengar, Blissey, Jirachi, Registeel, Porygon2, Misdreavus, Dragonite SubPunch: "no STAB".** In Gen 3, a move's category comes from its type. Ghost and Steel are physical and Dragon is special, so these special or support sets rightly skip their own type. I'll teach the audit this so they stop showing up.
- **Tyranitar, Starmie, Raikou, Exeggutor, Steelix, Rhydon, Medicham Bulk Up, Alakazam Encore, Vaporeon wall: "took X over the first choice".** Each pick is a reasonable alternative, such as Ice Beam over Thunder Wave on defensive Starmie.
- **Aerodactyl Taunt lead, Dugtrio Salac Berry, Breloom Swords Dance, Houndoom special.** These were hand-added, but each is a real, distinct set, so keep them.

## Result

- 76 species, about 165 standard sets (down from 196).
- About 25 species go down to a single set (most of them low-usage).
