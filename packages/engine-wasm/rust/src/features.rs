//! The value network's input features (tools/net): a poke-engine `State`, seen
//! from side one, as 13 tokens. Training (the native `featurize` binary) and
//! play (the WASM) share this code, so the two can't drift apart.
//!
//! Tokens: 12 Pokémon (side one's six, then side two's, in slot order), each
//! `MON_F` floats plus `IDS` embedding ids; and one field token, `FIELD_F`
//! floats (weather, terrain, each side's conditions and its active Pokémon's
//! boosts and volatile statuses, and the gen). Bump `VERSION` whenever a
//! feature changes meaning; append rather than reorder.

use poke_engine::choices::MoveCategory;
use poke_engine::engine::generate_instructions::calculate_both_damage_rolls;
use poke_engine::state::{Pokemon, PokemonStatus, Side, State};

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
