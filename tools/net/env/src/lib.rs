//! Daily Battle's self-play environment (tools/net, plan R1): `n` poke-engine
//! battles stepped in parallel, each side played by the caller (the network).
//!
//! Each battle gives two rows: 2i is side one's view, 2i+1 side two's. A row's
//! observation is features.rs's observation v2 (shared with the WASM, so play
//! sees the same inputs): its own team, only what it has seen of the foe, recent
//! events, and matchups. Actions are 14 slots: moves 0-3, Mega Evolution plus
//! move 4-7, switch to slot 8-13. Chance (rolls, crits, misses) is sampled from
//! the engine's branch odds. Finished battles start over with fresh teams.
//!
//! One build per gen (poke-engine picks its mechanics at compile time):
//! `pe_env_gen3` .. `pe_env_gen6`; see build.ps1.

#[path = "../../../../packages/engine-wasm/rust/src/features.rs"]
#[allow(dead_code)]
mod features;

use features::{effective_speed, hp_frac, mon_ids, observe, Event, Known, IDS, OBS_FLOATS, OBS_IDS};
use numpy::{PyArray1, PyArrayMethods, PyReadonlyArray1};
use poke_engine::engine::generate_instructions::generate_instructions_from_move_pair;
use poke_engine::engine::state::MoveChoice;
use poke_engine::instruction::Instruction;
use poke_engine::mcts::perform_mcts_seeded;
use poke_engine::pokemon::PokemonName;
use poke_engine::state::{LastUsedMove, Pokemon, PokemonIndex, PokemonStatus, SideReference, State};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;
use std::sync::{Arc, Mutex};

pub const ACTIONS: usize = 14;
const MAX_HISTORY: usize = 32;

/// Abilities Showdown announces when their holder switches in.
const ANNOUNCED: &[&str] = &[
    "INTIMIDATE", "DRIZZLE", "DROUGHT", "SANDSTREAM", "SNOWWARNING", "PRESSURE", "MOLDBREAKER",
    "TERAVOLT", "TURBOBLAZE", "UNNERVE", "FRISK", "ANTICIPATION", "FOREWARN", "AIRLOCK",
    "CLOUDNINE", "TRACE", "DOWNLOAD", "IMPOSTER", "SLOWSTART",
];
/// Items, abilities and priority changers that make turn order say nothing
/// plain about Speed: no Speed evidence is taken while either active has one.
const SPEED_ODDITIES: &[&str] = &[
    "IRONBALL", "QUICKCLAW", "LAGGINGTAIL", "FULLINCENSE", "MACHOBRACE", "POWERANKLET",
    "POWERBAND", "POWERBELT", "POWERBRACER", "POWERLENS", "POWERWEIGHT", "QUICKFEET",
    "UNBURDEN", "SLOWSTART", "STALL", "SWIFTSWIM", "CHLOROPHYLL", "SANDRUSH", "SLUSHRUSH",
    "SURGESURFER", "CUSTAPBERRY", "PRANKSTER", "GALEWINGS", "TRIAGE", "QUICKDRAW",
];

static PANICS: Mutex<Vec<String>> = Mutex::new(Vec::new());

// ---- Team catalog ----------------------------------------------------------

struct Pool {
    entries: Vec<(String, String)>,
    /// Cumulative set weights, for sampling.
    cum: Vec<f64>,
}

struct Catalog {
    /// Pool 0 is today's sets; 1.. are varied copies (vary.ts).
    pools: Vec<Pool>,
    base: HashMap<String, [u16; 6]>,
}

impl Catalog {
    fn load(dir: &Path, gen: u8) -> Result<Catalog, String> {
        let read = |name: String| fs::read_to_string(dir.join(&name)).map_err(|e| format!("{name}: {e}"));
        let mut pools: Vec<Pool> = Vec::new();
        for line in read(format!("gen{gen}.tsv"))?.lines().filter(|l| !l.is_empty()) {
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() != 5 {
                return Err(format!("bad catalog line: {line}"));
            }
            let v: usize = f[3].parse().map_err(|_| format!("bad variant: {line}"))?;
            let w: f64 = f[2].parse().map_err(|_| format!("bad weight: {line}"))?;
            while pools.len() <= v {
                pools.push(Pool { entries: Vec::new(), cum: Vec::new() });
            }
            let p = &mut pools[v];
            let total = p.cum.last().copied().unwrap_or(0.0);
            p.entries.push((f[0].to_string(), f[4].to_string()));
            p.cum.push(total + w.max(1e-6));
        }
        let mut base = HashMap::new();
        for line in read(format!("gen{gen}-base.tsv"))?.lines().filter(|l| !l.is_empty()) {
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() != 7 {
                return Err(format!("bad base-stats line: {line}"));
            }
            let mut s = [0u16; 6];
            for i in 0..6 {
                s[i] = f[i + 1].parse().map_err(|_| format!("bad base stat: {line}"))?;
            }
            base.entry(f[0].to_string()).or_insert(s);
        }
        if pools.is_empty() || pools[0].entries.len() < 12 {
            return Err("catalog has too few sets".into());
        }
        Ok(Catalog { pools, base })
    }

    /// Six species-distinct sets, from today's pool or (`varied_share` of teams) one varied copy.
    fn team(&self, rng: &mut SmallRng, varied_share: f64) -> Vec<&str> {
        let v = if self.pools.len() > 1 && rng.random::<f64>() < varied_share {
            rng.random_range(1..self.pools.len())
        } else {
            0
        };
        let pool = &self.pools[v];
        let total = *pool.cum.last().unwrap();
        let mut species: Vec<&str> = Vec::with_capacity(6);
        let mut team = Vec::with_capacity(6);
        while team.len() < 6 {
            let r = rng.random::<f64>() * total;
            let i = pool.cum.partition_point(|&c| c <= r).min(pool.entries.len() - 1);
            let (s, mon) = &pool.entries[i];
            if !species.contains(&s.as_str()) {
                species.push(s);
                team.push(mon.as_str());
            }
        }
        team
    }

    fn base_of(&self, p: &Pokemon) -> [u16; 6] {
        self.base.get(&format!("{:?}", p.id)).copied().unwrap_or([80; 6])
    }
}

fn side_string(team: &[&str]) -> String {
    let mut parts: Vec<String> = team.iter().map(|s| s.to_string()).collect();
    // Slot 1 starts "active" so the first step can switch both leads in, which
    // fires their switch-in abilities (Intimidate, Drizzle).
    parts.push("1".into());
    parts.push(vec!["0"; 19].join(";"));
    parts.push(String::new());
    parts.push("0;0;0;0;0;0".into());
    parts.extend(std::iter::repeat("0".to_string()).take(12));
    parts.extend(["false", "NONE", "false", "false", "false", "switch:0", "false"].map(String::from));
    parts.join("=")
}

// ---- One battle ------------------------------------------------------------

fn side_index(r: &SideReference) -> usize {
    match r {
        SideReference::SideOne => 0,
        SideReference::SideTwo => 1,
    }
}

fn slot_of(c: &MoveChoice) -> Option<usize> {
    #[allow(unreachable_patterns)]
    match c {
        MoveChoice::Move(i) => Some(*i as usize),
        #[cfg(not(feature = "gen3"))]
        MoveChoice::MoveMega(i) => Some(4 + *i as usize),
        MoveChoice::Switch(p) => Some(8 + *p as usize),
        _ => None,
    }
}

#[derive(Default, Clone, Copy)]
struct Counters {
    games: u64,
    side_one_wins: u64,
    draws: u64,
    turns: u64,
    decisions: u64,
    illegal: u64,
    panics: u64,
    stuck: u64,
    unknown_base: u64,
    speed_evidence: u64,
}

struct Game {
    state: State,
    turn: u32,
    /// `known[v][i]`: what side v knows of the foe's slot i.
    known: [[Known; 6]; 2],
    /// Each side's Pokémon forms, to notice Mega Evolution and other forme changes.
    names: [[PokemonName; 6]; 2],
    history: Vec<Event>,
    options: [Vec<MoveChoice>; 2],
    rng: SmallRng,
    c: Counters,
    obs: [features::Features; 2],
}

impl Game {
    fn new(cat: &Catalog, seed: u64, varied_share: f64) -> Game {
        let mut g = Game {
            state: State::default(),
            turn: 0,
            known: [[Known::default(); 6]; 2],
            names: [[PokemonName::NONE; 6]; 2],
            history: Vec::with_capacity(MAX_HISTORY),
            options: [Vec::new(), Vec::new()],
            rng: SmallRng::seed_from_u64(seed),
            c: Counters::default(),
            obs: [empty_features(), empty_features()],
        };
        g.reset(cat, varied_share);
        g
    }

    fn reset(&mut self, cat: &Catalog, varied_share: f64) {
        let t1 = cat.team(&mut self.rng, varied_share);
        let t2 = cat.team(&mut self.rng, varied_share);
        let s = format!("{}/{}/NONE;0/NONE;0/false;0/false", side_string(&t1), side_string(&t2));
        self.state = State::deserialize(&s);
        self.turn = 0;
        self.history.clear();
        for side in 0..2 {
            let pk = if side == 0 { &self.state.side_one.pokemon } else { &self.state.side_two.pokemon };
            for i in 0..6 {
                let p = &pk.pkmn[i];
                self.names[side][i] = p.id;
                if !cat.base.contains_key(&format!("{:?}", p.id)) {
                    self.c.unknown_base += 1;
                }
                self.known[1 - side][i] = Known::unrevealed(cat.base_of(p));
            }
        }
        self.advance(cat, MoveChoice::Switch(PokemonIndex::P0), MoveChoice::Switch(PokemonIndex::P0), false);
        self.refresh();
    }

    fn side(&self, s: usize) -> &poke_engine::state::Side {
        if s == 0 {
            &self.state.side_one
        } else {
            &self.state.side_two
        }
    }

    fn needs(&self, s: usize) -> bool {
        self.options[s].iter().any(|c| slot_of(c).is_some())
    }

    fn refresh(&mut self) {
        let (a, b) = self.state.root_get_all_options();
        self.options = [a, b];
        for v in 0..2 {
            self.obs[v] = observe(&self.state, v == 0, &self.known[v], &self.history, self.turn);
        }
    }

    fn choose(&mut self, s: usize, action: i64) -> MoveChoice {
        if !self.needs(s) {
            return MoveChoice::None;
        }
        let pick = self.options[s].iter().find(|c| slot_of(c) == Some(action as usize)).copied();
        self.c.decisions += 1;
        pick.unwrap_or_else(|| {
            self.c.illegal += 1;
            *self.options[s].iter().find(|c| slot_of(c).is_some()).unwrap()
        })
    }

    /// Whether this turn's order can tell the viewer `v` something about the foe's Speed.
    fn speed_evidence_ok(&self, c: [&MoveChoice; 2]) -> bool {
        let st = &self.state;
        if st.trick_room.active || st.weather.weather_type as u8 != 0 {
            return false;
        }
        let mut priority = [0i8; 2];
        for s in 0..2 {
            let side = self.side(s);
            // Mega Evolution turns: turn order uses the pre-Mega Speed in some gens.
            if matches!(slot_of(c[s]), Some(4..=7)) {
                return false;
            }
            let MoveChoice::Move(i) = c[s] else { return false };
            let p = side.get_active_immutable();
            if side.speed_boost != 0 || p.status == PokemonStatus::PARALYZE || side.side_conditions.tailwind > 0 {
                return false;
            }
            for name in [format!("{:?}", p.item), format!("{:?}", p.ability)] {
                if SPEED_ODDITIES.contains(&name.as_str()) {
                    return false;
                }
            }
            priority[s] = p.moves[i].choice.priority;
        }
        priority[0] == priority[1]
    }

    /// Plays one step and updates what each side knows. `count` is false for the leads coming in.
    fn advance(&mut self, cat: &Catalog, c0: MoveChoice, c1: MoveChoice, count: bool) {
        let normal_turn = !self.state.side_one.force_switch && !self.state.side_two.force_switch;
        let evidence = count && self.speed_evidence_ok([&c0, &c1]);
        let pre_active = [self.side(0).active_index as usize, self.side(1).active_index as usize];
        let pre_speed = [0, 1].map(|s| effective_speed(self.side(s).get_active_immutable()));

        let mut branches = generate_instructions_from_move_pair(&mut self.state, &c0, &c1, true);
        let total: f32 = branches.iter().map(|b| b.percentage.max(0.0)).sum();
        let mut r = self.rng.random::<f32>() * total;
        let mut pick = branches.len() - 1;
        for (i, b) in branches.iter().enumerate() {
            r -= b.percentage.max(0.0);
            if r <= 0.0 {
                pick = i;
                break;
            }
        }
        let chosen = branches.swap_remove(pick);
        self.state.apply_instructions(&chosen.instruction_list);
        if count && normal_turn {
            self.turn += 1;
        }

        let mut active = pre_active;
        let mut first: Option<usize> = None;
        let mut moved = [false; 2];
        let mut healed = [false; 2];
        let mut hurt = [false; 2];
        let mut orb_status = [false; 2];
        let mut contact = [false; 2];
        let mut item_changed = [false; 2];
        let mega_choice = [&c0, &c1].map(|c| matches!(slot_of(c), Some(4..=7)));
        let mut events: Vec<Event> = Vec::new();
        for ins in &chosen.instruction_list {
            match ins {
                Instruction::Switch(sw) => {
                    let s = side_index(&sw.side_ref);
                    let slot = sw.next_index as usize;
                    active[s] = slot;
                    let p = &self.side(s).pokemon.pkmn[slot];
                    let announced = ANNOUNCED.contains(&format!("{:?}", p.ability).as_str());
                    let species = mon_ids(p)[0];
                    let k = &mut self.known[1 - s][slot];
                    k.seen = true;
                    k.ability |= announced;
                    events.push(Event { kind: 2, by_side_one: s == 0, turn: self.turn, species, ..Default::default() });
                }
                Instruction::SetLastUsedMove(m) => {
                    if let LastUsedMove::Move(mi) = m.last_used_move {
                        let s = side_index(&m.side_ref);
                        let p = &self.side(s).pokemon.pkmn[active[s]];
                        contact[s] |= p.moves[&mi].choice.flags.contact;
                        let ids = mon_ids(p);
                        self.known[1 - s][active[s]].moves[mi as usize] = true;
                        first.get_or_insert(s);
                        moved[s] = true;
                        events.push(Event {
                            kind: 1,
                            by_side_one: s == 0,
                            turn: self.turn,
                            species: ids[0],
                            mv: ids[3 + mi as usize],
                            mega: mega_choice[s],
                            ..Default::default()
                        });
                    }
                }
                Instruction::ChangeItem(ci) => {
                    let s = side_index(&ci.side_ref);
                    let k = &mut self.known[1 - s][active[s]];
                    k.item = true;
                    k.reset_speed();
                    item_changed[s] = true;
                }
                Instruction::ChangeAbility(ca) | Instruction::ChangeBaseAbility(ca) => {
                    let s = side_index(&ca.side_ref);
                    self.known[1 - s][active[s]].ability = true;
                }
                Instruction::ToggleMegaEvolved(t) => {
                    let s = side_index(&t.side_ref);
                    self.known[1 - s][active[s]].item = true;
                }
                Instruction::Heal(h) => healed[side_index(&h.side_ref)] = true,
                Instruction::Damage(d) => hurt[side_index(&d.side_ref)] = true,
                Instruction::ChangeStatus(cs) => {
                    let s = side_index(&cs.side_ref);
                    if cs.pokemon_index as usize == active[s] && matches!(cs.new_status, PokemonStatus::BURN | PokemonStatus::TOXIC) {
                        orb_status[s] = true;
                    }
                }
                _ => {}
            }
        }

        // Items the battle log names at the end of a turn or on contact.
        for s in 0..2 {
            let item = format!("{:?}", self.side(s).pokemon.pkmn[active[s]].item);
            let shown = match item.as_str() {
                "LEFTOVERS" | "BLACKSLUDGE" => healed[s],
                "LIFEORB" => moved[s] && hurt[s],
                "SHELLBELL" => moved[s] && healed[s],
                "FLAMEORB" | "TOXICORB" => orb_status[s],
                "ROCKYHELMET" => contact[1 - s] && hurt[1 - s],
                _ => false,
            };
            if shown {
                self.known[1 - s][active[s]].item = true;
            }
        }

        // Forme changes (Mega Evolution): new base stats.
        for s in 0..2 {
            for i in 0..6 {
                let p = &self.side(s).pokemon.pkmn[i];
                if p.id != self.names[s][i] {
                    let (id, base) = (p.id, cat.base_of(p));
                    self.names[s][i] = id;
                    self.known[1 - s][i].set_base(base);
                }
            }
        }

        // Turn order: who moved first, with equal priority, tells each side about the other's Speed.
        if evidence && moved[0] && moved[1] {
            if let Some(f) = first {
                self.c.speed_evidence += 1;
                for v in 0..2 {
                    let foe = 1 - v;
                    // Trick and the like this turn: the order came from its old item.
                    if !item_changed[foe] {
                        self.known[v][pre_active[foe]].observe_speed(f == foe, pre_speed[v]);
                    }
                }
            }
        }

        let hp = [0, 1].map(|s| hp_frac(self.side(s).get_active_immutable()));
        for mut e in events {
            e.hp_one = hp[0];
            e.hp_two = hp[1];
            self.history.push(e);
        }
        if self.history.len() > MAX_HISTORY {
            self.history.drain(..self.history.len() - MAX_HISTORY);
        }
    }

    /// One step. Returns side one's result (1 win, 0 loss, 0.5 draw) if the battle ended.
    fn step(&mut self, cat: &Catalog, a0: i64, a1: i64, turn_cap: u32) -> Option<f32> {
        let c0 = self.choose(0, a0);
        let c1 = self.choose(1, a1);
        self.advance(cat, c0, c1, true);
        let over = self.state.battle_is_over();
        if over != 0.0 {
            return Some(if over > 0.0 { 1.0 } else { 0.0 });
        }
        if self.turn >= turn_cap {
            return Some(0.5);
        }
        self.refresh();
        if !self.needs(0) && !self.needs(1) {
            self.c.stuck += 1;
            return Some(0.5);
        }
        None
    }
}

fn empty_features() -> features::Features {
    features::Features { floats: vec![0.0; OBS_FLOATS], ids: vec![0; OBS_IDS] }
}

// ---- Python ----------------------------------------------------------------

/// `n` battles in parallel; see the module docs.
#[pyclass]
struct VecEnv {
    games: Vec<Game>,
    cat: Arc<Catalog>,
    varied_share: f64,
    turn_cap: u32,
}

#[pymethods]
impl VecEnv {
    #[new]
    #[pyo3(signature = (n, seed, catalog_dir, varied_share = 0.3, turn_cap = 150))]
    fn new(py: Python<'_>, n: usize, seed: u64, catalog_dir: &str, varied_share: f64, turn_cap: u32) -> PyResult<Self> {
        let cat = Arc::new(Catalog::load(Path::new(catalog_dir), features::gen()).map_err(PyValueError::new_err)?);
        let games = py.allow_threads(|| {
            (0..n)
                .into_par_iter()
                .map(|i| Game::new(&cat, seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(i as u64), varied_share))
                .collect()
        });
        Ok(VecEnv { games, cat, varied_share, turn_cap })
    }

    /// Battles in flight.
    #[getter]
    fn n(&self) -> usize {
        self.games.len()
    }

    /// Each row's observation: floats [2n, OBS_FLOATS], ids [2n, OBS_IDS] (u16),
    /// legal-action mask [2n, 14], and whether the row must act [2n].
    fn observe<'py>(
        &self,
        py: Python<'py>,
    ) -> PyResult<(Bound<'py, PyAny>, Bound<'py, PyAny>, Bound<'py, PyAny>, Bound<'py, PyArray1<bool>>)> {
        let rows = 2 * self.games.len();
        let (floats, ids, mask, needs) = py.allow_threads(|| {
            let mut floats = vec![0f32; rows * OBS_FLOATS];
            let mut ids = vec![0u16; rows * OBS_IDS];
            let mut mask = vec![false; rows * ACTIONS];
            let mut needs = vec![false; rows];
            floats
                .par_chunks_mut(2 * OBS_FLOATS)
                .zip(ids.par_chunks_mut(2 * OBS_IDS))
                .zip(mask.par_chunks_mut(2 * ACTIONS))
                .zip(needs.par_chunks_mut(2))
                .zip(self.games.par_iter())
                .for_each(|((((f, i), m), nd), g)| {
                    for v in 0..2 {
                        f[v * OBS_FLOATS..(v + 1) * OBS_FLOATS].copy_from_slice(&g.obs[v].floats);
                        i[v * OBS_IDS..(v + 1) * OBS_IDS].copy_from_slice(&g.obs[v].ids);
                        for c in &g.options[v] {
                            if let Some(a) = slot_of(c) {
                                m[v * ACTIONS + a] = true;
                            }
                        }
                        nd[v] = g.needs(v);
                    }
                });
            (floats, ids, mask, needs)
        });
        Ok((
            PyArray1::from_vec(py, floats).reshape([rows, OBS_FLOATS])?.into_any(),
            PyArray1::from_vec(py, ids).reshape([rows, OBS_IDS])?.into_any(),
            PyArray1::from_vec(py, mask).reshape([rows, ACTIONS])?.into_any(),
            PyArray1::from_vec(py, needs),
        ))
    }

    /// Plays one step in every battle with `actions` [2n] (ignored for rows that
    /// needn't act). Returns each row's reward [2n] (1 win, 0 loss, 0.5 draw, only
    /// when its battle ended) and done [2n]. Ended battles restart.
    fn step<'py>(
        &mut self,
        py: Python<'py>,
        actions: PyReadonlyArray1<'py, i64>,
    ) -> PyResult<(Bound<'py, PyArray1<f32>>, Bound<'py, PyArray1<bool>>)> {
        let actions = actions.as_slice()?.to_vec();
        if actions.len() != 2 * self.games.len() {
            return Err(PyValueError::new_err("actions must have 2n entries"));
        }
        let (cat, varied, cap) = (self.cat.clone(), self.varied_share, self.turn_cap);
        let games = &mut self.games;
        let (rewards, dones) = py.allow_threads(move || {
            let mut rewards = vec![0f32; actions.len()];
            let mut dones = vec![false; actions.len()];
            games
                .par_iter_mut()
                .zip(actions.par_chunks(2))
                .zip(rewards.par_chunks_mut(2))
                .zip(dones.par_chunks_mut(2))
                .for_each(|(((g, a), r), d)| {
                    let result = catch_unwind(AssertUnwindSafe(|| g.step(&cat, a[0], a[1], cap)));
                    let end = match result {
                        Ok(end) => end,
                        Err(_) => {
                            g.c.panics += 1;
                            Some(0.5)
                        }
                    };
                    if let Some(one) = end {
                        r[0] = one;
                        r[1] = 1.0 - one;
                        d[0] = true;
                        d[1] = true;
                        g.c.games += 1;
                        g.c.turns += g.turn as u64;
                        if one == 1.0 {
                            g.c.side_one_wins += 1;
                        } else if one == 0.5 {
                            g.c.draws += 1;
                        }
                        for _ in 0..3 {
                            if catch_unwind(AssertUnwindSafe(|| g.reset(&cat, varied))).is_ok() {
                                break;
                            }
                            g.c.panics += 1;
                        }
                    }
                });
            (rewards, dones)
        });
        Ok((PyArray1::from_vec(py, rewards), PyArray1::from_vec(py, dones)))
    }

    /// Each row's foe team as embedding ids [2n, 6 * 7] (species, item, ability,
    /// 4 moves per slot): targets for the set heads.
    fn truth<'py>(&self, py: Python<'py>) -> PyResult<Bound<'py, PyAny>> {
        let rows = 2 * self.games.len();
        let mut out = vec![0u16; rows * 6 * IDS];
        out.par_chunks_mut(2 * 6 * IDS).zip(self.games.par_iter()).for_each(|(o, g)| {
            for v in 0..2 {
                let foe = g.side(1 - v);
                for i in 0..6 {
                    let at = (v * 6 + i) * IDS;
                    o[at..at + IDS].copy_from_slice(&mon_ids(&foe.pokemon.pkmn[i]));
                }
            }
        });
        Ok(PyArray1::from_vec(py, out).reshape([rows, 6 * IDS])?.into_any())
    }

    /// Totals since the start: games, wins, draws, turns, decisions, illegal actions, panics, ...
    fn stats(&self) -> HashMap<&'static str, u64> {
        let mut t = Counters::default();
        for g in &self.games {
            let c = g.c;
            t.games += c.games;
            t.side_one_wins += c.side_one_wins;
            t.draws += c.draws;
            t.turns += c.turns;
            t.decisions += c.decisions;
            t.illegal += c.illegal;
            t.panics += c.panics;
            t.stuck += c.stuck;
            t.unknown_base += c.unknown_base;
            t.speed_evidence += c.speed_evidence;
        }
        HashMap::from([
            ("games", t.games),
            ("side_one_wins", t.side_one_wins),
            ("draws", t.draws),
            ("turns", t.turns),
            ("decisions", t.decisions),
            ("illegal", t.illegal),
            ("panics", t.panics),
            ("stuck", t.stuck),
            ("unknown_base", t.unknown_base),
            ("speed_evidence", t.speed_evidence),
        ])
    }

    /// One battle's state string, for debugging.
    fn state(&self, i: usize) -> PyResult<String> {
        self.games.get(i).map(|g| g.state.serialize()).ok_or_else(|| PyValueError::new_err("no such battle"))
    }

    /// Full-information MCTS picks ("Hard-proxy"): for each row (battle row / 2,
    /// side row % 2) that must act, poke-engine's MCTS on the true state for
    /// `iterations`, and the most-visited option of that side. Returns actions [len]
    /// (0 for rows that needn't act).
    fn mcts_actions<'py>(
        &self,
        py: Python<'py>,
        rows: Vec<usize>,
        iterations: u32,
        seed: u64,
    ) -> PyResult<Bound<'py, PyArray1<i64>>> {
        if rows.iter().any(|&r| r / 2 >= self.games.len()) {
            return Err(PyValueError::new_err("row out of range"));
        }
        let games = &self.games;
        let out: Vec<i64> = py.allow_threads(|| {
            rows.par_iter()
                .enumerate()
                .map(|(k, &r)| {
                    let (g, side) = (&games[r / 2], r % 2);
                    if !g.needs(side) {
                        return 0;
                    }
                    let res = catch_unwind(AssertUnwindSafe(|| {
                        let mut state = g.state.clone();
                        let (s1, s2) = state.root_get_all_options();
                        let s = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(k as u64);
                        let result = perform_mcts_seeded(&mut state, s1, s2, iterations, s);
                        let list = if side == 0 { result.s1 } else { result.s2 };
                        list.iter()
                            .filter_map(|o| slot_of(&o.move_choice).map(|a| (o.visits, a)))
                            .max()
                            .map(|(_, a)| a as i64)
                    }));
                    match res {
                        Ok(Some(a)) => a,
                        _ => g.options[side].iter().find_map(slot_of).unwrap_or(0) as i64,
                    }
                })
                .collect()
        });
        Ok(PyArray1::from_vec(py, out))
    }

    /// Observations of standalone engine states, side one deciding (the warm start's
    /// recorded positions). Conservative knowledge: of the foe only the active and
    /// fainted Pokémon count as seen, with no moves, item or ability revealed, Speed
    /// from the base-stat prior, and no history. Returns floats [k, OBS_FLOATS],
    /// ids [k, OBS_IDS] and side one's legal mask [k, 14]; a state that fails to
    /// load gets an all-false mask.
    fn observe_states<'py>(
        &self,
        py: Python<'py>,
        states: Vec<String>,
        turns: Vec<u32>,
    ) -> PyResult<(Bound<'py, PyAny>, Bound<'py, PyAny>, Bound<'py, PyAny>)> {
        if states.len() != turns.len() {
            return Err(PyValueError::new_err("states and turns differ in length"));
        }
        let k = states.len();
        let cat = self.cat.clone();
        let (floats, ids, mask) = py.allow_threads(move || {
            let mut floats = vec![0f32; k * OBS_FLOATS];
            let mut ids = vec![0u16; k * OBS_IDS];
            let mut mask = vec![false; k * ACTIONS];
            floats
                .par_chunks_mut(OBS_FLOATS)
                .zip(ids.par_chunks_mut(OBS_IDS))
                .zip(mask.par_chunks_mut(ACTIONS))
                .zip(states.par_iter().zip(turns.par_iter()))
                .for_each(|(((f, i), m), (s, &turn))| {
                    let r = catch_unwind(AssertUnwindSafe(|| {
                        let state = State::deserialize(s);
                        let foe = &state.side_two;
                        let active = foe.active_index as usize;
                        let mut known = [Known::default(); 6];
                        for (j, kn) in known.iter_mut().enumerate() {
                            let p = &foe.pokemon.pkmn[j];
                            *kn = Known::unrevealed(cat.base_of(p));
                            kn.seen = j == active || (p.hp <= 0 && p.id != PokemonName::NONE);
                        }
                        let obs = observe(&state, true, &known, &[], turn);
                        let (opts, _) = state.root_get_all_options();
                        (obs, opts)
                    }));
                    if let Ok((obs, opts)) = r {
                        f.copy_from_slice(&obs.floats);
                        i.copy_from_slice(&obs.ids);
                        for c in &opts {
                            if let Some(a) = slot_of(c) {
                                m[a] = true;
                            }
                        }
                    }
                });
            (floats, ids, mask)
        });
        Ok((
            PyArray1::from_vec(py, floats).reshape([k, OBS_FLOATS])?.into_any(),
            PyArray1::from_vec(py, ids).reshape([k, OBS_IDS])?.into_any(),
            PyArray1::from_vec(py, mask).reshape([k, ACTIONS])?.into_any(),
        ))
    }
}

/// Observation layout, for the model.
fn dims() -> HashMap<&'static str, usize> {
    use features::*;
    HashMap::from([
        ("gen", gen() as usize),
        ("version", OBS_VERSION as usize),
        ("floats", OBS_FLOATS),
        ("ids", OBS_IDS),
        ("tokens", TOKENS),
        ("mon_f", MON2_F),
        ("mon_base", MON2_BASE),
        ("move_f", MOVE2_F),
        ("mon_ids", IDS),
        ("field_f", FIELD_F),
        ("hist", HIST),
        ("hist_f", HIST_F),
        ("hist_ids", HIST_IDS),
        ("match", MATCH),
        ("match_f", MATCH_F),
        ("actions", ACTIONS),
        ("species_vocab", SPECIES_VOCAB),
        ("move_vocab", MOVE_VOCAB),
        ("item_vocab", ITEM_VOCAB),
        ("ability_vocab", ABILITY_VOCAB),
    ])
}

#[pyfunction]
#[pyo3(name = "dims")]
fn py_dims() -> HashMap<&'static str, usize> {
    dims()
}

/// The first panic messages seen (they're caught; the battle is scored a draw and restarts).
#[pyfunction]
fn panic_messages() -> Vec<String> {
    PANICS.lock().map(|p| p.clone()).unwrap_or_default()
}

/// Names by embedding id for this gen's build: {species, moves, items, abilities}.
#[pyfunction]
fn names_json() -> String {
    features::names_json()
}

fn init(m: &Bound<'_, PyModule>) -> PyResult<()> {
    std::panic::set_hook(Box::new(|info| {
        if let Ok(mut p) = PANICS.lock() {
            if p.len() < 20 {
                p.push(info.to_string());
            }
        }
    }));
    m.add_class::<VecEnv>()?;
    m.add_function(wrap_pyfunction!(py_dims, m)?)?;
    m.add_function(wrap_pyfunction!(panic_messages, m)?)?;
    m.add_function(wrap_pyfunction!(names_json, m)?)?;
    Ok(())
}

macro_rules! module {
    ($feature:literal, $name:ident) => {
        #[cfg(feature = $feature)]
        #[pymodule]
        fn $name(m: &Bound<'_, PyModule>) -> PyResult<()> {
            init(m)
        }
    };
}
module!("gen3", pe_env_gen3);
module!("gen4", pe_env_gen4);
module!("gen5", pe_env_gen5);
module!("gen6", pe_env_gen6);
