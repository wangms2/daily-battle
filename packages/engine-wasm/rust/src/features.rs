//! The value network's input features (tools/net): a poke-engine `State`, seen
//! from side one, as 13 tokens. Training (the native `featurize` binary) and
//! play (the WASM) share this code, so the two can't drift apart.
//!
//! Tokens: 12 Pokémon (side one's six, then side two's, in slot order), each
//! `MON_F` floats plus `IDS` embedding ids; and one field token, `FIELD_F`
//! floats (weather, terrain, each side's conditions and its active Pokémon's
//! boosts and volatile statuses, and the gen). Bump `VERSION` whenever a
//! feature changes meaning; append rather than reorder.
//!
//! `observe` is observation v2, for the self-play network: either side's view,
//! only what that side has seen of the foe, recent events, and matchup tokens.

use poke_engine::choices::MoveCategory;
use poke_engine::engine::generate_instructions::calculate_both_damage_rolls;
use poke_engine::state::{Pokemon, PokemonIndex, PokemonStatus, Side, State};

pub const VERSION: u32 = 1;

pub const TYPES: usize = 20;
pub const MOVE_F: usize = TYPES + 1 + 3 + 1 + 1 + 1 + 1 + 1;
pub const MON_F: usize = 40 + 4 * MOVE_F;
const VOLATILES: usize = 104;
const SIDE_F: usize = 19 + 6 + 2 + 1 + 5 + 7 + 1 + VOLATILES;
pub const FIELD_F: usize = 9 + 1 + 5 + 1 + 2 + 7 + 2 * SIDE_F;
/// Embedding ids per Pokémon: species, item, ability, moves 1–4.
pub const IDS: usize = 7;
pub const TOKENS: usize = 12;

/// Embedding table sizes. Gen 3 builds have their own item and ability
/// enums, so their ids are offset past the later gens'.
pub const SPECIES_VOCAB: usize = 1536;
pub const MOVE_VOCAB: usize = 1024;
pub const ITEM_VOCAB: usize = 512;
pub const ABILITY_VOCAB: usize = 768;
const GEN3_ITEM_OFFSET: u16 = 256;
const GEN3_ABILITY_OFFSET: u16 = 384;

/// This build's generation.
pub fn gen() -> u8 {
    if cfg!(feature = "gen3") {
        3
    } else if cfg!(feature = "gen4") {
        4
    } else if cfg!(feature = "gen5") {
        5
    } else if cfg!(feature = "gen6") {
        6
    } else if cfg!(feature = "gen7") {
        7
    } else if cfg!(feature = "gen8") {
        8
    } else {
        9
    }
}

pub struct Features {
    /// `TOKENS * MON_F` floats, then `FIELD_F`.
    pub floats: Vec<f32>,
    /// `TOKENS * IDS` embedding ids.
    pub ids: Vec<u16>,
}

pub const FLOATS: usize = TOKENS * MON_F + FIELD_F;

fn status_index(s: PokemonStatus) -> usize {
    match s {
        PokemonStatus::NONE => 0,
        PokemonStatus::BURN => 1,
        PokemonStatus::SLEEP => 2,
        PokemonStatus::FREEZE => 3,
        PokemonStatus::PARALYZE => 4,
        PokemonStatus::POISON => 5,
        PokemonStatus::TOXIC => 6,
    }
}

fn item_id(p: &Pokemon) -> u16 {
    let id = p.item as u8 as u16;
    if gen() == 3 {
        id + GEN3_ITEM_OFFSET
    } else {
        id
    }
}

fn ability_id(p: &Pokemon) -> u16 {
    let id = p.ability as i16 as u16;
    if gen() == 3 {
        id + GEN3_ABILITY_OFFSET
    } else {
        id
    }
}

fn clamp(x: f32, lo: f32, hi: f32) -> f32 {
    x.max(lo).min(hi)
}

/// Each of the attacker's moves' best damage roll as a share of the defender's HP.
fn damage_shares(state: &State, side_one_attacks: bool) -> [f32; 4] {
    let mut out = [0.0; 4];
    let (a, d) = if side_one_attacks {
        (&state.side_one, &state.side_two)
    } else {
        (&state.side_two, &state.side_one)
    };
    let defender = d.get_active_immutable();
    if defender.hp <= 0 || a.get_active_immutable().hp <= 0 {
        return out;
    }
    let other = &d.get_active_immutable().moves.m0.choice;
    for (i, mv) in a.get_active_immutable().moves.into_iter().enumerate() {
        if mv.choice.category == MoveCategory::Status || mv.choice.base_power <= 0.0 {
            continue;
        }
        let (r1, r2) = if side_one_attacks {
            calculate_both_damage_rolls(state, mv.choice.clone(), other.clone(), true)
        } else {
            calculate_both_damage_rolls(state, other.clone(), mv.choice.clone(), true)
        };
        let rolls = if side_one_attacks { r1 } else { r2 };
        if let Some(r) = rolls {
            let best = r.iter().copied().max().unwrap_or(0) as f32;
            out[i] = clamp(best / defender.hp.max(1) as f32, 0.0, 2.0);
        }
    }
    out
}

fn push_mon(f: &mut Vec<f32>, ids: &mut Vec<u16>, p: &Pokemon, own: bool, active: bool, dmg: &[f32; 4]) {
    let start = f.len();
    f.resize(start + MON_F, 0.0);
    let x = &mut f[start..];
    let exists = p.id != poke_engine::pokemon::PokemonName::NONE;
    x[0] = own as u8 as f32;
    x[1] = active as u8 as f32;
    x[2] = (exists && p.hp > 0) as u8 as f32;
    x[3] = if p.maxhp > 0 { clamp(p.hp as f32 / p.maxhp as f32, 0.0, 1.0) } else { 0.0 };
    x[4] = p.maxhp as f32 / 500.0;
    x[5] = p.attack as f32 / 500.0;
    x[6] = p.defense as f32 / 500.0;
    x[7] = p.special_attack as f32 / 500.0;
    x[8] = p.special_defense as f32 / 500.0;
    x[9] = p.speed as f32 / 500.0;
    x[10 + (p.types.0 as usize).min(TYPES - 1)] += 1.0;
    if p.types.1 != p.types.0 {
        x[10 + (p.types.1 as usize).min(TYPES - 1)] += 1.0;
    }
    x[30 + status_index(p.status)] = 1.0;
    x[37] = p.sleep_turns as f32 / 3.0;
    x[38] = p.rest_turns as f32 / 3.0;
    x[39] = p.mega_evolved as u8 as f32;
    for (i, mv) in p.moves.into_iter().enumerate() {
        let m = &mut x[40 + i * MOVE_F..40 + (i + 1) * MOVE_F];
        if mv.id == poke_engine::choices::Choices::NONE {
            continue;
        }
        let c = &mv.choice;
        m[(c.move_type as usize).min(TYPES - 1)] = 1.0;
        m[TYPES] = c.base_power / 150.0;
        match c.category {
            MoveCategory::Physical => m[TYPES + 1] = 1.0,
            MoveCategory::Special => m[TYPES + 2] = 1.0,
            _ => m[TYPES + 3] = 1.0,
        }
        m[TYPES + 4] = c.accuracy / 100.0;
        m[TYPES + 5] = c.priority as f32 / 5.0;
        m[TYPES + 6] = (mv.pp > 0) as u8 as f32;
        m[TYPES + 7] = mv.disabled as u8 as f32;
        m[TYPES + 8] = if active { dmg[i] } else { 0.0 };
    }
    ids.push(p.id as i16 as u16);
    ids.push(item_id(p));
    ids.push(ability_id(p));
    for mv in &p.moves {
        ids.push(mv.id as u16);
    }
}

fn push_side(f: &mut Vec<f32>, s: &Side) {
    let c = &s.side_conditions;
    for v in [
        c.aurora_veil,
        c.crafty_shield,
        c.healing_wish,
        c.light_screen,
        c.lucky_chant,
        c.lunar_dance,
        c.mat_block,
        c.mist,
        c.protect,
        c.quick_guard,
        c.reflect,
        c.safeguard,
        c.spikes,
        c.stealth_rock,
        c.sticky_web,
        c.tailwind,
        c.toxic_count,
        c.toxic_spikes,
        c.wide_guard,
    ] {
        f.push(v as f32 / 3.0);
    }
    let d = &s.volatile_status_durations;
    for v in [d.confusion, d.encore, d.lockedmove, d.slowstart, d.taunt, d.yawn] {
        f.push(v as f32 / 5.0);
    }
    let active = s.get_active_immutable();
    f.push((s.wish.0 > 0) as u8 as f32);
    f.push(if active.maxhp > 0 { s.wish.1 as f32 / active.maxhp as f32 } else { 0.0 });
    f.push(s.future_sight.0 as f32 / 3.0);
    for b in [s.force_switch, s.force_trapped, s.baton_passing, s.shed_tailing, s.slow_uturn_move] {
        f.push(b as u8 as f32);
    }
    for b in [
        s.attack_boost,
        s.defense_boost,
        s.special_attack_boost,
        s.special_defense_boost,
        s.speed_boost,
        s.accuracy_boost,
        s.evasion_boost,
    ] {
        f.push(b as f32 / 6.0);
    }
    f.push(if active.maxhp > 0 { s.substitute_health as f32 / active.maxhp as f32 } else { 0.0 });
    // Bit 0 is NONE.
    let bits = s.volatile_statuses.0;
    for i in 1..=VOLATILES {
        f.push(((bits >> i) & 1) as f32);
    }
}

/// The features of `state`, seen from side one.
pub fn features(state: &State) -> Features {
    let mut floats = Vec::with_capacity(FLOATS);
    let mut ids = Vec::with_capacity(TOKENS * IDS);
    let d1 = damage_shares(state, true);
    let d2 = damage_shares(state, false);
    for (side, own, dmg) in [(&state.side_one, true, &d1), (&state.side_two, false, &d2)] {
        let active = side.active_index as usize;
        for (i, p) in side.pokemon.into_iter().enumerate() {
            push_mon(&mut floats, &mut ids, p, own, i == active, dmg);
        }
    }
    let start = floats.len();
    floats.resize(start + 9 + 1 + 5 + 1 + 2 + 7, 0.0);
    let x = &mut floats[start..];
    x[(state.weather.weather_type as usize).min(8)] = 1.0;
    x[9] = clamp(state.weather.turns_remaining as f32 / 8.0, -1.0, 1.0);
    x[10 + (state.terrain.terrain_type as usize).min(4)] = 1.0;
    x[15] = state.terrain.turns_remaining as f32 / 8.0;
    x[16] = state.trick_room.active as u8 as f32;
    x[17] = state.trick_room.turns_remaining as f32 / 5.0;
    x[18 + (gen() as usize).saturating_sub(3).min(6)] = 1.0;
    push_side(&mut floats, &state.side_one);
    push_side(&mut floats, &state.side_two);
    debug_assert_eq!(floats.len(), FLOATS);
    Features { floats, ids }
}

// ---- Observation v2 ------------------------------------------------------

pub const OBS_VERSION: u32 = 3;
/// A move: the v1 move features plus "known to the viewer".
pub const MOVE2_F: usize = MOVE_F + 1;
/// A Pokémon's own floats: the v1 40, plus seen, item known, ability known, and
/// the Speed bounds the viewer has (both its true Speed for the viewer's own).
pub const MON2_BASE: usize = 45;
pub const MON2_F: usize = MON2_BASE + 4 * MOVE2_F;
/// Recent events (a move used or a switch-in), newest last.
pub const HIST: usize = 16;
pub const HIST_F: usize = 8;
pub const HIST_IDS: usize = 2;
/// Matchups (Jaxcalibur-style): each of the viewer's six against up to
/// `MATCH_FOES` of the foe's (its active one first, then its other seen,
/// unfainted ones in slot order). Token `k` pairs own slot `k / MATCH_FOES`.
pub const MATCH_FOES: usize = 4;
pub const MATCH: usize = 6 * MATCH_FOES;
/// Damage both ways (4 + 4), present, faster / slower / either, the foe's slot
/// (one-hot), and whether each side's Pokémon is the active one.
pub const MATCH_F: usize = 4 + 4 + 4 + 6 + 2;
pub const OBS_FLOATS: usize = TOKENS * MON2_F + FIELD_F + HIST * HIST_F + MATCH * MATCH_F;
pub const OBS_IDS: usize = TOKENS * IDS + HIST * HIST_IDS;
/// The "unknown" id of each table (its last), for whatever the viewer hasn't seen.
pub const UNKNOWN_SPECIES: u16 = (SPECIES_VOCAB - 1) as u16;
pub const UNKNOWN_ITEM: u16 = (ITEM_VOCAB - 1) as u16;
pub const UNKNOWN_ABILITY: u16 = (ABILITY_VOCAB - 1) as u16;
pub const UNKNOWN_MOVE: u16 = (MOVE_VOCAB - 1) as u16;

/// What a viewer knows of one foe Pokémon. Its stats are only known as far as
/// the public base stats and the evidence go: `base` gives estimates (31 IVs,
/// no EVs, level 100) and `speed` bounds its Speed stat, narrowed by observed
/// turn order.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Known {
    pub seen: bool,
    pub item: bool,
    pub ability: bool,
    pub moves: [bool; 4],
    /// Base stats (HP, Atk, Def, SpA, SpD, Spe) of its current forme.
    pub base: [u16; 6],
    /// The lowest and highest Speed it could have in turn order (its Speed stat
    /// times any item multiplier, such as a Choice Scarf), given the evidence.
    pub speed: (u16, u16),
}

impl Known {
    pub const ALL: Known = Known {
        seen: true,
        item: true,
        ability: true,
        moves: [true; 4],
        base: [0; 6],
        speed: (0, 0),
    };

    /// Nothing revealed yet: Speed anywhere from 0 IVs and a hindering nature
    /// up to 31 IVs, 252 EVs and a boosting one.
    pub fn unrevealed(base: [u16; 6]) -> Known {
        Known { base, speed: speed_range(base[5]), ..Default::default() }
    }

    /// After a forme change (Mega Evolution): new base stats, Speed evidence reset.
    pub fn set_base(&mut self, base: [u16; 6]) {
        self.base = base;
        self.speed = speed_range(base[5]);
    }

    /// Evidence that its Speed is at least (`faster`) or at most `other` (ties go either way).
    /// Outspeeding its highest possible stat means a Choice Scarf (×1.5), as a
    /// player would conclude; the bounds widen to match.
    pub fn observe_speed(&mut self, faster: bool, other: u16) {
        let (lo, hi) = self.speed;
        self.speed = if faster {
            if other > hi {
                (other, (hi as u32 * 3 / 2).max(other as u32).min(u16::MAX as u32) as u16)
            } else {
                (lo.max(other), hi)
            }
        } else if other < lo {
            // Slower than it can be: something we don't model. Keep what this says.
            (other / 2, other)
        } else {
            (lo, hi.min(other))
        };
    }

    /// Its Speed evidence is stale (its item changed hands): back to the prior.
    pub fn reset_speed(&mut self) {
        self.speed = speed_range(self.base[5]);
    }
}

pub fn speed_range(base: u16) -> (u16, u16) {
    let b = base as u32;
    (((2 * b + 5) * 9 / 10) as u16, ((2 * b + 99) * 11 / 10) as u16)
}

/// Speed as turn order sees it, before boosts and field effects: the stat,
/// times 1.5 with a Choice Scarf.
pub fn effective_speed(p: &Pokemon) -> u16 {
    let s = p.speed.max(0) as u32;
    let s = if format!("{:?}", p.item) == "CHOICESCARF" { s * 3 / 2 } else { s };
    s.min(u16::MAX as u32) as u16
}

/// One event, in absolute terms (side one or two).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Event {
    /// 1: a move was used; 2: a Pokémon switched in.
    pub kind: u8,
    pub by_side_one: bool,
    /// The turn it happened on.
    pub turn: u32,
    /// The acting (or incoming) Pokémon's species id.
    pub species: u16,
    /// The move's id (moves only).
    pub mv: u16,
    pub mega: bool,
    /// Both active Pokémon's HP fractions at the end of that turn.
    pub hp_one: f32,
    pub hp_two: f32,
}

pub fn pokemon_index(i: usize) -> PokemonIndex {
    match i {
        0 => PokemonIndex::P0,
        1 => PokemonIndex::P1,
        2 => PokemonIndex::P2,
        3 => PokemonIndex::P3,
        4 => PokemonIndex::P4,
        _ => PokemonIndex::P5,
    }
}

pub fn hp_frac(p: &Pokemon) -> f32 {
    if p.maxhp > 0 {
        clamp(p.hp as f32 / p.maxhp as f32, 0.0, 1.0)
    } else {
        0.0
    }
}

fn push_mon2(f: &mut Vec<f32>, ids: &mut Vec<u16>, p: &Pokemon, own: bool, active: bool, dmg: &[f32; 4], k: Known) {
    let start = f.len();
    f.resize(start + MON2_F, 0.0);
    let x = &mut f[start..];
    let exists = p.id != poke_engine::pokemon::PokemonName::NONE;
    x[0] = own as u8 as f32;
    if !k.seen {
        // Only that it exists (team sizes are public) and, being unseen, hasn't fainted.
        x[2] = exists as u8 as f32;
        ids.extend_from_slice(&[UNKNOWN_SPECIES, UNKNOWN_ITEM, UNKNOWN_ABILITY]);
        ids.extend_from_slice(&[UNKNOWN_MOVE; 4]);
        return;
    }
    let mut v1 = Vec::with_capacity(MON_F);
    let mut v1_ids = Vec::with_capacity(IDS);
    push_mon(&mut v1, &mut v1_ids, p, own, active, dmg);
    x[..40].copy_from_slice(&v1[..40]);
    if own {
        x[43] = effective_speed(p) as f32 / 500.0;
        x[44] = x[43];
    } else {
        // Only public estimates of the foe's stats; its Speed as bounded by evidence.
        let b = k.base.map(|v| v as f32);
        x[4] = (2.0 * b[0] + 141.0) / 500.0;
        for s in 1..6 {
            x[4 + s] = (2.0 * b[s] + 36.0) / 500.0;
        }
        x[43] = k.speed.0 as f32 / 500.0;
        x[44] = k.speed.1 as f32 / 500.0;
    }
    x[40] = 1.0;
    x[41] = k.item as u8 as f32;
    x[42] = k.ability as u8 as f32;
    for i in 0..4 {
        if !k.moves[i] {
            continue;
        }
        let m = &mut x[MON2_BASE + i * MOVE2_F..MON2_BASE + (i + 1) * MOVE2_F];
        m[..MOVE_F].copy_from_slice(&v1[40 + i * MOVE_F..40 + (i + 1) * MOVE_F]);
        m[MOVE_F] = 1.0;
    }
    ids.push(v1_ids[0]);
    ids.push(if k.item { v1_ids[1] } else { UNKNOWN_ITEM });
    ids.push(if k.ability { v1_ids[2] } else { UNKNOWN_ABILITY });
    for i in 0..4 {
        ids.push(if k.moves[i] { v1_ids[3 + i] } else { UNKNOWN_MOVE });
    }
}

fn neutral(side: &mut Side, i: usize) {
    side.active_index = pokemon_index(i);
    side.attack_boost = 0;
    side.defense_boost = 0;
    side.special_attack_boost = 0;
    side.special_defense_boost = 0;
    side.speed_boost = 0;
    side.accuracy_boost = 0;
    side.evasion_boost = 0;
    side.substitute_health = 0;
    side.volatile_statuses = Default::default();
}

/// The board as the viewer can know it: the foe's unrevealed items and abilities
/// become none, and its stats the public estimates (`Known.base`; HP keeps its
/// visible fraction). Damage numbers come from this, so they never leak a
/// hidden Assault Vest, Levitate or EV spread; the network learns to guess those.
pub fn public_view(state: &State, viewer_one: bool, foe_known: &[Known; 6]) -> State {
    use poke_engine::engine::abilities::Abilities;
    use poke_engine::engine::items::Items;
    let mut s = state.clone();
    let foe = if viewer_one { &mut s.side_two } else { &mut s.side_one };
    for (i, k) in foe_known.iter().enumerate() {
        let p = &mut foe.pokemon[pokemon_index(i)];
        if !k.item {
            p.item = Items::NONE;
        }
        if !k.ability {
            p.ability = Abilities::NONE;
        }
        if k.base[0] == 0 {
            continue;
        }
        let b = k.base.map(|v| v as i16);
        let frac = hp_frac(p);
        p.maxhp = 2 * b[0] + 141;
        p.hp = if p.hp > 0 { ((frac * p.maxhp as f32).round() as i16).max(1) } else { 0 };
        p.attack = 2 * b[1] + 36;
        p.defense = 2 * b[2] + 36;
        p.special_attack = 2 * b[3] + 36;
        p.special_defense = 2 * b[4] + 36;
        p.speed = 2 * b[5] + 36;
    }
    s
}

/// The foe slots the matchup tokens cover: its active one, then its other seen,
/// unfainted ones in slot order.
fn match_foes(state: &State, viewer_one: bool, known: &[Known; 6]) -> Vec<usize> {
    let foe = if viewer_one { &state.side_two } else { &state.side_one };
    let active = foe.active_index as usize;
    let mut out = vec![active];
    for j in 0..6 {
        let p = &foe.pokemon[pokemon_index(j)];
        if j != active && known[j].seen && p.hp > 0 && out.len() < MATCH_FOES {
            out.push(j);
        }
    }
    out
}

/// One matchup token: own slot `i` attacks foe slot `j` (each move's best share
/// of HP), `j` attacks `i` (its moves known to the viewer only), whether `i` is
/// surely faster, surely slower, or either, going by the foe's Speed bounds
/// (Speed stats, no boosts), `j` one-hot, and which of the two are active.
/// Benched Pokémon are compared without boosts or volatiles; the active pair
/// keeps them. `state` is the public view.
fn push_matchup(f: &mut Vec<f32>, state: &State, viewer_one: bool, i: usize, j: Option<usize>, foe_known: &[Known; 6]) {
    let start = f.len();
    f.resize(start + MATCH_F, 0.0);
    let Some(j) = j else { return };
    let mut s = state.clone();
    let (own, foe) = if viewer_one { (&mut s.side_one, &mut s.side_two) } else { (&mut s.side_two, &mut s.side_one) };
    let (own_active, foe_active) = (own.active_index as usize == i, foe.active_index as usize == j);
    if !own_active {
        neutral(own, i);
    }
    if !foe_active {
        neutral(foe, j);
    }
    let (a, b) = (own.get_active_immutable(), foe.get_active_immutable());
    if a.hp <= 0 || b.hp <= 0 {
        return;
    }
    let (own_speed, (lo, hi)) = (effective_speed(a), foe_known[j].speed);
    let d_own = damage_shares(&s, viewer_one);
    let d_foe = damage_shares(&s, !viewer_one);
    let x = &mut f[start..];
    x[..4].copy_from_slice(&d_own);
    for m in 0..4 {
        if foe_known[j].moves[m] {
            x[4 + m] = d_foe[m];
        }
    }
    x[8] = 1.0;
    x[9] = (own_speed > hi) as u8 as f32;
    x[10] = (own_speed < lo) as u8 as f32;
    x[11] = (own_speed >= lo && own_speed <= hi) as u8 as f32;
    x[12 + j] = 1.0;
    x[18] = own_active as u8 as f32;
    x[19] = foe_active as u8 as f32;
}

/// Observation v3 of `state` for one side: its own team fully, the foe's only as
/// far as `foe_known` says, the last `HIST` of `history` (oldest first), and the
/// matchup tokens. `turn` is the current turn, for the events' ages.
pub fn observe(state: &State, viewer_one: bool, foe_known: &[Known; 6], history: &[Event], turn: u32) -> Features {
    let mut floats = Vec::with_capacity(OBS_FLOATS);
    let mut ids = Vec::with_capacity(OBS_IDS);
    let (own, foe) = if viewer_one { (&state.side_one, &state.side_two) } else { (&state.side_two, &state.side_one) };
    let own_active = own.active_index as usize;
    let foe_active = foe.active_index as usize;
    let mut known = *foe_known;
    known[foe_active].seen = true;
    let public = public_view(state, viewer_one, &known);
    let d_own = damage_shares(&public, viewer_one);
    let d_foe = damage_shares(&public, !viewer_one);
    for (i, p) in own.pokemon.into_iter().enumerate() {
        push_mon2(&mut floats, &mut ids, p, true, i == own_active, &d_own, Known::ALL);
    }
    for (i, p) in foe.pokemon.into_iter().enumerate() {
        let mut k = foe_known[i];
        // The foe's damage to us is only shown for moves we've seen.
        let mut d = d_foe;
        for m in 0..4 {
            if !k.moves[m] {
                d[m] = 0.0;
            }
        }
        if i == foe_active {
            k.seen = true;
        }
        push_mon2(&mut floats, &mut ids, p, false, i == foe_active, &d, k);
    }

    let start = floats.len();
    floats.resize(start + 9 + 1 + 5 + 1 + 2 + 7, 0.0);
    let x = &mut floats[start..];
    x[(state.weather.weather_type as usize).min(8)] = 1.0;
    x[9] = clamp(state.weather.turns_remaining as f32 / 8.0, -1.0, 1.0);
    x[10 + (state.terrain.terrain_type as usize).min(4)] = 1.0;
    x[15] = state.terrain.turns_remaining as f32 / 8.0;
    x[16] = state.trick_room.active as u8 as f32;
    x[17] = state.trick_room.turns_remaining as f32 / 5.0;
    x[18 + (gen() as usize).saturating_sub(3).min(6)] = 1.0;
    push_side(&mut floats, own);
    push_side(&mut floats, foe);

    let recent = &history[history.len().saturating_sub(HIST)..];
    for slot in 0..HIST {
        let start = floats.len();
        floats.resize(start + HIST_F, 0.0);
        // Right-aligned: the newest event is always the last token.
        let Some(e) = (slot + recent.len()).checked_sub(HIST).and_then(|i| recent.get(i)) else {
            ids.extend_from_slice(&[UNKNOWN_SPECIES, UNKNOWN_MOVE]);
            continue;
        };
        let mine = e.by_side_one == viewer_one;
        let x = &mut floats[start..];
        x[0] = 1.0;
        x[1] = mine as u8 as f32;
        x[2] = (e.kind == 1) as u8 as f32;
        x[3] = (e.kind == 2) as u8 as f32;
        x[4] = e.mega as u8 as f32;
        let (hp_own, hp_foe) = if viewer_one { (e.hp_one, e.hp_two) } else { (e.hp_two, e.hp_one) };
        x[5] = hp_own;
        x[6] = hp_foe;
        x[7] = (turn.saturating_sub(e.turn) as f32 / 8.0).min(2.0);
        ids.push(e.species);
        ids.push(if e.kind == 1 { e.mv } else { UNKNOWN_MOVE });
    }

    let foes = match_foes(&public, viewer_one, &known);
    for i in 0..6 {
        for t in 0..MATCH_FOES {
            push_matchup(&mut floats, &public, viewer_one, i, foes.get(t).copied(), &known);
        }
    }
    debug_assert_eq!(floats.len(), OBS_FLOATS);
    debug_assert_eq!(ids.len(), OBS_IDS);
    Features { floats, ids }
}

/// A Pokémon's embedding ids (species, item, ability, moves), for set targets and events.
pub fn mon_ids(p: &Pokemon) -> [u16; IDS] {
    let mut f = Vec::new();
    let mut ids = Vec::new();
    push_mon(&mut f, &mut ids, p, true, false, &[0.0; 4]);
    [ids[0], ids[1], ids[2], ids[3], ids[4], ids[5], ids[6]]
}

/// A JSON table of names by embedding id (species, moves, items, abilities)
/// for this build, so training can name and share ids across gens.
pub fn names_json() -> String {
    use poke_engine::choices::Choices;
    use poke_engine::engine::abilities::Abilities;
    use poke_engine::engine::items::Items;
    use poke_engine::pokemon::PokemonName;
    fn table(kind: &str, n: usize, name: impl Fn(usize) -> Option<String>) -> String {
        let list: Vec<String> = (0..n)
            .map(|i| format!("\"{}\"", name(i).unwrap_or_default()))
            .collect();
        format!("\"{kind}\":[{}]", list.join(","))
    }
    let species = table("species", SPECIES_VOCAB, |i| {
        let v = PokemonName::from(i as i16);
        (v as i16 as usize == i).then(|| format!("{v:?}"))
    });
    let moves = table("moves", MOVE_VOCAB, |i| {
        let v = Choices::from(i as u16);
        (v as u16 as usize == i).then(|| format!("{v:?}"))
    });
    let items = table("items", 256, |i| {
        let v = Items::from(i as u8);
        (v as u8 as usize == i).then(|| format!("{v:?}"))
    });
    let abilities = table("abilities", 384, |i| {
        let v = Abilities::from(i as i16);
        (v as i16 as usize == i).then(|| format!("{v:?}"))
    });
    let offsets = if gen() == 3 {
        (GEN3_ITEM_OFFSET, GEN3_ABILITY_OFFSET)
    } else {
        (0, 0)
    };
    format!(
        "{{\"gen\":{},\"version\":{VERSION},\"itemOffset\":{},\"abilityOffset\":{},{species},{moves},{items},{abilities}}}",
        gen(),
        offsets.0,
        offsets.1
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_add_up() {
        let state = State::default();
        let f = features(&state);
        assert_eq!(f.floats.len(), FLOATS);
        assert_eq!(f.ids.len(), TOKENS * IDS);
    }
}
