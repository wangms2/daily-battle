//! Light search on top of the Master network (plan-rl R8a): one ply of both
//! sides' choices and the turn's chance outcomes, from each sampled world,
//! with the network's value judging where each lands.
//!
//! Per world: the root's forward pass gives our move prior and the foe's
//! predicted choice (its foe-action head). Our likeliest choices meet the
//! foe's likeliest; each pair's turn splits into chance outcomes (hits, misses,
//! crits, rolls that KO or don't). Every outcome is observed as the next
//! decision would see it (the turn's events added, what they revealed known),
//! and all of them, across all worlds, go through the network in one batch. An
//! outcome where someone must replace a fainted Pokémon is a decision of its
//! own, resolved the same way one level down (we pick our best replacement;
//! the foe's is weighed by the network's prediction), so values are only read
//! where the network was trained to read them.
//!
//! A choice of ours scores the foe-prediction-weighted mean of its outcomes,
//! mixed with its worst case over the foe's choices (`robust`), as the foe
//! here isn't the self-play opponent the prediction was trained on.

use crate::features::{hp_frac, mon_ids, observe, Event, Known, HIST};
use crate::net::{Net, Output, Row, ACTIONS, BATCH};
use poke_engine::engine::generate_instructions::generate_instructions_from_move_pair;
use poke_engine::engine::state::MoveChoice;
use poke_engine::instruction::Instruction;
use poke_engine::state::{LastUsedMove, SideReference, State};

#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// Our choices searched: the likeliest by prior until `own_mass` of it, at most `own_k`.
    pub own_k: usize,
    pub own_mass: f32,
    /// The foe's: the likeliest by the foe-action head until `foe_mass`, at most `foe_k`.
    pub foe_k: usize,
    pub foe_mass: f32,
    /// Chance outcomes per pair of choices: the likeliest until `branch_mass`, at most `branches`.
    pub branches: usize,
    pub branch_mass: f32,
    /// Weight of a choice's worst case over the foe's choices (vs the predicted mean).
    pub robust: f32,
}

impl Default for Params {
    fn default() -> Params {
        Params { own_k: 4, own_mass: 0.95, foe_k: 3, foe_mass: 0.9, branches: 6, branch_mass: 0.98, robust: 0.25 }
    }
}

/// One sampled world, from side one's view (the network's player is side one).
pub struct World {
    pub state: State,
    pub known: [Known; 6],
    pub history: Vec<Event>,
    pub turn: u32,
    /// Our slots the game allows now (the engine may offer choices Showdown doesn't).
    pub legal: [bool; ACTIONS],
}

#[derive(Clone, Debug)]
pub struct WorldResult {
    /// The network's move probabilities at the root (0 where not allowed).
    pub prior: [f32; ACTIONS],
    /// Its win chance for us at the root.
    pub value: f32,
    /// The foe's predicted choice (0 off its options).
    pub foe: [f32; ACTIONS],
    /// Each searched choice's score, a win chance (NaN: not searched).
    pub score: [f32; ACTIONS],
    /// Positions the network judged for this world.
    pub positions: usize,
}

pub fn slot_of(c: &MoveChoice) -> Option<usize> {
    #[allow(unreachable_patterns)]
    match c {
        MoveChoice::Move(i) => Some(*i as usize),
        #[cfg(not(feature = "gen3"))]
        MoveChoice::MoveMega(i) => Some(4 + *i as usize),
        MoveChoice::Switch(p) => Some(8 + *p as usize),
        _ => None,
    }
}

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

/// Softmax of `logits` over the slots in `on`.
fn softmax(logits: &[f32; ACTIONS], on: impl Fn(usize) -> bool) -> [f32; ACTIONS] {
    let mx = (0..ACTIONS).filter(|&i| on(i)).map(|i| logits[i]).fold(f32::NEG_INFINITY, f32::max);
    let mut p = [0f32; ACTIONS];
    let mut sum = 0.0;
    for i in (0..ACTIONS).filter(|&i| on(i)) {
        p[i] = (logits[i] - mx).exp();
        sum += p[i];
    }
    if sum > 0.0 {
        p.iter_mut().for_each(|v| *v /= sum);
    }
    p
}

/// The likeliest of `options` by `prob` until `mass` (at least one, at most `k`),
/// with their probabilities renormalized. Options without a slot (no choice) pass alone.
fn pick(options: &[MoveChoice], prob: &[f32; ACTIONS], k: usize, mass: f32) -> Vec<(MoveChoice, f32)> {
    let mut v: Vec<(MoveChoice, f32)> =
        options.iter().filter_map(|c| slot_of(c).map(|s| (*c, prob[s]))).collect();
    if v.is_empty() {
        return vec![(options.first().copied().unwrap_or(MoveChoice::None), 1.0)];
    }
    // Stable: equal probabilities keep the engine's order.
    v.sort_by(|a, b| b.1.total_cmp(&a.1));
    let mut cum = 0.0;
    let mut n = 0;
    while n < v.len() && n < k.max(1) && (n == 0 || cum < mass) {
        cum += v[n].1;
        n += 1;
    }
    v.truncate(n);
    let total: f32 = v.iter().map(|x| x.1).sum();
    for x in v.iter_mut() {
        x.1 = if total > 0.0 { x.1 / total } else { 1.0 / n as f32 };
    }
    v
}

fn side(r: &SideReference) -> usize {
    match r {
        SideReference::SideOne => 0,
        SideReference::SideTwo => 1,
    }
}

/// A position to judge, as the next decision would see it.
struct Pos {
    state: State,
    known: [Known; 6],
    history: Vec<Event>,
    turn: u32,
}

impl Pos {
    fn row(&self, mask: [bool; ACTIONS]) -> (Vec<f32>, Vec<u16>, [bool; ACTIONS]) {
        let f = observe(&self.state, true, &self.known, &self.history, self.turn);
        (f.floats, f.ids, mask)
    }

    /// Someone must choose a replacement here (a faint, U-turn and the like).
    fn forced(&self) -> bool {
        self.state.side_one.force_switch || self.state.side_two.force_switch
    }

    /// The position after `c1`/`c2` lead to `ins`: the turn's events and what
    /// they show us of the foe, as the env's `advance` records them.
    fn after(&self, c: [&MoveChoice; 2], ins: &[Instruction]) -> Pos {
        let mut state = self.state.clone();
        state.apply_instructions(&ins.to_vec());
        let normal = !self.forced();
        let turn = self.turn + normal as u32;
        let mut known = self.known;
        let mut active = [self.state.side_one.active_index as usize, self.state.side_two.active_index as usize];
        let mega = c.map(|c| matches!(slot_of(c), Some(4..=7)));
        let mut events = Vec::new();
        let sides = |s: usize| if s == 0 { &state.side_one } else { &state.side_two };
        for i in ins {
            match i {
                Instruction::Switch(sw) => {
                    let s = side(&sw.side_ref);
                    active[s] = sw.next_index as usize;
                    let species = mon_ids(&sides(s).pokemon.pkmn[active[s]])[0];
                    if s == 1 {
                        known[active[s]].seen = true;
                    }
                    events.push(Event { kind: 2, by_side_one: s == 0, turn, species, ..Default::default() });
                }
                Instruction::SetLastUsedMove(m) => {
                    if let LastUsedMove::Move(mi) = m.last_used_move {
                        let s = side(&m.side_ref);
                        let ids = mon_ids(&sides(s).pokemon.pkmn[active[s]]);
                        if s == 1 {
                            known[active[s]].moves[mi as usize] = true;
                        }
                        events.push(Event {
                            kind: 1,
                            by_side_one: s == 0,
                            turn,
                            species: ids[0],
                            mv: ids[3 + mi as usize],
                            mega: mega[s],
                            ..Default::default()
                        });
                    }
                }
                Instruction::ChangeItem(ci) if side(&ci.side_ref) == 1 => known[active[1]].item = true,
                Instruction::ToggleMegaEvolved(t) if side(&t.side_ref) == 1 => known[active[1]].item = true,
                Instruction::ChangeAbility(ca) | Instruction::ChangeBaseAbility(ca) if side(&ca.side_ref) == 1 => {
                    known[active[1]].ability = true
                }
                _ => {}
            }
        }
        let hp = [hp_frac(state.side_one.get_active_immutable()), hp_frac(state.side_two.get_active_immutable())];
        let mut history = self.history[self.history.len().saturating_sub(HIST)..].to_vec();
        for mut e in events {
            e.hp_one = hp[0];
            e.hp_two = hp[1];
            history.push(e);
        }
        Pos { state, known, history, turn }
    }
}

/// The chance outcomes of `c1`/`c2` from `pos`, the likeliest first, pruned and renormalized.
fn outcomes(pos: &mut Pos, c1: &MoveChoice, c2: &MoveChoice, p: &Params) -> Vec<(f32, Vec<Instruction>)> {
    let mut v = generate_instructions_from_move_pair(&mut pos.state, c1, c2, true);
    v.sort_by(|a, b| b.percentage.total_cmp(&a.percentage));
    let total: f32 = v.iter().map(|b| b.percentage.max(0.0)).sum::<f32>().max(1e-9);
    let mut out = Vec::new();
    let mut cum = 0.0;
    for b in v {
        if !out.is_empty() && (out.len() >= p.branches || cum >= p.branch_mass) {
            break;
        }
        let w = b.percentage.max(0.0) / total;
        cum += w;
        out.push((w, b.instruction_list));
    }
    let kept: f32 = out.iter().map(|o| o.0).sum::<f32>().max(1e-9);
    out.iter_mut().for_each(|o| o.0 /= kept);
    out
}

/// A decision being searched: our candidate choices against the foe's, each
/// pair's outcomes either settled (the battle ended) or waiting on a judged position.
struct Node {
    own: Vec<(MoveChoice, f32)>,
    foe: Vec<(MoveChoice, f32)>,
    /// Per (own, foe) pair: (probability, leaf) outcomes.
    pairs: Vec<Vec<(f32, Leaf)>>,
}

enum Leaf {
    Over(f32),
    /// Index into the batch of judged positions.
    Judged(usize),
}

/// Our win chance once the battle has ended (1 win, 0 loss, 0.5 a draw).
fn over(state: &State) -> Option<f32> {
    let o = state.battle_is_over();
    (o != 0.0).then(|| if o > 0.0 { 1.0 } else { 0.0 })
}

/// Expands `pos` (whose judgement is `out`): candidates and their outcomes;
/// positions to judge go on `batch`.
fn expand(
    pos: &mut Pos,
    out: &Output,
    legal: Option<&[bool; ACTIONS]>,
    p: &Params,
    own_k: usize,
    foe_k: usize,
    batch: &mut Vec<Pos>,
) -> Node {
    let (o1, o2) = pos.state.root_get_all_options();
    let allowed = |s: usize| legal.map_or(true, |l| l[s]);
    let o1: Vec<MoveChoice> = o1.into_iter().filter(|c| slot_of(c).map_or(true, allowed)).collect();
    let on1: Vec<usize> = o1.iter().filter_map(slot_of).collect();
    let on2: Vec<usize> = o2.iter().filter_map(slot_of).collect();
    let prior = softmax(&out.policy, |s| on1.contains(&s));
    let foe_p = softmax(&out.foe_action, |s| on2.contains(&s));
    let own = pick(&o1, &prior, own_k, p.own_mass);
    let foe = pick(&o2, &foe_p, foe_k, p.foe_mass);
    let mut pairs = Vec::with_capacity(own.len() * foe.len());
    for (c1, _) in &own {
        for (c2, _) in &foe {
            let mut leaves = Vec::new();
            for (w, ins) in outcomes(pos, c1, c2, p) {
                let next = pos.after([c1, c2], &ins);
                leaves.push((
                    w,
                    match over(&next.state) {
                        Some(v) => Leaf::Over(v),
                        None => {
                            batch.push(next);
                            Leaf::Judged(batch.len() - 1)
                        }
                    },
                ));
            }
            pairs.push(leaves);
        }
    }
    Node { own, foe, pairs }
}

/// Each of our candidates' scores at `node`, given the judged positions' values.
fn scores(node: &Node, value: &dyn Fn(usize) -> f32, robust: f32) -> Vec<f32> {
    let nf = node.foe.len();
    (0..node.own.len())
        .map(|a| {
            let q: Vec<f32> = (0..nf)
                .map(|b| {
                    node.pairs[a * nf + b]
                        .iter()
                        .map(|(w, l)| w * match l {
                            Leaf::Over(v) => *v,
                            Leaf::Judged(i) => value(*i),
                        })
                        .sum()
                })
                .collect();
            let mean: f32 = q.iter().zip(&node.foe).map(|(v, f)| v * f.1).sum();
            let worst = q.iter().copied().fold(f32::INFINITY, f32::min);
            (1.0 - robust) * mean + robust * worst
        })
        .collect()
}

fn judge(net: &Net, pos: &[Pos], masks: impl Fn(usize) -> [bool; ACTIONS]) -> Vec<Output> {
    let rows: Vec<_> = pos.iter().enumerate().map(|(i, p)| p.row(masks(i))).collect();
    let rows: Vec<Row> = rows.iter().map(|(f, i, m)| Row { floats: f, ids: i, mask: m }).collect();
    rows.chunks(BATCH).flat_map(|c| net.forward_batch(c)).collect()
}

/// The slots of side one's options at `state` (the policy mask).
fn mask_of(state: &State) -> [bool; ACTIONS] {
    let mut m = [false; ACTIONS];
    for c in state.root_get_all_options().0 {
        if let Some(s) = slot_of(&c) {
            m[s] = true;
        }
    }
    m
}

/// Searches each world. The worlds' positions share each batch.
pub fn search(net: &Net, worlds: Vec<World>, p: &Params) -> Vec<WorldResult> {
    let mut roots: Vec<Pos> =
        worlds.iter().map(|w| Pos { state: w.state.clone(), known: w.known, history: w.history.clone(), turn: w.turn }).collect();
    let root_out = judge(net, &roots, |i| worlds[i].legal);

    // Our choices and the foe's at each root, and their outcomes.
    let mut first = Vec::new();
    let nodes: Vec<Node> = roots
        .iter_mut()
        .enumerate()
        .map(|(i, r)| expand(r, &root_out[i], Some(&worlds[i].legal), p, p.own_k, p.foe_k, &mut first))
        .collect();
    let first_out = judge(net, &first, |i| if first[i].forced() { mask_of(&first[i].state) } else { [true; ACTIONS] });

    // Outcomes where someone must send in a replacement: one more level, judged together.
    let mut second = Vec::new();
    let mut sub: Vec<Option<Node>> = Vec::with_capacity(first.len());
    for (i, pos) in first.iter_mut().enumerate() {
        sub.push(pos.forced().then(|| expand(pos, &first_out[i], None, p, 3, 3, &mut second)));
    }
    let second_out = judge(net, &second, |_| [true; ACTIONS]);
    let v2 = |i: usize| sigmoid(second_out[i].value);
    let v1: Vec<f32> = (0..first.len())
        .map(|i| match &sub[i] {
            // We choose our replacement: the best one. The foe's is weighed by prediction.
            Some(node) => scores(node, &v2, 0.0).into_iter().fold(f32::NEG_INFINITY, f32::max),
            None => sigmoid(first_out[i].value),
        })
        .collect();

    // Positions judged per world, for the record.
    let mut counts = vec![1usize; worlds.len()];
    for (w, node) in nodes.iter().enumerate() {
        for leaf in node.pairs.iter().flatten() {
            if let Leaf::Judged(i) = leaf.1 {
                counts[w] += 1 + sub[i].as_ref().map_or(0, |n| {
                    n.pairs.iter().flatten().filter(|l| matches!(l.1, Leaf::Judged(_))).count()
                });
            }
        }
    }

    nodes
        .iter()
        .enumerate()
        .map(|(w, node)| {
            let out = &root_out[w];
            let (o1, o2) = roots[w].state.root_get_all_options();
            let on1: Vec<usize> = o1.iter().filter_map(slot_of).filter(|&s| worlds[w].legal[s]).collect();
            let on2: Vec<usize> = o2.iter().filter_map(slot_of).collect();
            let mut score = [f32::NAN; ACTIONS];
            for ((c, _), s) in node.own.iter().zip(scores(node, &|i| v1[i], p.robust)) {
                if let Some(slot) = slot_of(c) {
                    score[slot] = s;
                }
            }
            WorldResult {
                prior: softmax(&out.policy, |s| on1.contains(&s)),
                value: sigmoid(out.value),
                foe: softmax(&out.foe_action, |s| on2.contains(&s)),
                score,
                positions: counts[w],
            }
        })
        .collect()
}
