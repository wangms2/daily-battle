//! The Master network's forward pass (plan-rl R8): model v2 from
//! tools/net/model.py, loaded from a .dbnet file (tools/net/export.py).
//!
//! Plain f32 loops, one position at a time. Must match model.py exactly: a
//! parity test runs the export's fixture through it (engine-wasm net.test.ts).

use std::collections::HashMap;

pub const TOKENS: usize = 12;
pub const MON_F: usize = 165;
pub const MON_BASE: usize = 45;
pub const MOVE_F: usize = 30;
pub const MON_IDS: usize = 7;
pub const FIELD_F: usize = 315;
pub const HIST: usize = 16;
pub const HIST_F: usize = 8;
pub const HIST_IDS: usize = 2;
pub const MATCH_FOES: usize = 4;
pub const MATCH: usize = 6 * MATCH_FOES;
pub const MATCH_F: usize = 20;
/// Where a matchup token's foe slot one-hot starts.
const MATCH_FOE_SLOT: usize = 12;
pub const ACTIONS: usize = 14;
pub const OBS_FLOATS: usize = TOKENS * MON_F + FIELD_F + HIST * HIST_F + MATCH * MATCH_F;
pub const OBS_IDS: usize = TOKENS * MON_IDS + HIST * HIST_IDS;
const _: () = assert!(OBS_FLOATS == crate::features::OBS_FLOATS && OBS_IDS == crate::features::OBS_IDS);
const _: () = assert!(MATCH_F == crate::features::MATCH_F && MATCH_FOES == crate::features::MATCH_FOES);

/// Token types, as model.py's FIELD, OWN, FOE, MOVES, HISTORY, MATCHUP.
const TYPES: usize = 6;
/// The main sequence: field 1, own 6, foe 6, own active's moves 4, history 16.
const SEQ: usize = 1 + 6 + 6 + 4 + HIST;

fn token_type(t: usize) -> usize {
    match t {
        0 => 0,
        1..=6 => 1,
        7..=12 => 2,
        13..=16 => 3,
        17..=32 => 4,
        _ => 5,
    }
}

struct Linear {
    w: Vec<f32>,
    b: Option<Vec<f32>>,
    inp: usize,
    out: usize,
}

impl Linear {
    fn apply(&self, x: &[f32], y: &mut [f32]) {
        debug_assert_eq!(x.len(), self.inp);
        for o in 0..self.out {
            let row = &self.w[o * self.inp..(o + 1) * self.inp];
            let mut s = 0f32;
            for (a, b) in row.iter().zip(x) {
                s += a * b;
            }
            y[o] = s + self.b.as_ref().map_or(0.0, |b| b[o]);
        }
    }

    fn call(&self, x: &[f32]) -> Vec<f32> {
        let mut y = vec![0f32; self.out];
        self.apply(x, &mut y);
        y
    }
}

struct Block {
    n1: Vec<f32>,
    n2: Vec<f32>,
    qkv: Linear,
    proj: Linear,
    up: Vec<Linear>,
    down: Vec<Linear>,
}

pub struct Net {
    d: usize,
    heads: usize,
    emb: usize,
    species: Vec<f32>,
    moves: Vec<f32>,
    items: Vec<f32>,
    abilities: Vec<f32>,
    enc_own: Linear,
    enc_foe: Linear,
    enc_field: Linear,
    enc_move: Linear,
    enc_hist: Linear,
    enc_match: Linear,
    slot: Vec<f32>,
    hist_pos: Vec<f32>,
    move_pos: Vec<f32>,
    in_norm: Vec<f32>,
    blocks: Vec<Block>,
    out_norm: Vec<f32>,
    pol_move: Linear,
    pol_switch: Linear,
    value1: Linear,
    value2: Linear,
    foe_move: Linear,
    foe_switch: Linear,
    params: usize,
}

/// One position's outputs: policy logits over the 14 action slots (illegal ones
/// -1e9), the value logit (sigmoid = win chance), and the foe's next-action logits.
pub struct Output {
    pub policy: [f32; ACTIONS],
    pub value: f32,
    pub foe_action: [f32; ACTIONS],
}

fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h >> 15) as u32) << 31;
    let exp = ((h >> 10) & 0x1f) as u32;
    let frac = (h & 0x3ff) as u32;
    let bits = if exp == 0 {
        if frac == 0 {
            sign
        } else {
            // Subnormal: renormalize.
            let mut e = 127 - 15 + 1;
            let mut f = frac;
            while f & 0x400 == 0 {
                f <<= 1;
                e -= 1;
            }
            sign | ((e as u32) << 23) | ((f & 0x3ff) << 13)
        }
    } else if exp == 0x1f {
        sign | 0x7f80_0000 | (frac << 13)
    } else {
        sign | ((exp + 127 - 15) << 23) | (frac << 13)
    };
    f32::from_bits(bits)
}

struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        let s = self.b.get(self.at..self.at + n).ok_or("truncated .dbnet")?;
        self.at += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, String> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
    }
    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
}

struct Tensors(HashMap<String, (Vec<usize>, Vec<f32>)>);

impl Tensors {
    fn get(&mut self, name: &str, shape: &[usize]) -> Result<Vec<f32>, String> {
        let (dims, data) = self.0.remove(name).ok_or_else(|| format!("missing tensor {name}"))?;
        if dims != shape {
            return Err(format!("{name}: shape {dims:?}, expected {shape:?}"));
        }
        Ok(data)
    }
    fn linear(&mut self, name: &str, inp: usize, out: usize, bias: bool) -> Result<Linear, String> {
        let w = self.get(&format!("{name}.weight"), &[out, inp])?;
        let b = if bias { Some(self.get(&format!("{name}.bias"), &[out])?) } else { None };
        Ok(Linear { w, b, inp, out })
    }
}

fn rms_norm(x: &mut [f32], w: &[f32]) {
    let ms = x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32;
    let r = 1.0 / (ms + 1e-6).sqrt();
    for (v, g) in x.iter_mut().zip(w) {
        *v *= r * g;
    }
}

/// erf (Abramowitz & Stegun 7.1.26, absolute error under 1.5e-7), for exact GELU.
fn erf(x: f32) -> f32 {
    let x = x as f64;
    let s = x.signum();
    let a = x.abs();
    let t = 1.0 / (1.0 + 0.327_591_1 * a);
    let y = 1.0
        - (((((1.061_405_429 * t - 1.453_152_027) * t) + 1.421_413_741) * t - 0.284_496_736) * t
            + 0.254_829_592)
            * t
            * (-a * a).exp();
    (s * y) as f32
}

fn gelu(x: &mut [f32]) {
    for v in x {
        *v = 0.5 * *v * (1.0 + erf(*v * std::f32::consts::FRAC_1_SQRT_2));
    }
}

/// Index of the first maximum (torch.argmax).
fn argmax(xs: impl Iterator<Item = f32>) -> usize {
    let mut best = (0, f32::NEG_INFINITY);
    for (i, v) in xs.enumerate() {
        if v > best.1 {
            best = (i, v);
        }
    }
    best.0
}

impl Net {
    pub fn load(bytes: &[u8]) -> Result<Net, String> {
        let mut r = Reader { b: bytes, at: 0 };
        if r.take(8)? != b"DBNET\0\0\0" {
            return Err("not a .dbnet file".into());
        }
        let format = r.u32()?;
        if format != 1 {
            return Err(format!("unsupported .dbnet format {format}"));
        }
        let n = r.u32()? as usize;
        let cfg: Vec<usize> = (0..n).map(|_| r.u32().map(|v| v as usize)).collect::<Result<_, _>>()?;
        let [d, layers, heads, ffn, emb] = cfg[..] else {
            return Err("bad config".into());
        };
        let count = r.u32()?;
        let mut map = HashMap::new();
        let mut params = 0;
        for _ in 0..count {
            let len = r.u16()? as usize;
            let name = String::from_utf8(r.take(len)?.to_vec()).map_err(|e| e.to_string())?;
            let ndim = r.u8()? as usize;
            let dims: Vec<usize> = (0..ndim).map(|_| r.u32().map(|v| v as usize)).collect::<Result<_, _>>()?;
            if r.u8()? != 1 {
                return Err(format!("{name}: unsupported dtype"));
            }
            let numel: usize = dims.iter().product();
            let raw = r.take(numel * 2)?;
            let data: Vec<f32> =
                raw.chunks_exact(2).map(|c| f16_to_f32(u16::from_le_bytes([c[0], c[1]]))).collect();
            params += numel;
            map.insert(name, (dims, data));
        }
        let mut t = Tensors(map);
        let mon_in = MON_BASE + 3 * emb + 4 * (MOVE_F + emb);
        let mut blocks = Vec::with_capacity(layers);
        for i in 0..layers {
            let p = format!("blocks.{i}");
            blocks.push(Block {
                n1: t.get(&format!("{p}.n1.w"), &[d])?,
                n2: t.get(&format!("{p}.n2.w"), &[d])?,
                qkv: t.linear(&format!("{p}.qkv"), d, 3 * d, false)?,
                proj: t.linear(&format!("{p}.proj"), d, d, false)?,
                up: (0..TYPES).map(|k| t.linear(&format!("{p}.ffn.up.{k}"), d, ffn, true)).collect::<Result<_, _>>()?,
                down: (0..TYPES)
                    .map(|k| t.linear(&format!("{p}.ffn.down.{k}"), ffn, d, true))
                    .collect::<Result<_, _>>()?,
            });
        }
        Ok(Net {
            d,
            heads,
            emb,
            species: t.get("species.weight", &[1536, emb])?,
            moves: t.get("move.weight", &[1024, emb])?,
            items: t.get("item.weight", &[512, emb])?,
            abilities: t.get("ability.weight", &[768, emb])?,
            enc_own: t.linear("enc_own", mon_in, d, true)?,
            enc_foe: t.linear("enc_foe", mon_in, d, true)?,
            enc_field: t.linear("enc_field", FIELD_F, d, true)?,
            enc_move: t.linear("enc_move", MOVE_F + emb + MON_BASE, d, true)?,
            enc_hist: t.linear("enc_hist", HIST_F + 2 * emb, d, true)?,
            enc_match: t.linear("enc_match", MATCH_F, d, true)?,
            slot: t.get("slot.weight", &[12, d])?,
            hist_pos: t.get("hist_pos", &[HIST, d])?,
            move_pos: t.get("move_pos", &[4, d])?,
            in_norm: t.get("in_norm.w", &[d])?,
            blocks,
            out_norm: t.get("out_norm.w", &[d])?,
            pol_move: t.linear("pol_move", d, 2, true)?,
            pol_switch: t.linear("pol_switch", d, 1, true)?,
            value1: t.linear("value.0", d, d, true)?,
            value2: t.linear("value.2", d, 1, true)?,
            foe_move: t.linear("foe_move", d, 8, true)?,
            foe_switch: t.linear("foe_switch", d, 1, true)?,
            params,
        })
    }

    pub fn params(&self) -> usize {
        self.params
    }

    fn row<'a>(&self, table: &'a [f32], id: u16) -> &'a [f32] {
        let rows = table.len() / self.emb;
        let i = (id as usize).min(rows - 1);
        &table[i * self.emb..(i + 1) * self.emb]
    }

    /// `floats` OBS_FLOATS, `ids` OBS_IDS, `mask` ACTIONS (features.rs observation v3).
    pub fn forward(&self, floats: &[f32], ids: &[u16], mask: &[bool]) -> Output {
        let d = self.d;
        let mons = &floats[..TOKENS * MON_F];
        let mut at = TOKENS * MON_F;
        let field = &floats[at..at + FIELD_F];
        at += FIELD_F;
        let hist_f = &floats[at..at + HIST * HIST_F];
        at += HIST * HIST_F;
        let match_f = &floats[at..at + MATCH * MATCH_F];
        let mon = |k: usize| &mons[k * MON_F..(k + 1) * MON_F];
        let mon_ids = |k: usize| &ids[k * MON_IDS..(k + 1) * MON_IDS];
        let hist_ids = &ids[TOKENS * MON_IDS..];

        let mon_in = |k: usize| {
            let (m, id) = (mon(k), mon_ids(k));
            let mut v = Vec::with_capacity(self.enc_own.inp);
            v.extend_from_slice(&m[..MON_BASE]);
            v.extend_from_slice(self.row(&self.species, id[0]));
            v.extend_from_slice(self.row(&self.items, id[1]));
            v.extend_from_slice(self.row(&self.abilities, id[2]));
            for j in 0..4 {
                v.extend_from_slice(&m[MON_BASE + j * MOVE_F..MON_BASE + (j + 1) * MOVE_F]);
                v.extend_from_slice(self.row(&self.moves, id[3 + j]));
            }
            v
        };
        let total = SEQ + MATCH;
        let mut x = vec![0f32; total * d];
        let tok = |x: &mut [f32], t: usize, v: &[f32], add: Option<&[f32]>| {
            let dst = &mut x[t * d..(t + 1) * d];
            dst.copy_from_slice(v);
            if let Some(a) = add {
                for (o, b) in dst.iter_mut().zip(a) {
                    *o += b;
                }
            }
        };
        tok(&mut x, 0, &self.enc_field.call(field), None);
        for k in 0..6 {
            tok(&mut x, 1 + k, &self.enc_own.call(&mon_in(k)), Some(&self.slot[k * d..(k + 1) * d]));
            tok(&mut x, 7 + k, &self.enc_foe.call(&mon_in(6 + k)), Some(&self.slot[(6 + k) * d..(7 + k) * d]));
        }
        let own_active = argmax((0..6).map(|k| mon(k)[1]));
        let (am, aid) = (mon(own_active), mon_ids(own_active));
        for j in 0..4 {
            let mut v = Vec::with_capacity(self.enc_move.inp);
            v.extend_from_slice(&am[MON_BASE + j * MOVE_F..MON_BASE + (j + 1) * MOVE_F]);
            v.extend_from_slice(self.row(&self.moves, aid[3 + j]));
            v.extend_from_slice(&am[..MON_BASE]);
            tok(&mut x, 13 + j, &self.enc_move.call(&v), Some(&self.move_pos[j * d..(j + 1) * d]));
        }
        for k in 0..HIST {
            let mut v = Vec::with_capacity(self.enc_hist.inp);
            v.extend_from_slice(&hist_f[k * HIST_F..(k + 1) * HIST_F]);
            v.extend_from_slice(self.row(&self.species, hist_ids[k * 2]));
            v.extend_from_slice(self.row(&self.moves, hist_ids[k * 2 + 1]));
            tok(&mut x, 17 + k, &self.enc_hist.call(&v), Some(&self.hist_pos[k * d..(k + 1) * d]));
        }
        for k in 0..MATCH {
            let mf = &match_f[k * MATCH_F..(k + 1) * MATCH_F];
            let mut v = self.enc_match.call(mf);
            let own = k / MATCH_FOES;
            for (o, s) in v.iter_mut().zip(&self.slot[own * d..(own + 1) * d]) {
                *o += s;
            }
            for j in 0..6 {
                let w = mf[MATCH_FOE_SLOT + j];
                if w != 0.0 {
                    for (o, s) in v.iter_mut().zip(&self.slot[(6 + j) * d..(7 + j) * d]) {
                        *o += w * s;
                    }
                }
            }
            tok(&mut x, SEQ + k, &v, None);
        }
        for t in 0..total {
            rms_norm(&mut x[t * d..(t + 1) * d], &self.in_norm);
        }

        let inject_at = self.blocks.len() / 2;
        let mut len = SEQ;
        for (i, blk) in self.blocks.iter().enumerate() {
            if i == inject_at {
                len = total;
            }
            self.block(blk, &mut x[..len * d], len);
        }
        let out = |t: usize| {
            let mut v = x[t * d..(t + 1) * d].to_vec();
            rms_norm(&mut v, &self.out_norm);
            v
        };

        let mut policy = [0f32; ACTIONS];
        for j in 0..4 {
            let pm = self.pol_move.call(&out(13 + j));
            policy[j] = pm[0];
            policy[4 + j] = pm[1];
        }
        let own_t: Vec<Vec<f32>> = (0..6).map(|k| out(1 + k)).collect();
        for k in 0..6 {
            policy[8 + k] = self.pol_switch.call(&own_t[k])[0];
        }
        for (p, &m) in policy.iter_mut().zip(mask) {
            if !m {
                *p = -1e9;
            }
        }
        let mut h = self.value1.call(&out(0));
        gelu(&mut h);
        let value = self.value2.call(&h)[0];
        let foe_active = argmax((6..12).map(|k| mon(k)[1]));
        let mut foe_action = [0f32; ACTIONS];
        foe_action[..8].copy_from_slice(&self.foe_move.call(&out(7 + foe_active)));
        for k in 0..6 {
            foe_action[8 + k] = self.foe_switch.call(&out(7 + k))[0];
        }
        Output { policy, value, foe_action }
    }

    fn block(&self, b: &Block, x: &mut [f32], t: usize) {
        let d = self.d;
        let dh = d / self.heads;
        let mut qkv = vec![0f32; t * 3 * d];
        let mut h = vec![0f32; d];
        for i in 0..t {
            h.copy_from_slice(&x[i * d..(i + 1) * d]);
            rms_norm(&mut h, &b.n1);
            b.qkv.apply(&h, &mut qkv[i * 3 * d..(i + 1) * 3 * d]);
        }
        let scale = 1.0 / (dh as f32).sqrt();
        let mut att = vec![0f32; t * d];
        let mut p = vec![0f32; t];
        for hd in 0..self.heads {
            let off = hd * dh;
            for i in 0..t {
                let q = &qkv[i * 3 * d + off..i * 3 * d + off + dh];
                let mut mx = f32::NEG_INFINITY;
                for j in 0..t {
                    let k = &qkv[j * 3 * d + d + off..j * 3 * d + d + off + dh];
                    let s = q.iter().zip(k).map(|(a, b)| a * b).sum::<f32>() * scale;
                    p[j] = s;
                    mx = mx.max(s);
                }
                let mut sum = 0f32;
                for v in p.iter_mut() {
                    *v = (*v - mx).exp();
                    sum += *v;
                }
                let o = &mut att[i * d + off..i * d + off + dh];
                for j in 0..t {
                    let w = p[j] / sum;
                    let v = &qkv[j * 3 * d + 2 * d + off..j * 3 * d + 2 * d + off + dh];
                    for (a, b) in o.iter_mut().zip(v) {
                        *a += w * b;
                    }
                }
            }
        }
        let mut y = vec![0f32; d];
        let mut u = vec![0f32; b.up[0].out];
        for i in 0..t {
            b.proj.apply(&att[i * d..(i + 1) * d], &mut y);
            let xi = &mut x[i * d..(i + 1) * d];
            for (a, v) in xi.iter_mut().zip(&y) {
                *a += v;
            }
            h.copy_from_slice(xi);
            rms_norm(&mut h, &b.n2);
            let ty = token_type(i);
            b.up[ty].apply(&h, &mut u);
            gelu(&mut u);
            b.down[ty].apply(&u, &mut y);
            for (a, v) in xi.iter_mut().zip(&y) {
                *a += v;
            }
        }
    }
}
