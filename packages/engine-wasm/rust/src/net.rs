//! The Master network's forward pass (plan-rl R8): model v2 from
//! tools/net/model.py, loaded from a .dbnet file (tools/net/export.py).
//!
//! f32, batched: each layer is one matrix product over every token of every
//! position (4 × 4 tiles, WASM SIMD when built with simd128). Must match
//! model.py: a parity test runs the export's fixture through it (net.test.ts).

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
pub const MATCH_FOES: usize = 6;
pub const MATCH: usize = 6 * MATCH_FOES;
pub const MATCH_F: usize = 20;
/// Where a matchup token's foe slot one-hot starts.
const MATCH_FOE_SLOT: usize = 12;
pub const ACTIONS: usize = 14;
/// Positions per `forward_batch` call from the ABI: big enough to share weight
/// reads, small enough to keep the activations modest (~5 MB).
pub const BATCH: usize = 32;
pub const OBS_FLOATS: usize = TOKENS * MON_F + FIELD_F + HIST * HIST_F + MATCH * MATCH_F;
pub const OBS_IDS: usize = TOKENS * MON_IDS + HIST * HIST_IDS;
const _: () = assert!(OBS_FLOATS == crate::features::OBS_FLOATS && OBS_IDS == crate::features::OBS_IDS);
const _: () = assert!(MATCH_F == crate::features::MATCH_F && MATCH_FOES == crate::features::MATCH_FOES);

/// Token types, as model.py's FIELD, OWN, FOE, MOVES, HISTORY, MATCHUP.
const TYPES: usize = 6;
/// The main sequence: field 1, own 6, foe 6, own active's moves 4, history 16.
const SEQ: usize = 1 + 6 + 6 + 4 + HIST;

/// Each token type's range of the sequence (its FFN), in type order.
const TYPE_RANGES: [(usize, usize); TYPES] = [(0, 1), (1, 7), (7, 13), (13, 17), (17, SEQ), (SEQ, SEQ + MATCH)];

/// Four f32 lanes: WASM SIMD when built with simd128, plain arrays otherwise
/// (which native targets vectorize on their own). Lanes sum the same way in both.
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod lanes {
    use core::arch::wasm32::*;
    #[derive(Clone, Copy)]
    pub struct F4(v128);
    impl F4 {
        #[inline(always)]
        pub fn zero() -> F4 {
            F4(f32x4_splat(0.0))
        }
        /// Safety: `p..p + 4` is in bounds.
        #[inline(always)]
        pub unsafe fn load(p: *const f32) -> F4 {
            F4(v128_load(p as *const v128))
        }
        #[inline(always)]
        pub fn madd(self, a: F4, b: F4) -> F4 {
            F4(f32x4_add(self.0, f32x4_mul(a.0, b.0)))
        }
        #[inline(always)]
        pub fn sum(self) -> f32 {
            (f32x4_extract_lane::<0>(self.0) + f32x4_extract_lane::<1>(self.0))
                + (f32x4_extract_lane::<2>(self.0) + f32x4_extract_lane::<3>(self.0))
        }
    }
}

#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
mod lanes {
    #[derive(Clone, Copy)]
    pub struct F4([f32; 4]);
    impl F4 {
        #[inline(always)]
        pub fn zero() -> F4 {
            F4([0.0; 4])
        }
        /// Safety: `p..p + 4` is in bounds.
        #[inline(always)]
        pub unsafe fn load(p: *const f32) -> F4 {
            F4([*p, *p.add(1), *p.add(2), *p.add(3)])
        }
        #[inline(always)]
        pub fn madd(self, a: F4, b: F4) -> F4 {
            let mut o = self.0;
            for l in 0..4 {
                o[l] += a.0[l] * b.0[l];
            }
            F4(o)
        }
        #[inline(always)]
        pub fn sum(self) -> f32 {
            (self.0[0] + self.0[1]) + (self.0[2] + self.0[3])
        }
    }
}

use lanes::F4;

struct Linear {
    w: Vec<f32>,
    b: Option<Vec<f32>>,
    inp: usize,
    out: usize,
}

/// Bytes of input rows per cache block in `gemm`: the block stays in L1 (32 KB
/// and up, phones included) while every weight row passes over it.
const BLOCK_BYTES: usize = 16 * 1024;

impl Linear {
    /// `y` (n × out) = `x` (n × inp) · Wᵀ + b, in 4 × 4 tiles of rows × outputs.
    fn gemm(&self, x: &[f32], y: &mut [f32]) {
        let (inp, out) = (self.inp, self.out);
        let n = x.len() / inp;
        assert!(x.len() == n * inp && y.len() == n * out);
        let k4 = inp & !3;
        let (xp, wp) = (x.as_ptr(), self.w.as_ptr());
        let block = (BLOCK_BYTES / (inp * 4)).max(4) & !3;
        for b0 in (0..n).step_by(block) {
            let b1 = (b0 + block).min(n);
            for o0 in (0..out).step_by(4) {
                let outs = (out - o0).min(4);
                let wr: [usize; 4] = std::array::from_fn(|j| (o0 + j.min(outs - 1)) * inp);
                for r0 in (b0..b1).step_by(4) {
                    let rows = (b1 - r0).min(4);
                    let xr: [usize; 4] = std::array::from_fn(|i| (r0 + i.min(rows - 1)) * inp);
                    let mut acc = [[F4::zero(); 4]; 4];
                    let mut k = 0;
                    while k < k4 {
                        // Safety: k + 4 <= inp, and every xr/wr is a row start.
                        unsafe {
                            let xv: [F4; 4] = std::array::from_fn(|i| F4::load(xp.add(xr[i] + k)));
                            for j in 0..4 {
                                let wv = F4::load(wp.add(wr[j] + k));
                                for i in 0..4 {
                                    acc[i][j] = acc[i][j].madd(xv[i], wv);
                                }
                            }
                        }
                        k += 4;
                    }
                    for i in 0..rows {
                        for j in 0..outs {
                            let mut s = acc[i][j].sum();
                            for kk in k4..inp {
                                s += x[xr[i] + kk] * self.w[wr[j] + kk];
                            }
                            y[(r0 + i) * out + o0 + j] = s + self.b.as_ref().map_or(0.0, |b| b[o0 + j]);
                        }
                    }
                }
            }
        }
    }

    fn call(&self, x: &[f32]) -> Vec<f32> {
        let mut y = vec![0f32; x.len() / self.inp * self.out];
        self.gemm(x, &mut y);
        y
    }
}

/// One observation (features.rs v3) for `Net::forward_batch`.
#[derive(Clone, Copy)]
pub struct Row<'a> {
    pub floats: &'a [f32],
    pub ids: &'a [u16],
    pub mask: &'a [bool],
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

/// e^x in f32 without a libm call (WASM has no exp instruction): 2^n · e^r with
/// |r| ≤ ln2/2 and a degree-7 Taylor polynomial, relative error ~1e-7.
#[inline(always)]
fn exp(x: f32) -> f32 {
    let x = x.clamp(-87.0, 88.0);
    let n = (x * std::f32::consts::LOG2_E).round();
    let r = x - n * 0.693_145_75 - n * 1.428_606_8e-6;
    let p = 1.0
        + r * (1.0
            + r * (0.5 + r * (1.0 / 6.0 + r * (1.0 / 24.0 + r * (1.0 / 120.0 + r * (1.0 / 720.0 + r / 5040.0))))));
    p * f32::from_bits(((n as i32 + 127) as u32) << 23)
}

/// erf (Abramowitz & Stegun 7.1.26, absolute error under 1.5e-7), for exact GELU.
fn erf(x: f32) -> f32 {
    let a = x.abs();
    let t = 1.0 / (1.0 + 0.327_591_1 * a);
    let y = 1.0
        - (((((1.061_405_4 * t - 1.453_152) * t) + 1.421_413_8) * t - 0.284_496_74) * t + 0.254_829_6)
            * t
            * exp(-a * a);
    y.copysign(x)
}

fn gelu(x: &mut [f32]) {
    for v in x {
        *v = 0.5 * *v * (1.0 + erf(*v * std::f32::consts::FRAC_1_SQRT_2));
    }
}

/// An observation's float parts: Pokémon, field, history, matchups.
fn parts(f: &[f32]) -> (&[f32], &[f32], &[f32], &[f32]) {
    let mut at = TOKENS * MON_F;
    let mons = &f[..at];
    let field = &f[at..at + FIELD_F];
    at += FIELD_F;
    let hist = &f[at..at + HIST * HIST_F];
    at += HIST * HIST_F;
    (mons, field, hist, &f[at..at + MATCH * MATCH_F])
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
            let numel: usize = dims.iter().product();
            let data: Vec<f32> = match r.u8()? {
                1 => {
                    let raw = r.take(numel * 2)?;
                    raw.chunks_exact(2).map(|c| f16_to_f32(u16::from_le_bytes([c[0], c[1]]))).collect()
                }
                // int8 per row (first dim): f16 scales, then i8 values.
                2 if ndim >= 2 => {
                    let rows = dims[0];
                    let per = numel / rows.max(1);
                    let scales: Vec<f32> = r
                        .take(rows * 2)?
                        .chunks_exact(2)
                        .map(|c| f16_to_f32(u16::from_le_bytes([c[0], c[1]])))
                        .collect();
                    let raw = r.take(numel)?;
                    raw.iter().enumerate().map(|(k, &q)| q as i8 as f32 * scales[k / per]).collect()
                }
                _ => return Err(format!("{name}: unsupported dtype")),
            };
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
        self.forward_batch(&[Row { floats, ids, mask }]).pop().unwrap()
    }

    /// Many observations at once: each layer runs over all their tokens together,
    /// so its weights are read once per batch rather than once per token.
    pub fn forward_batch(&self, rows: &[Row]) -> Vec<Output> {
        let n = rows.len();
        if n == 0 {
            return Vec::new();
        }
        let d = self.d;
        let total = SEQ + MATCH;
        for r in rows {
            assert!(r.floats.len() == OBS_FLOATS && r.ids.len() == OBS_IDS && r.mask.len() == ACTIONS);
        }
        let mut x = vec![0f32; n * total * d];
        // Puts the encoder outputs `enc` (k per row), plus `add`, at tokens `t0..t0 + k`.
        fn place<'w>(
            x: &mut [f32],
            enc: &[f32],
            (n, total, d): (usize, usize, usize),
            k: usize,
            t0: usize,
            add: impl Fn(usize, usize) -> Option<&'w [f32]>,
        ) {
            for r in 0..n {
                for j in 0..k {
                    let dst = &mut x[(r * total + t0 + j) * d..][..d];
                    dst.copy_from_slice(&enc[(r * k + j) * d..][..d]);
                    if let Some(a) = add(r, j) {
                        for (o, v) in dst.iter_mut().zip(a) {
                            *o += v;
                        }
                    }
                }
            }
        }
        let dims = (n, total, d);

        let field: Vec<f32> = rows.iter().flat_map(|r| parts(r.floats).1.iter().copied()).collect();
        place(&mut x, &self.enc_field.call(&field), dims, 1, 0, |_, _| None);

        let mon_in = |r: &Row<'_>, k: usize, v: &mut Vec<f32>| {
            let m = &parts(r.floats).0[k * MON_F..(k + 1) * MON_F];
            let id = &r.ids[k * MON_IDS..(k + 1) * MON_IDS];
            v.extend_from_slice(&m[..MON_BASE]);
            v.extend_from_slice(self.row(&self.species, id[0]));
            v.extend_from_slice(self.row(&self.items, id[1]));
            v.extend_from_slice(self.row(&self.abilities, id[2]));
            for j in 0..4 {
                v.extend_from_slice(&m[MON_BASE + j * MOVE_F..MON_BASE + (j + 1) * MOVE_F]);
                v.extend_from_slice(self.row(&self.moves, id[3 + j]));
            }
        };
        for (foe, enc) in [(false, &self.enc_own), (true, &self.enc_foe)] {
            let mut v = Vec::with_capacity(n * 6 * enc.inp);
            for r in rows {
                for k in 0..6 {
                    mon_in(r, k + 6 * foe as usize, &mut v);
                }
            }
            let s = 6 * foe as usize;
            place(&mut x, &enc.call(&v), dims, 6, 1 + s, |_, j| Some(&self.slot[(s + j) * d..(s + j + 1) * d]));
        }

        let mut v = Vec::with_capacity(n * 4 * self.enc_move.inp);
        for r in rows {
            let mons = parts(r.floats).0;
            let a = argmax((0..6).map(|k| mons[k * MON_F + 1]));
            let (am, aid) = (&mons[a * MON_F..(a + 1) * MON_F], &r.ids[a * MON_IDS..(a + 1) * MON_IDS]);
            for j in 0..4 {
                v.extend_from_slice(&am[MON_BASE + j * MOVE_F..MON_BASE + (j + 1) * MOVE_F]);
                v.extend_from_slice(self.row(&self.moves, aid[3 + j]));
                v.extend_from_slice(&am[..MON_BASE]);
            }
        }
        place(&mut x, &self.enc_move.call(&v), dims, 4, 13, |_, j| Some(&self.move_pos[j * d..(j + 1) * d]));

        let mut v = Vec::with_capacity(n * HIST * self.enc_hist.inp);
        for r in rows {
            let (hist_f, hist_ids) = (parts(r.floats).2, &r.ids[TOKENS * MON_IDS..]);
            for k in 0..HIST {
                v.extend_from_slice(&hist_f[k * HIST_F..(k + 1) * HIST_F]);
                v.extend_from_slice(self.row(&self.species, hist_ids[k * 2]));
                v.extend_from_slice(self.row(&self.moves, hist_ids[k * 2 + 1]));
            }
        }
        place(&mut x, &self.enc_hist.call(&v), dims, HIST, 17, |_, k| Some(&self.hist_pos[k * d..(k + 1) * d]));

        let mf: Vec<f32> = rows.iter().flat_map(|r| parts(r.floats).3.iter().copied()).collect();
        let enc = self.enc_match.call(&mf);
        for r in 0..n {
            for k in 0..MATCH {
                let m = &mf[(r * MATCH + k) * MATCH_F..][..MATCH_F];
                let dst = &mut x[(r * total + SEQ + k) * d..][..d];
                dst.copy_from_slice(&enc[(r * MATCH + k) * d..][..d]);
                let own = k / MATCH_FOES;
                for (o, s) in dst.iter_mut().zip(&self.slot[own * d..(own + 1) * d]) {
                    *o += s;
                }
                for j in 0..6 {
                    let w = m[MATCH_FOE_SLOT + j];
                    if w != 0.0 {
                        for (o, s) in dst.iter_mut().zip(&self.slot[(6 + j) * d..(7 + j) * d]) {
                            *o += w * s;
                        }
                    }
                }
            }
        }
        for t in x.chunks_exact_mut(d) {
            rms_norm(t, &self.in_norm);
        }

        let inject_at = self.blocks.len() / 2;
        let mut len = SEQ;
        for (i, blk) in self.blocks.iter().enumerate() {
            if i == inject_at {
                len = total;
            }
            self.block(blk, &mut x, n, total, len);
        }

        rows.iter()
            .enumerate()
            .map(|(r, row)| {
                let out = |t: usize| {
                    let mut v = x[(r * total + t) * d..][..d].to_vec();
                    rms_norm(&mut v, &self.out_norm);
                    v
                };
                let mut policy = [0f32; ACTIONS];
                let moves: Vec<f32> = (0..4).flat_map(|j| out(13 + j)).collect();
                let pm = self.pol_move.call(&moves);
                for j in 0..4 {
                    policy[j] = pm[2 * j];
                    policy[4 + j] = pm[2 * j + 1];
                }
                let own: Vec<f32> = (0..6).flat_map(|k| out(1 + k)).collect();
                policy[8..].copy_from_slice(&self.pol_switch.call(&own));
                for (p, &m) in policy.iter_mut().zip(row.mask) {
                    if !m {
                        *p = -1e9;
                    }
                }
                let mut h = self.value1.call(&out(0));
                gelu(&mut h);
                let value = self.value2.call(&h)[0];
                let mons = parts(row.floats).0;
                let foe_active = argmax((6..12).map(|k| mons[k * MON_F + 1]));
                let mut foe_action = [0f32; ACTIONS];
                foe_action[..8].copy_from_slice(&self.foe_move.call(&out(7 + foe_active)));
                let foes: Vec<f32> = (0..6).flat_map(|k| out(7 + k)).collect();
                foe_action[8..].copy_from_slice(&self.foe_switch.call(&foes));
                Output { policy, value, foe_action }
            })
            .collect()
    }

    /// One transformer block over the first `len` of each row's `total` tokens.
    fn block(&self, b: &Block, x: &mut [f32], n: usize, total: usize, len: usize) {
        let d = self.d;
        let dh = d / self.heads;
        let m = n * len;
        let tok = |r: usize, t: usize| (r * total + t) * d;
        let mut h = vec![0f32; m * d];
        for r in 0..n {
            for t in 0..len {
                let dst = &mut h[(r * len + t) * d..][..d];
                dst.copy_from_slice(&x[tok(r, t)..][..d]);
                rms_norm(dst, &b.n1);
            }
        }
        let mut qkv = vec![0f32; m * 3 * d];
        b.qkv.gemm(&h, &mut qkv);
        let scale = 1.0 / (dh as f32).sqrt();
        let mut att = vec![0f32; m * d];
        let mut p = vec![0f32; len];
        for r in 0..n {
            let q0 = r * len;
            for hd in 0..self.heads {
                let off = hd * dh;
                for i in 0..len {
                    let q = &qkv[(q0 + i) * 3 * d + off..][..dh];
                    let mut mx = f32::NEG_INFINITY;
                    for j in 0..len {
                        let k = &qkv[(q0 + j) * 3 * d + d + off..][..dh];
                        let s = q.iter().zip(k).map(|(a, b)| a * b).sum::<f32>() * scale;
                        p[j] = s;
                        mx = mx.max(s);
                    }
                    let mut sum = 0f32;
                    for v in p.iter_mut() {
                        *v = exp(*v - mx);
                        sum += *v;
                    }
                    let o = &mut att[(q0 + i) * d + off..][..dh];
                    for j in 0..len {
                        let w = p[j] / sum;
                        let v = &qkv[(q0 + j) * 3 * d + 2 * d + off..][..dh];
                        for (a, b) in o.iter_mut().zip(v) {
                            *a += w * b;
                        }
                    }
                }
            }
        }
        b.proj.gemm(&att, &mut h);
        for r in 0..n {
            for t in 0..len {
                for (a, v) in x[tok(r, t)..][..d].iter_mut().zip(&h[(r * len + t) * d..][..d]) {
                    *a += v;
                }
            }
        }
        for (ty, &(a, z)) in TYPE_RANGES.iter().enumerate() {
            let z = z.min(len);
            if a >= z {
                continue;
            }
            let cnt = z - a;
            let mut hh = vec![0f32; n * cnt * d];
            for r in 0..n {
                for t in a..z {
                    let dst = &mut hh[(r * cnt + t - a) * d..][..d];
                    dst.copy_from_slice(&x[tok(r, t)..][..d]);
                    rms_norm(dst, &b.n2);
                }
            }
            let mut u = b.up[ty].call(&hh);
            gelu(&mut u);
            b.down[ty].gemm(&u, &mut hh);
            for r in 0..n {
                for t in a..z {
                    for (o, v) in x[tok(r, t)..][..d].iter_mut().zip(&hh[(r * cnt + t - a) * d..][..d]) {
                        *o += v;
                    }
                }
            }
        }
    }
}
