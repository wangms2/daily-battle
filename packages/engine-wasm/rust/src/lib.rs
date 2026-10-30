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
