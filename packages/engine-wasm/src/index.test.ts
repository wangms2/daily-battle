import { describe, expect, it } from 'vitest';
import { EngineError, WASM_VERSION } from './index';
import { engineBuilt, loadEngine } from './node';

// poke-engine's documented example state (State::deserialize docs): Alakazam vs Terrakion.
const STATE =
  'alakazam,100,Psychic,Typeless,Psychic,Typeless,251,251,NONE,NONE,LIFEORB,SERIOUS,252;0;252;0;4;0,121,148,353,206,365,None,0,0,25.5,PSYCHIC;false;16,GRASSKNOT;false;32,SHADOWBALL;false;24,HIDDENPOWERFIRE70;false;24,false,false,normal=skarmory,100,Steel,Flying,Steel,Flying,271,271,STURDY,STURDY,CUSTAPBERRY,SERIOUS,,259,316,104,177,262,None,0,0,25.5,STEALTHROCK;false;32,SPIKES;false;32,BRAVEBIRD;false;24,THIEF;false;40,false,false,normal=tyranitar,100,Rock,Dark,Rock,Dark,404,404,SANDSTREAM,SANDSTREAM,CHOPLEBERRY,SERIOUS,,305,256,203,327,159,None,0,0,25.5,CRUNCH;false;24,SUPERPOWER;false;8,THUNDERWAVE;false;32,PURSUIT;false;32,false,false,normal=mamoswine,100,Ice,Ground,Ice,Ground,362,362,THICKFAT,THICKFAT,NEVERMELTICE,SERIOUS,,392,196,158,176,241,None,0,0,25.5,ICESHARD;false;48,EARTHQUAKE;false;16,SUPERPOWER;false;8,ICICLECRASH;false;16,false,false,normal=jellicent,100,Water,Ghost,Water,Ghost,404,404,WATERABSORB,WATERABSORB,AIRBALLOON,SERIOUS,,140,237,206,246,180,None,0,0,25.5,TAUNT;false;32,NIGHTSHADE;false;24,WILLOWISP;false;24,RECOVER;false;16,false,false,normal=excadrill,100,Ground,Steel,Ground,Steel,362,362,SANDFORCE,SANDFORCE,CHOICESCARF,SERIOUS,,367,156,122,168,302,None,0,0,25.5,EARTHQUAKE;false;16,IRONHEAD;false;24,ROCKSLIDE;false;16,RAPIDSPIN;false;64,false,false,normal=0=0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;==0;0;0;0;0;0=0=0=0=0=0=0=0=0=0=0=0=0=false=NONE=false=false=false=switch:0=false/terrakion,100,Rock,Fighting,Rock,Fighting,323,323,NONE,NONE,FOCUSSASH,SERIOUS,,357,216,163,217,346,None,0,0,25.5,CLOSECOMBAT;false;8,STONEEDGE;false;8,STEALTHROCK;false;32,TAUNT;false;32,false,false,normal=lucario,100,Fighting,Steel,Fighting,Steel,281,281,NONE,NONE,LIFEORB,SERIOUS,,350,176,241,177,279,None,0,0,25.5,CLOSECOMBAT;false;8,EXTREMESPEED;false;8,SWORDSDANCE;false;32,CRUNCH;false;24,false,false,normal=breloom,100,Grass,Fighting,Grass,Fighting,262,262,TECHNICIAN,TECHNICIAN,LIFEORB,SERIOUS,,394,196,141,156,239,None,0,0,25.5,MACHPUNCH;false;48,BULLETSEED;false;48,SWORDSDANCE;false;32,LOWSWEEP;false;32,false,false,normal=keldeo,100,Water,Fighting,Water,Fighting,323,323,NONE,NONE,LEFTOVERS,SERIOUS,,163,216,357,217,346,None,0,0,25.5,SECRETSWORD;false;16,HYDROPUMP;false;8,SCALD;false;24,SURF;false;24,false,false,normal=conkeldurr,100,Fighting,Typeless,Fighting,Typeless,414,414,GUTS,GUTS,LEFTOVERS,SERIOUS,,416,226,132,167,126,None,0,0,25.5,MACHPUNCH;false;48,DRAINPUNCH;false;16,ICEPUNCH;false;24,THUNDERPUNCH;false;24,false,false,normal=toxicroak,100,Poison,Fighting,Poison,Fighting,307,307,DRYSKIN,DRYSKIN,LIFEORB,SERIOUS,,311,166,189,167,295,None,0,0,25.5,DRAINPUNCH;false;16,SUCKERPUNCH;false;8,SWORDSDANCE;false;32,ICEPUNCH;false;24,false,false,normal=0=0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;==0;0;0;0;0;0=0=0=0=0=0=0=0=0=0=0=0=0=false=NONE=false=false=false=switch:0=false/none;5/none;5/false;5/false';

describe.skipIf(!engineBuilt(4))('engine (gen 4)', () => {
  it('parses the state into its normalized form', () => {
    const engine = loadEngine(4);
    const normalized = engine.roundtrip(STATE);
    expect(normalized.startsWith('ALAKAZAM,100,PSYCHIC,')).toBe(true);
    expect(engine.roundtrip(normalized)).toBe(normalized);
  });

  it('searches deterministically for a fixed seed', () => {
    const engine = loadEngine(4);
    const a = engine.search(STATE, 2000, 12345);
    expect(a.n).toBe(2000);
    expect(a.s1.reduce((n, o) => n + o.v, 0)).toBe(2000);
    expect(engine.search(STATE, 2000, 12345)).toEqual(a);
    expect(loadEngine(4).search(STATE, 2000, 12345)).toEqual(a);
  });

  it('searches with side one held to one option', () => {
    const engine = loadEngine(4);
    const option = engine.options(STATE).s1.indexOf('switch:1');
    const r = engine.searchFixed(STATE, 2000, 12345, option);
    expect(r.n).toBe(2000);
    expect(r.s1).toEqual([expect.objectContaining({ c: 'switch:1', v: 2000 })]);
    expect(engine.searchFixed(STATE, 2000, 12345, option)).toEqual(r);
    expect(() => engine.searchFixed(STATE, 10, 1, 99)).toThrow(EngineError);
  });

  it('lists root options as moves and switches', () => {
    const { s1 } = loadEngine(4).options(STATE);
    expect(s1).toContain('move:0');
    expect(s1).toContain('switch:1');
  });

  it('reports unknown names', () => {
    expect(
      loadEngine(4).unknown([
        'move stealthrock',
        'move notamove',
        'species skarmory',
        'item leftovers',
      ]),
    ).toEqual(['move notamove']);
  });

  it('recovers from a panic with a fresh instance', () => {
    const engine = loadEngine(4);
    expect(() => engine.search(STATE.replace('/false', '/maybe'), 10, 1)).toThrow(EngineError);
    expect(engine.search(STATE, 100, 1).n).toBe(100);
  });

  it('reports the version recorded with Hard attempts', () => {
    expect(loadEngine(4).version).toBe(WASM_VERSION);
  });
});
