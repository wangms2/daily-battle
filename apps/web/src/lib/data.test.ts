import { describe, expect, it } from 'vitest';
import {
  addCore,
  canMega,
  coresIn,
  joinNames,
  pairings,
  megaFor,
  ouSpecies,
  randomTeam,
  setActiveFormat,
  setOfferKey,
  likelyMoves,
  abilityInfo,
  defenseGaps,
  findSet,
  itemInfo,
  offenseGaps,
  playerSetsOf,
  possibleSets,
  sameSpecies,
  setsOf,
  topSet,
} from './data';

// Gen 4 OU, the default active format.
const labels = (species: string, revealed?: Parameters<typeof possibleSets>[1]) =>
  possibleSets(species, revealed).map((s) => s.label);

describe('likelyMoves', () => {
  const sets = [
    { moves: ['Rock Slide', 'Earthquake', 'Dragon Dance', 'Hidden Power Bug'], weight: 0.6 },
    { moves: ['Rock Slide', 'Earthquake', 'Focus Punch', 'Crunch'], weight: 0.3 },
    { moves: ['Pursuit', 'Crunch', 'Fire Blast', 'Brick Break'], weight: 0.1 },
  ];
  it('lists the moves not shown yet, most common across the sets first', () => {
    expect(likelyMoves(sets, ['Rock Slide'])).toEqual([
      'Earthquake',
      'Dragon Dance',
      'Hidden Power Bug',
      'Crunch',
    ]);
  });
  it('counts a shown Hidden Power of any type as shown', () => {
    expect(likelyMoves(sets, ['Rock Slide', 'Earthquake', 'Hidden Power'])).not.toContain(
      'Hidden Power Bug',
    );
  });
});

describe('fun sets', () => {
  it("come last in a player's choices, never in the standard sets or a foe's", () => {
    const fun = playerSetsOf('Snorlax').at(-1)!;
    expect(fun.id).toMatch(/-fun-/);
    expect(playerSetsOf('Snorlax').slice(0, -1)).toEqual(setsOf('Snorlax'));
    expect(setsOf('Snorlax')).not.toContainEqual(fun);
    expect(possibleSets('Snorlax')).not.toContainEqual(fun);
  });

  it('are found from a saved team', () => {
    const fun = playerSetsOf('Snorlax').at(-1)!;
    expect(findSet({ species: 'Snorlax', setId: fun.id })).toBe(fun);
  });
});

describe('sets on offer', () => {
  it("shows at most three of a week's sets, keeps your current one, and still finds the rest", () => {
    setOfferKey('2026-11-09');
    try {
      // Clefable has four standard sets and a fun set.
      const offered = playerSetsOf('Clefable');
      expect(offered).toHaveLength(3);
      expect(offered.at(-1)!.id).toMatch(/-fun-/);
      for (const set of setsOf('Clefable')) {
        expect(playerSetsOf('Clefable', set.id)).toContain(set);
        expect(findSet({ species: 'Clefable', setId: set.id })).toBe(set);
      }
    } finally {
      setOfferKey(undefined);
    }
  });
});

describe('possibleSets', () => {
  it('lists every set until the foe shows something', () => {
    expect(labels('Heatran')).toEqual(setsOf('Heatran').map((s) => s.label));
  });

  it('narrows on revealed moves, item, and ability', () => {
    expect(labels('Heatran', { moves: ['Magma Storm'], item: '', ability: '' })).toEqual([
      'Fast attacker',
    ]);
    expect(labels('Heatran', { moves: ['Stealth Rock'], item: '', ability: '' })).toEqual([
      'Stealth Rock setter',
    ]);
    expect(labels('Heatran', { moves: ['Dragon Pulse'], item: '', ability: '' })).toEqual([
      'Choice Scarf attacker',
      'Fast attacker',
    ]);
    expect(labels('Heatran', { moves: ['Stealth Rock'], item: 'Leftovers', ability: '' })).toEqual([
      'Stealth Rock setter',
    ]);
  });

  it('stops counting the item when nothing fits it (it may have been Tricked)', () => {
    const tricked = { moves: ['Magma Storm'], item: 'Choice Scarf', ability: '' };
    expect(labels('Heatran', tricked)).toEqual(['Fast attacker']);
  });
});

describe('coverage', () => {
  it('finds types no attack on the team hits super effectively', () => {
    // Choice Band Scizor: Bug, Steel, Fighting, and Dark attacks.
    const scizor = findSet({ species: 'Scizor', setId: 'scizor-choice-band' })!;
    const gaps = offenseGaps([scizor]);
    expect(gaps).toEqual(expect.arrayContaining(['Water', 'Fire', 'Fighting']));
    expect(gaps).not.toContain('Grass'); // U-turn
    expect(gaps).not.toContain('Steel'); // Superpower
  });

  it('flags a type three of the team are weak to, unless someone resists it', () => {
    const weakToGround = ['Heatran', 'Magnezone', 'Tyranitar'];
    expect(defenseGaps(weakToGround).map((g) => g.type)).toContain('Ground');
    // Gengar is Ground-weak by type, but Levitate makes it immune: Ground is covered.
    expect(defenseGaps([...weakToGround, 'Gengar']).map((g) => g.type)).not.toContain('Ground');
  });
});

describe('species facts', () => {
  it('describes items and abilities', () => {
    expect(itemInfo('Leftovers')).toMatch(/restores 1\/16/);
    expect(abilityInfo('Levitate')).toMatch(/Ground/);
    expect(itemInfo('Not An Item')).toBeUndefined();
  });

  it('treats forms of one Pokémon as the same species', () => {
    expect(sameSpecies('Rotom-Wash', 'Rotom-Frost')).toBe(true);
    expect(sameSpecies('Rotom-Wash', 'Gengar')).toBe(false);
  });
});

describe('randomTeam', () => {
  it('fills the team from the pool, one per species, and changes on each roll', () => {
    const pool = [
      'Rotom-Wash',
      'Rotom-Frost',
      'Infernape',
      'Latias',
      'Breloom',
      'Metagross',
      'Gengar',
    ];
    let last: ReturnType<typeof randomTeam> = [];
    for (let i = 0; i < 40; i++) {
      const team = randomTeam(pool, 6, last);
      expect(team).toHaveLength(6);
      expect(team.filter((s) => s.species.startsWith('Rotom'))).toHaveLength(1);
      expect(team.every((s) => pool.includes(s.species) && findSet(s))).toBe(true);
      expect(team.map((s) => s.setId).sort()).not.toEqual(last.map((s) => s.setId).sort());
      last = team;
    }
    expect(randomTeam(pool, 3)).toHaveLength(3);
  });

  it('never gives two Megas (Gen 6)', () => {
    setActiveFormat('gen6ou');
    try {
      const pool = ouSpecies().filter(canMega);
      for (let i = 0; i < 40; i++) {
        const megas = randomTeam(pool, 6).filter((s) => megaFor(s.species, findSet(s)));
        expect(megas.length).toBeLessThanOrEqual(1);
      }
    } finally {
      setActiveFormat('gen4ou');
    }
  });
});

describe('cores', () => {
  const POOL = ['Swampert', 'Skarmory', 'Dragonite', 'Magnezone', 'Metagross', 'Heatran'];
  const slot = (species: string) => ({ species, setId: topSet(species).id });

  it('finds the cores whose members are all in the pool', () => {
    const ids = coresIn(POOL).map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(['swampert-skarmory', 'dragonite-magnezone', 'dragonite-metagross']),
    );
    // Heatran + Celebi: Celebi isn't in the pool.
    expect(ids).not.toContain('heatran-celebi');
  });

  it('pairs each Pokémon with the teammates it shares a core with, through every core', () => {
    const found = pairings(['Dragonite'], coresIn(POOL));
    expect([...found.keys()].sort()).toEqual(['Magnezone', 'Metagross']);
    expect(found.get('Magnezone')!.map((p) => p.core.id)).toEqual(['dragonite-magnezone']);
    expect(found.get('Magnezone')![0]!.withTeam).toEqual(['Dragonite']);
    // Teammates are never listed as partners, and no team means no pairings.
    expect(pairings(['Dragonite', 'Magnezone'], coresIn(POOL)).has('Magnezone')).toBe(false);
    expect(pairings([], coresIn(POOL)).size).toBe(0);
  });

  it('adds a core’s missing members with their most used sets, keeping a member already there', () => {
    const core = coresIn(POOL).find((c) => c.id === 'swampert-skarmory')!;
    expect(addCore(core, [], 6)).toEqual({ add: [slot('Swampert'), slot('Skarmory')] });
    const mine = { species: 'Skarmory', setId: setsOf('Skarmory').at(-1)!.id };
    expect(addCore(core, [mine], 6)).toEqual({ add: [slot('Swampert')] });
    expect(addCore(core, [slot('Swampert'), slot('Skarmory')], 6)).toEqual({ add: [] });
  });

  it('says how many to remove when there is no room', () => {
    const core = coresIn(POOL).find((c) => c.id === 'swampert-skarmory')!;
    const team = ['Heatran', 'Metagross', 'Dragonite', 'Magnezone', 'Starmie'].map(slot);
    expect(addCore(core, team, 6)).toEqual({
      blocked: 'Remove 1 Pokémon to add Swampert + Skarmory',
    });
    expect(addCore(core, team, 5)).toEqual({
      blocked: 'Remove 2 Pokémon to add Swampert + Skarmory',
    });
  });

  it('joins names for a sentence', () => {
    expect(joinNames(['Skarmory'])).toBe('Skarmory');
    expect(joinNames(['Skarmory', 'Blissey'])).toBe('Skarmory and Blissey');
    expect(joinNames(['Skarmory', 'Blissey', 'Swampert'])).toBe('Skarmory, Blissey, and Swampert');
  });

  it('won’t add a second Mega (Gen 6)', () => {
    setActiveFormat('gen6ou');
    try {
      const core = coresIn(['Venusaur', 'Heatran']).find((c) => c.id === 'venusaur-heatran')!;
      // Latias's most used set holds a Mega Stone, and so does Venusaur's.
      const result = addCore(core, [slot('Latias')], 6);
      expect(result).toEqual({ blocked: expect.stringContaining('Latias has the Mega Stone') });
    } finally {
      setActiveFormat('gen4ou');
    }
  });
});
