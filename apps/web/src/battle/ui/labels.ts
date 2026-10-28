// Battle wording shared by the battle UI: status, boost, and explainer labels.

/** Splits a frame's text into display lines, dropping turn banners' decoration. */
export function textLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export const EXPLAINERS: Record<string, string> = {
  stealthrock:
    'Stealth Rock hurts every Pokémon that switches in on that side, more if it’s weak to Rock.',
  spikes: 'Spikes hurt grounded Pokémon that switch in. Up to three layers stack.',
  toxicspikes: 'Toxic Spikes poison grounded Pokémon that switch in.',
  reflect: 'Reflect halves damage from physical attacks for five turns.',
  lightscreen: 'Light Screen halves damage from special attacks for five turns.',
  sandstorm: 'Sandstorm chips Pokémon that aren’t Rock, Ground, or Steel each turn.',
  raindance: 'Rain powers up Water moves and weakens Fire moves.',
  sunnyday: 'Sun powers up Fire moves and weakens Water moves.',
  hail: 'Hail chips every Pokémon that isn’t Ice each turn.',
  brn: 'A burn halves physical damage and chips HP each turn.',
  par: 'Paralysis quarters Speed and sometimes stops a Pokémon from moving.',
  psn: 'Poison chips HP each turn.',
  tox: 'Toxic poison hurts more every turn it stays in.',
  slp: 'A sleeping Pokémon can’t move for a few turns.',
  frz: 'A frozen Pokémon can’t move until it thaws.',
  substitute: 'A Substitute takes hits for its user until it breaks.',
  choicelock: 'Choice items lock the holder into one move until it switches out.',
  mega: 'Mega Evolution changes a Pokémon’s stats, ability, and sometimes type for the rest of the battle. One per team.',
  stickyweb: 'Sticky Web lowers the Speed of grounded Pokémon that switch in.',
  electricterrain:
    'Electric Terrain powers up Electric moves and keeps grounded Pokémon awake for five turns.',
  grassyterrain:
    'Grassy Terrain heals grounded Pokémon a little each turn and powers up Grass moves for five turns.',
  mistyterrain:
    'Misty Terrain halves Dragon damage and protects grounded Pokémon from status for five turns.',
};

/** An explainer's text in this generation (Gen 7 made paralysis halve Speed, not quarter it). */
export function explainer(id: string, gen: number): string | undefined {
  if (id === 'par' && gen >= 7) {
    return 'Paralysis halves Speed and sometimes stops a Pokémon from moving.';
  }
  return EXPLAINERS[id];
}

export const STATUS_LABEL: Record<string, string> = {
  brn: 'BRN',
  par: 'PAR',
  psn: 'PSN',
  tox: 'TOX',
  slp: 'SLP',
  frz: 'FRZ',
};

export const STATUS_COLOR: Record<string, string> = {
  brn: '#d4652f',
  par: '#c9a227',
  psn: '#9443b5',
  tox: '#7a2f9a',
  slp: '#7f8798',
  frz: '#4cb3d1',
};

const BOOST_LABEL: Record<string, string> = {
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
  accuracy: 'Acc',
  evasion: 'Eva',
};

export function boostLabels(boosts: Record<string, number>): string[] {
  return Object.entries(boosts)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${BOOST_LABEL[k] ?? k}`);
}
