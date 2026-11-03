//! A raw-ABI WebAssembly wrapper around poke-engine for Daily Battle's Hard AI.
//!
//! No wasm-bindgen and no imports: the host copies a UTF-8 string into memory
//! from `alloc`, calls an export, and reads the UTF-8 result from
//! `out_ptr`/`out_len`. A panic writes its message to the same buffer and then
//! traps; the host catches the trap and throws away the instance.

use poke_engine::choices::{Choices, MOVES};
use poke_engine::engine::abilities::Abilities;
use poke_engine::engine::generate_instructions::calculate_both_damage_rolls;
use poke_engine::engine::items::Items;
use poke_engine::engine::state::MoveChoice;
use poke_engine::mcts::{perform_mcts_seeded, MctsSideResult};
use poke_engine::pokemon::PokemonName;
use poke_engine::state::State;
use std::fmt::Write;
use std::str::FromStr;

pub mod features;
pub mod net;
pub mod search;

static mut OUT: Vec<u8> = Vec::new();

fn set_out(s: String) {
    unsafe {
        let out = &mut *std::ptr::addr_of_mut!(OUT);
        *out = s.into_bytes();
    }
}

fn input(ptr: *mut u8, len: usize) -> String {
    let bytes = unsafe { Vec::from_raw_parts(ptr, len, len) };
    String::from_utf8(bytes).unwrap_or_default()
}

fn install_panic_hook() {
    static mut INSTALLED: bool = false;
    unsafe {
        if INSTALLED {
            return;
        }
        INSTALLED = true;
    }
    std::panic::set_hook(Box::new(|info| set_out(format!("panic: {}", info))));
}

/// Allocates `len` bytes for an input string. Ownership passes back to Rust on the next call.
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    unsafe { (*std::ptr::addr_of!(OUT)).as_ptr() }
}

#[no_mangle]
pub extern "C" fn out_len() -> usize {
    unsafe { (*std::ptr::addr_of!(OUT)).len() }
}

/// Bumped when the wrapper's behavior changes; the AI records it in the engine version.
/// 2: the TS wrapper sets tuned boost weights (DEFAULT_BOOST_EVAL) on every instance.
#[no_mangle]
pub extern "C" fn version() -> u32 {
    2
}

/// Sets the evaluation's stat-boost weights for this instance (see poke-engine's
/// `eval_params`): `scale` multiplies boosts' value; `curve` bit 1 values stages
/// linearly, bit 2 applies the tuning to side two only. (1.0, 0) is upstream's
/// evaluation.
#[no_mangle]
pub extern "C" fn set_boost_eval(scale: f32, curve: u32) {
    poke_engine::eval_params::set_boost_eval(scale, curve);
}

// Gen 1-3 engines have no Mega, Tera, or Team Preview choices.
#[cfg(any(feature = "gen3"))]
fn choice_key(c: &MoveChoice) -> String {
    match c {
        MoveChoice::Move(i) => format!("move:{}", *i as u8),
        MoveChoice::Switch(i) => format!("switch:{}", *i as u8),
        MoveChoice::None => "none".to_string(),
    }
}

#[cfg(not(any(feature = "gen3")))]
fn choice_key(c: &MoveChoice) -> String {
    match c {
        MoveChoice::Move(i) => format!("move:{}", *i as u8),
        MoveChoice::MoveMega(i) => format!("mega:{}", *i as u8),
        MoveChoice::MoveTera(i) => format!("tera:{}", *i as u8),
        MoveChoice::Switch(i) => format!("switch:{}", *i as u8),
        MoveChoice::TeamPreview(..) => "preview".to_string(),
        MoveChoice::None => "none".to_string(),
    }
}

fn side_json(out: &mut String, side: &[MctsSideResult]) {
    out.push('[');
    for (i, r) in side.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let _ = write!(
            out,
            "{{\"c\":\"{}\",\"v\":{},\"s\":{}}}",
            choice_key(&r.move_choice),
            r.visits,
            if r.total_score.is_finite() { r.total_score } else { 0.0 }
        );
    }
    out.push(']');
}

/// Seeded MCTS from a serialized state for exactly `iterations` iterations.
/// Side one is the searching side. Output: `{"n":…,"s1":[{c,v,s}…],"s2":[…]}`
/// where `c` is `move:I`, `mega:I`, `switch:I`, or `none`.
#[no_mangle]
pub extern "C" fn search(ptr: *mut u8, len: usize, iterations: u32, seed_lo: u32, seed_hi: u32) {
    install_panic_hook();
    let serialized = input(ptr, len);
    let mut state = State::deserialize(&serialized);
    let (s1, s2) = state.root_get_all_options();
    let seed = ((seed_hi as u64) << 32) | seed_lo as u64;
    let result = perform_mcts_seeded(&mut state, s1, s2, iterations, seed);
    let mut out = String::with_capacity(512);
    let _ = write!(out, "{{\"n\":{},\"s1\":", result.iteration_count);
    side_json(&mut out, &result.s1);
    out.push_str(",\"s2\":");
    side_json(&mut out, &result.s2);
    out.push('}');
    set_out(out);
}

/// Like `search`, but side one is held to its root option number `option` (an
/// index into the root options, in `options` order), so that one option gets
/// every iteration. The coach compares two choices this way: each is valued
/// against the foe's best replies with the same effort (DESIGN.md §22).
#[no_mangle]
pub extern "C" fn search_fixed(
    ptr: *mut u8,
    len: usize,
    iterations: u32,
    seed_lo: u32,
    seed_hi: u32,
    option: u32,
) {
    install_panic_hook();
    let serialized = input(ptr, len);
    let mut state = State::deserialize(&serialized);
    let (s1, s2) = state.root_get_all_options();
    let only = s1
        .into_iter()
        .nth(option as usize)
        .expect("search_fixed: no such side one option");
    let seed = ((seed_hi as u64) << 32) | seed_lo as u64;
    let result = perform_mcts_seeded(&mut state, vec![only], s2, iterations, seed);
    let mut out = String::with_capacity(512);
    let _ = write!(out, "{{\"n\":{},\"s1\":", result.iteration_count);
    side_json(&mut out, &result.s1);
    out.push_str(",\"s2\":");
    side_json(&mut out, &result.s2);
    out.push('}');
    set_out(out);
}

/// Like `search`, with both sides held to one root option each (indexes in
/// `options` order): the value of that pair of choices, played out by MCTS
/// from the next turn on. The coach fills its option-by-reply table this way.
#[no_mangle]
pub extern "C" fn search_pair(
    ptr: *mut u8,
    len: usize,
    iterations: u32,
    seed_lo: u32,
    seed_hi: u32,
    option1: u32,
    option2: u32,
) {
    install_panic_hook();
    let serialized = input(ptr, len);
    let mut state = State::deserialize(&serialized);
    let (s1, s2) = state.root_get_all_options();
    let one = s1
        .into_iter()
        .nth(option1 as usize)
        .expect("search_pair: no such side one option");
    let two = s2
        .into_iter()
        .nth(option2 as usize)
        .expect("search_pair: no such side two option");
    let seed = ((seed_hi as u64) << 32) | seed_lo as u64;
    let result = perform_mcts_seeded(&mut state, vec![one], vec![two], iterations, seed);
    let mut out = String::with_capacity(128);
    let _ = write!(out, "{{\"n\":{},\"s1\":", result.iteration_count);
    side_json(&mut out, &result.s1);
    out.push_str(",\"s2\":");
    side_json(&mut out, &result.s2);
    out.push('}');
    set_out(out);
}

/// Like `search`, with side one limited to the root options whose bits are set
/// in `mask` (bit I is option I in `options` order; options past 32 are always
/// kept). The coach narrows its candidates this way between rounds, so the
/// budget goes to the contenders while the foe still replies blind.
#[no_mangle]
pub extern "C" fn search_subset(
    ptr: *mut u8,
    len: usize,
    iterations: u32,
    seed_lo: u32,
    seed_hi: u32,
    mask: u32,
) {
    install_panic_hook();
    let serialized = input(ptr, len);
    let mut state = State::deserialize(&serialized);
    let (s1, s2) = state.root_get_all_options();
    let kept: Vec<MoveChoice> = s1
        .into_iter()
        .enumerate()
        .filter(|(i, _)| *i >= 32 || mask & (1 << i) != 0)
        .map(|(_, c)| c)
        .collect();
    assert!(!kept.is_empty(), "search_subset: empty mask");
    let seed = ((seed_hi as u64) << 32) | seed_lo as u64;
    let result = perform_mcts_seeded(&mut state, kept, s2, iterations, seed);
    let mut out = String::with_capacity(512);
    let _ = write!(out, "{{\"n\":{},\"s1\":", result.iteration_count);
    side_json(&mut out, &result.s1);
    out.push_str(",\"s2\":");
    side_json(&mut out, &result.s2);
    out.push('}');
    set_out(out);
}

/// Exhaustive expectiminimax to a fixed `depth` (turns), for endgames: every
/// pair of root options, with chance branches weighted exactly and later turns
/// solved as each side's safest choice. Deterministic. Output:
/// `{"s1":[c…],"s2":[c…],"m":[…]}` with `m` row-major (side one's options by
/// side two's), in the evaluation's units, from side one's view.
#[no_mangle]
pub extern "C" fn endgame(ptr: *mut u8, len: usize, depth: u32) {
    install_panic_hook();
    let mut state = State::deserialize(&input(ptr, len));
    let (s1, s2) = state.root_get_all_options();
    let keys1: Vec<String> = s1.iter().map(choice_key).collect();
    let keys2: Vec<String> = s2.iter().map(choice_key).collect();
    let go = std::sync::Arc::new(std::sync::Mutex::new(true));
    let m = poke_engine::search::expectiminimax_search(
        &mut state,
        depth.clamp(1, 6) as i8,
        s1,
        s2,
        false,
        &go,
    );
    let list = |keys: &[String]| {
        keys.iter()
            .map(|k| format!("\"{}\"", k))
            .collect::<Vec<_>>()
            .join(",")
    };
    let cells: Vec<String> = m
        .iter()
        .map(|x| if x.is_finite() { x.to_string() } else { "0".to_string() })
        .collect();
    set_out(format!(
        "{{\"s1\":[{}],\"s2\":[{}],\"m\":[{}]}}",
        list(&keys1),
        list(&keys2),
        cells.join(",")
    ));
}

/// The root options for both sides, one per line: `s1 move:0`, `s2 switch:3`, ….
#[no_mangle]
pub extern "C" fn options(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let state = State::deserialize(&input(ptr, len));
    let (s1, s2) = state.root_get_all_options();
    let mut out = String::new();
    for c in &s1 {
        let _ = writeln!(out, "s1 {}", choice_key(c));
    }
    for c in &s2 {
        let _ = writeln!(out, "s2 {}", choice_key(c));
    }
    set_out(out);
}

/// Deserializes and serializes a state, so the host can see what the engine understood.
#[no_mangle]
pub extern "C" fn roundtrip(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let state = State::deserialize(&input(ptr, len));
    set_out(state.serialize());
}

fn known(kind: &str, name: &str) -> bool {
    match kind {
        "species" => PokemonName::from_str(name).map_or(false, |x| x != PokemonName::NONE),
        "move" => Choices::from_str(name).map_or(false, |x| x != Choices::NONE),
        "item" => Items::from_str(name).map_or(false, |x| x != Items::UNKNOWNITEM),
        "ability" => Abilities::from_str(name).map_or(false, |x| x != Abilities::NONE),
        _ => false,
    }
}

/// Input: lines of `kind name` (species, move, item, ability; ids as in
/// Showdown). Output: the lines the engine doesn't know, one per line.
#[no_mangle]
pub extern "C" fn check(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let text = input(ptr, len);
    let mut out = String::new();
    for line in text.lines() {
        let mut parts = line.splitn(2, ' ');
        let (kind, name) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
        if !name.is_empty() && name != "none" && !known(kind, name) {
            out.push_str(line);
            out.push('\n');
        }
    }
    set_out(out);
}

/// Damage rolls for side one's and side two's moves against each other's
/// active Pokémon. Input: `move1|move2|s1first|state`. Output: two lines of
/// comma-separated rolls (`0` for none).
#[no_mangle]
pub extern "C" fn damage(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let text = input(ptr, len);
    let mut parts = text.splitn(4, '|');
    let m1 = parts.next().unwrap_or("none");
    let m2 = parts.next().unwrap_or("none");
    let first = parts.next().unwrap_or("true") == "true";
    let state = State::deserialize(parts.next().unwrap_or(""));
    let c1 = MOVES.get(&Choices::from_str(m1).unwrap()).unwrap().clone();
    let c2 = MOVES.get(&Choices::from_str(m2).unwrap()).unwrap().clone();
    let (d1, d2) = calculate_both_damage_rolls(&state, c1, c2, first);
    let mut out = String::new();
    for d in [d1, d2] {
        match d {
            Some(v) => {
                let rolls: Vec<String> = v.iter().map(|x| x.to_string()).collect();
                out.push_str(&rolls.join(","));
            }
            None => out.push('0'),
        }
        out.push('\n');
    }
    set_out(out);
}

/// The value network's input features for a state (see `features.rs`):
/// `FLOATS` little-endian f32s, then `TOKENS * IDS` u16 embedding ids, as raw bytes.
#[no_mangle]
pub extern "C" fn features(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let state = State::deserialize(&input(ptr, len));
    let f = features::features(&state);
    let mut out = Vec::with_capacity(f.floats.len() * 4 + f.ids.len() * 2);
    for v in &f.floats {
        out.extend_from_slice(&v.to_le_bytes());
    }
    for v in &f.ids {
        out.extend_from_slice(&v.to_le_bytes());
    }
    unsafe {
        *std::ptr::addr_of_mut!(OUT) = out;
    }
}

/// The features' layout: `{"version","gen","floats","tokens","ids","monF","fieldF",…}` plus name tables.
#[no_mangle]
pub extern "C" fn features_meta(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let _ = input(ptr, len);
    let names = features::names_json();
    set_out(format!(
        "{{\"floats\":{},\"tokens\":{},\"ids\":{},\"monF\":{},\"fieldF\":{},\"names\":{}}}",
        features::FLOATS,
        features::TOKENS,
        features::IDS,
        features::MON_F,
        features::FIELD_F,
        names
    ));
}

static mut NET: Option<net::Net> = None;

/// A world as `observe` reads it (see there), up to a line `=` or the end.
fn parse_view<'a>(
    lines: &mut impl Iterator<Item = &'a str>,
    who: &str,
) -> (State, u32, [features::Known; 6], Vec<features::Event>) {
    let state = State::deserialize(lines.next().unwrap_or_else(|| panic!("{who}: no state")));
    let turn: u32 = lines.next().and_then(|l| l.trim().parse().ok()).unwrap_or_else(|| panic!("{who}: no turn"));
    let mut known = [features::Known::default(); 6];
    for k in known.iter_mut() {
        let v: Vec<u32> = lines
            .next()
            .unwrap_or_else(|| panic!("{who}: missing foe line"))
            .split_whitespace()
            .map(|x| x.parse().unwrap())
            .collect();
        assert!(v.len() == 15, "{who}: foe line needs 15 numbers");
        *k = features::Known {
            seen: v[0] != 0,
            item: v[1] != 0,
            ability: v[2] != 0,
            moves: [v[3] != 0, v[4] != 0, v[5] != 0, v[6] != 0],
            base: [v[7] as u16, v[8] as u16, v[9] as u16, v[10] as u16, v[11] as u16, v[12] as u16],
            speed: (v[13] as u16, v[14] as u16),
        };
    }
    let history: Vec<features::Event> = lines
        .take_while(|l| l.trim() != "=")
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            let v: Vec<&str> = l.split_whitespace().collect();
            assert!(v.len() == 8, "{who}: event needs 8 fields");
            features::Event {
                kind: v[0].parse().unwrap(),
                by_side_one: v[1] == "1",
                turn: v[2].parse().unwrap(),
                species: v[3].parse().unwrap(),
                mv: v[4].parse().unwrap(),
                mega: v[5] == "1",
                hp_one: v[6].parse().unwrap(),
                hp_two: v[7].parse().unwrap(),
            }
        })
        .collect();
    (state, turn, known, history)
}

/// The light search (search.rs) over the loaded network. Input lines: the
/// parameters `ownK ownMass foeK foeMass branches branchMass robust`; then per
/// world, `legal` with 14 flags (our slots the game allows: 1, or 2 to search
/// it whatever the prior), and the world as `observe` reads it, ended by a
/// line `=`. Output: JSON, per world `{"prior":[14],"value":v,"foe":[14],
/// "score":[14, null where not searched],"positions":n,"replies":[{"slot":s,"p":p,"q":[14]}]}`.
#[no_mangle]
pub extern "C" fn net_search(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let text = input(ptr, len);
    let net = unsafe { (*std::ptr::addr_of!(NET)).as_ref() }.expect("no network loaded");
    let mut lines = text.lines();
    let v: Vec<f32> =
        lines.next().expect("net_search: no parameters").split_whitespace().map(|x| x.parse().unwrap()).collect();
    assert!(v.len() == 7, "net_search: 7 parameters");
    let p = search::Params {
        own_k: v[0] as usize,
        own_mass: v[1],
        foe_k: v[2] as usize,
        foe_mass: v[3],
        branches: v[4] as usize,
        branch_mass: v[5],
        robust: v[6],
    };
    let mut worlds = Vec::new();
    while let Some(l) = lines.by_ref().find(|l| !l.trim().is_empty()) {
        let flags: Vec<&str> = l.split_whitespace().collect();
        assert!(flags.len() == 1 + net::ACTIONS && flags[0] == "legal", "net_search: expected a legal line");
        let mut legal = [false; net::ACTIONS];
        let mut must = [false; net::ACTIONS];
        for (i, f) in flags[1..].iter().enumerate() {
            legal[i] = *f != "0";
            must[i] = *f == "2";
        }
        let (state, turn, known, history) = parse_view(&mut lines, "net_search");
        worlds.push(search::World { state, known, history, turn, legal, must });
    }
    let nums = |xs: &[f32]| {
        xs.iter().map(|x| if x.is_finite() { format!("{x}") } else { "null".into() }).collect::<Vec<_>>().join(",")
    };
    let out: Vec<String> = search::search(net, worlds, &p)
        .iter()
        .map(|r| {
            let replies: Vec<String> = r
                .replies
                .iter()
                .map(|x| {
                    format!(
                        "{{\"slot\":{},\"p\":{},\"q\":[{}]}}",
                        x.slot.map_or("null".into(), |s| s.to_string()),
                        x.p,
                        nums(&x.q)
                    )
                })
                .collect();
            format!(
                "{{\"prior\":[{}],\"value\":{},\"foe\":[{}],\"score\":[{}],\"positions\":{},\"replies\":[{}]}}",
                nums(&r.prior),
                r.value,
                nums(&r.foe),
                nums(&r.score),
                r.positions,
                replies.join(",")
            )
        })
        .collect();
    set_out(format!("[{}]", out.join(",")));
}

/// Observation v2 (features::observe) for side one of a world state, as the
/// network sees it. Input lines: the state; the turn; six foe-slot lines
/// `seen item ability m0 m1 m2 m3 hp atk def spa spd spe speedLo speedHi`
/// (flags 0/1, base stats, Speed bounds); then one event per line, oldest
/// first: `kind mine turn species move mega hpOwn hpFoe` (embedding ids).
/// Output: OBS_FLOATS f32 then OBS_IDS u16, little-endian.
#[no_mangle]
pub extern "C" fn observe(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let text = input(ptr, len);
    let (state, turn, known, history) = parse_view(&mut text.lines(), "observe");
    let f = features::observe(&state, true, &known, &history, turn);
    let mut out = Vec::with_capacity(f.floats.len() * 4 + f.ids.len() * 2);
    for v in &f.floats {
        out.extend_from_slice(&v.to_le_bytes());
    }
    for v in &f.ids {
        out.extend_from_slice(&v.to_le_bytes());
    }
    unsafe {
        *std::ptr::addr_of_mut!(OUT) = out;
    }
}

/// Loads the Master network from a .dbnet file's bytes (tools/net/export.py)
/// into this instance. Returns `{"params":N}`.
#[no_mangle]
pub extern "C" fn net_load(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let bytes = unsafe { Vec::from_raw_parts(ptr, len, len) };
    let n = net::Net::load(&bytes).unwrap_or_else(|e| panic!("{e}"));
    set_out(format!("{{\"params\":{}}}", n.params()));
    unsafe {
        *std::ptr::addr_of_mut!(NET) = Some(n);
    }
}

/// Runs the loaded network on a batch of observations (features.rs v2). Input,
/// per row: OBS_FLOATS f32, OBS_IDS u16, ACTIONS u8 legal mask (little-endian).
/// Output, per row: ACTIONS policy logits, the value logit, ACTIONS foe-action
/// logits, as f32.
#[no_mangle]
pub extern "C" fn net_forward(ptr: *mut u8, len: usize) {
    install_panic_hook();
    let bytes = unsafe { Vec::from_raw_parts(ptr, len, len) };
    let n = unsafe { (*std::ptr::addr_of!(NET)).as_ref() }.expect("no network loaded");
    let row = net::OBS_FLOATS * 4 + net::OBS_IDS * 2 + net::ACTIONS;
    assert!(len % row == 0, "net_forward: {len} bytes isn't a whole number of rows");
    let mut out = Vec::with_capacity(len / row * (2 * net::ACTIONS + 1) * 4);
    let parsed: Vec<(Vec<f32>, Vec<u16>, Vec<bool>)> = bytes
        .chunks_exact(row)
        .map(|r| {
            let (f, rest) = r.split_at(net::OBS_FLOATS * 4);
            let (i, m) = rest.split_at(net::OBS_IDS * 2);
            (
                f.chunks_exact(4).map(|c| f32::from_le_bytes(c.try_into().unwrap())).collect(),
                i.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect(),
                m.iter().map(|&b| b != 0).collect(),
            )
        })
        .collect();
    let rows: Vec<net::Row> =
        parsed.iter().map(|(floats, ids, mask)| net::Row { floats, ids, mask }).collect();
    for chunk in rows.chunks(net::BATCH) {
        for o in n.forward_batch(chunk) {
            for v in o.policy.iter().chain(std::iter::once(&o.value)).chain(o.foe_action.iter()) {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }
    }
    unsafe {
        *std::ptr::addr_of_mut!(OUT) = out;
    }
}

/// getrandom's custom backend for wasm32. The engine only draws from rngs we
/// seed, so this is never reached; it fails rather than invent entropy.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
unsafe extern "Rust" fn __getrandom_v03_custom(
    _dest: *mut u8,
    _len: usize,
) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED)
}
