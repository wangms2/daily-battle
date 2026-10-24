import { setsFor } from '@daily-battle/data';
import { Dex } from '@pkmn/sim';
import { deriveSeed, makeRng, randomTeam } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { BattleEngine, cleanText, effectiveness, moveDesc } from './engine';
import type { EngineStart, TurnPackage } from './frames';

function start(i: number, extra: Partial<EngineStart> = {}): EngineStart {
  const rng = makeRng(deriveSeed('engine:teams', i));
  return {
    playerTeam: randomTeam(rng),
    opponentTeam: randomTeam(rng),
    style: 'balance',
    battleSeed: deriveSeed('engine:battle', i),
    aiSeed: deriveSeed('engine:ai', i),
    choices: [],
    ...extra,
  };
}

/** Plays with seeded random legal choices; returns every package and the choices made. */
function play(s: EngineStart, maxChoices = 400, pick = makeRng('9,9,9,9')) {
  const engine = new BattleEngine(s);
  const packages: TurnPackage[] = [engine.begin()];
  const choices: string[] = [];
  while (!packages.at(-1)!.end && choices.length < maxChoices) {
    const c = packages.at(-1)!.controls!;
    const options = [
      ...c.moves.filter((m) => !m.disabled).map((m) => m.choice),
      ...c.switches.map((x) => x.choice),
    ];
    const choice = c.only ?? options[Math.floor(pick() * options.length)]!;
    choices.push(choice);
    packages.push(engine.choose(choice));
  }
  return { engine, packages, choices };
}

describe('BattleEngine', () => {
  it('opens with both leads out and your moves to pick', () => {
    const pkg = new BattleEngine(start(0)).begin();
    expect(pkg.frames.some((f) => /Go! \*\*/.test(f.text))).toBe(true);
    expect(pkg.frames.at(-1)!.view.you).not.toBeNull();
    expect(pkg.frames.at(-1)!.view.foe).not.toBeNull();
    expect(pkg.controls?.kind).toBe('move');
    expect(pkg.controls!.moves).toHaveLength(4);
    expect(pkg.team).toHaveLength(6);
    expect(pkg.end).toBeNull();
    expect(pkg.resumed).toBe(false);
  });

  it('plays a turn when you choose, with the opponent answering', () => {
    const engine = new BattleEngine(start(1));
    engine.begin();
    const pkg = engine.choose('move 1');
    expect(pkg.frames.some((f) => f.event?.kind === 'turn')).toBe(true);
    // The opponent acts too: it attacks or switches.
    expect(
      pkg.frames.some(
        (f) => f.event?.who === 'foe' && (f.event.kind === 'move' || f.event.kind === 'switch'),
      ),
    ).toBe(true);
  });

  it('plays whole battles to an end', () => {
    for (let i = 0; i < 5; i++) {
      const { packages } = play(start(10 + i));
      const end = packages.at(-1)!.end;
      expect(end, `battle ${i}`).not.toBeNull();
      expect(['you', 'foe']).toContain(end!.winner);
      expect(end!.winner === 'you' ? end!.youLeft : end!.foeLeft).toBeGreaterThan(0);
    }
  }, 60_000);

  it('flags first-time explainers for the mechanics that appear', () => {
    let weathers = 0;
    for (let i = 0; i < 6; i++) {
      const s = start(40 + i);
      // A Sand Stream lead, so weather always shows up.
      const team = s.playerTeam as { species: string; ability: string; moves: string[] }[];
      team[0] = {
        ...team[0]!,
        species: 'Hippowdon',
        ability: 'Sand Stream',
        moves: ['Earthquake', 'Slack Off', 'Stealth Rock', 'Roar'],
      };
      const { packages } = play(s, 60);
      const seen = new Set(packages.flatMap((p) => p.explainers));
      const weather = packages.flatMap((p) => p.frames).find((f) => f.view.weather)?.view.weather;
      if (weather) {
        weathers++;
        expect(seen, `battle ${i}`).toContain(weather.toLowerCase());
      }
      const sr = packages
        .flatMap((p) => p.frames)
        .some((f) => f.view.yourSide.sr || f.view.foeSide.sr);
      if (sr) expect(seen, `battle ${i}`).toContain('stealthrock');
    }
    expect(weathers).toBeGreaterThan(0);
  }, 60_000);

  it('resumes to exactly the state reached live (DESIGN.md §7)', () => {
    const s = start(20);
    const live = play(s, 30);
    const resumed = new BattleEngine({ ...s, choices: live.choices }).begin();
    expect(resumed.resumed).toBe(true);
    const last = live.packages.at(-1)!;
    expect(resumed.frames.at(-1)!.view).toEqual(last.frames.at(-1)!.view);
    expect(resumed.controls).toEqual(last.controls);
    expect(resumed.team).toEqual(last.team);
  });

  it('counts giving up as a loss', () => {
    const engine = new BattleEngine(start(2));
    engine.begin();
    const pkg = engine.forfeit();
    expect(pkg.end).toMatchObject({ winner: 'foe' });
    expect(pkg.controls).toBeNull();
  });

  it('flags a single legal choice', () => {
    let forcedSingles = 0;
    for (let i = 0; i < 6; i++) {
      for (const pkg of play(start(30 + i)).packages) {
        const c = pkg.controls;
        if (!c) continue;
        const legal = [
          ...c.moves.filter((m) => !m.disabled).map((m) => m.choice),
          ...c.switches.map((x) => x.choice),
        ];
        expect(c.only).toBe(legal.length === 1 ? legal[0] : null);
        if (c.kind === 'switch' && legal.length === 1) forcedSingles++;
      }
    }
    expect(forcedSingles).toBeGreaterThan(0);
  }, 60_000);

  it('only ever shows foe details the battle text has already revealed', () => {
    for (let i = 0; i < 4; i++) {
      const s = start(40 + i);
      let text = '';
      for (const pkg of play(s).packages) {
        for (const f of pkg.frames) {
          text += `${f.text}\n`;
          for (const [species, r] of Object.entries(f.view.revealed)) {
            expect(text, `battle ${i}: ${species}`).toContain(species);
            for (const m of r.moves) expect(text, `battle ${i}: ${species} ${m}`).toContain(m);
            if (r.item) expect(Dex.items.get(r.item).exists, `item ${r.item}`).toBe(true);
          }
          if (f.view.foe) expect(text).toContain(f.view.foe.species);
          for (const m of f.view.foeTeam) if (m.species) expect(text).toContain(m.species);
        }
      }
    }
  }, 60_000);
});

describe('field effects', () => {
  const frames = (i: number, extra?: Partial<EngineStart>) =>
    play(start(i, extra)).packages.flatMap((p) => p.frames);

  it('floats the HP change over whoever took damage or healed', () => {
    let labelled = 0;
    for (let i = 0; i < 4; i++) {
      let prev: TurnPackage['frames'][number] | undefined;
      for (const f of frames(60 + i)) {
        if (
          f.label &&
          (f.label.tone === 'damage' || f.label.tone === 'heal') &&
          f.label.text.endsWith('%')
        ) {
          const who = f.label.who;
          const d = f.view[who]!.hp - prev!.view[who]!.hp;
          expect(f.label.text).toBe(`${d < 0 ? '−' : '+'}${Math.abs(d)}%`);
          labelled++;
        }
        prev = f;
      }
    }
    expect(labelled).toBeGreaterThan(10);
  }, 60_000);

  it('pops up abilities and items as they reveal themselves', () => {
    const s = start(70);
    const team = s.playerTeam as {
      species: string;
      ability: string;
      item: string;
      moves: string[];
    }[];
    team[0] = {
      ...team[0]!,
      species: 'Hippowdon',
      ability: 'Sand Stream',
      item: 'Leftovers',
      moves: ['Slack Off', 'Stealth Rock', 'Roar', 'Earthquake'],
    };
    const popups = play(s, 6)
      .packages.flatMap((p) => p.frames)
      .flatMap((f) => (f.popup ? [f.popup] : []));
    expect(popups).toContainEqual({ who: 'you', text: 'Sand Stream' });
  });

  it('keeps six team marks per side, greying out the fainted', () => {
    const { packages } = play(start(80));
    const last = packages.at(-1)!;
    const view = last.frames.at(-1)!.view;
    expect(view.yourTeam).toHaveLength(6);
    expect(view.foeTeam).toHaveLength(6);
    expect(view.yourTeam.filter((m) => !m.fainted)).toHaveLength(last.end!.youLeft);
    expect(view.foeTeam.filter((m) => !m.fainted)).toHaveLength(last.end!.foeLeft);
    expect(view.yourTeam.every((m) => m.species)).toBe(true);
  }, 60_000);
});

describe('cleanText', () => {
  it('keeps the shown part of exact/shown number markup', () => {
    expect(cleanText('(Hitmontop lost ||−270/304||88.8%|| of its health!)')).toBe(
      '(Hitmontop lost 88.8% of its health!)',
    );
  });

  it('says "your" for the player, whose trainer name is You', () => {
    expect(cleanText("Manectric's Manectite is reacting to You's Mega Bracelet!")).toBe(
      "Manectric's Manectite is reacting to your Mega Bracelet!",
    );
  });
});

describe('move details', () => {
  const gen4 = Dex.forGen(4);
  it('reads the full text when it is short, else the summary', () => {
    expect(moveDesc(gen4, gen4.moves.get('Flare Blitz'))).toMatch(/recoil damage equal to 1\/3/);
    expect(moveDesc(gen4, gen4.moves.get('Substitute'))).toBe(
      gen4.moves.get('Substitute').shortDesc,
    );
    expect(moveDesc(gen4, gen4.moves.get('Hidden Power Ice'))).toMatch(
      /Power varies between 30 and 70/,
    );
  });

  it('names moves cleanly and carries priority and contact', () => {
    const { packages } = play(start(0), 60);
    const moves = packages.flatMap((p) => p.controls?.moves ?? []);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(m.name).not.toMatch(/\d$/); // never "Return 102"
      expect(Number.isInteger(m.priority)).toBe(true);
      expect(typeof m.contact).toBe('boolean');
    }
  });
});

describe('effectiveness', () => {
  const gen4 = Dex.forGen(4);
  it('reads the Gen 4 type chart', () => {
    expect(effectiveness(gen4, 'Thunderbolt', 'Gyarados')).toBe(4);
    expect(effectiveness(gen4, 'Earthquake', 'Skarmory')).toBe(0);
    expect(effectiveness(gen4, 'Surf', 'Heatran')).toBe(2);
    expect(effectiveness(gen4, 'Fire Blast', 'Swampert')).toBe(0.5);
    expect(effectiveness(gen4, 'Hidden Power Ice', 'Dragonite')).toBe(4);
    expect(effectiveness(gen4, 'Stealth Rock', 'Gyarados')).toBeNull();
  });

  it('reads the Gen 5 typings (Rotom-Wash is Electric/Water)', () => {
    const gen5 = Dex.forGen(5);
    expect(effectiveness(gen4, 'Grass Knot', 'Rotom-Wash')).toBe(1);
    expect(effectiveness(gen5, 'Grass Knot', 'Rotom-Wash')).toBe(2);
  });
});

describe('BattleEngine on Gen 5 OU (Team Preview)', () => {
  const data = setsFor('gen5ou');
  const start5 = (i: number): EngineStart => {
    const rng = makeRng(deriveSeed('engine:gen5:teams', i));
    return {
      format: 'gen5ou',
      playerTeam: randomTeam(rng, data),
      opponentTeam: randomTeam(rng, data),
      style: 'balance',
      battleSeed: deriveSeed('engine:gen5:battle', i),
      aiSeed: deriveSeed('engine:gen5:ai', i),
      choices: [],
    };
  };

  it('answers Team Preview with your lead and shows the foe six from the start', () => {
    const s = start5(0);
    const pkg = new BattleEngine(s).begin();
    const view = pkg.frames.at(-1)!.view;
    expect(view.you?.species).toBe((s.playerTeam[0] as { species: string }).species);
    const foeSpecies = (s.opponentTeam as { species: string }[]).map((p) => p.species).sort();
    expect(view.foeTeam.map((m) => m.species).sort()).toEqual(foeSpecies);
    expect(view.foeTeam.every((m) => !m.fainted)).toBe(true);
    expect(pkg.controls?.kind).toBe('move');
  });

  it('plays whole battles to an end', () => {
    for (let i = 0; i < 3; i++) {
      const { packages } = play(start5(10 + i));
      expect(packages.at(-1)!.end, `battle ${i}`).not.toBeNull();
    }
  });

  it('resumes to exactly the state reached live', () => {
    const s = start5(20);
    const live = play(s, 30);
    const resumed = new BattleEngine({ ...s, choices: live.choices }).begin();
    const last = live.packages.at(-1)!;
    expect(resumed.frames.at(-1)!.view).toEqual(last.frames.at(-1)!.view);
    expect(resumed.controls).toEqual(last.controls);
    expect(resumed.team).toEqual(last.team);
  });
});
