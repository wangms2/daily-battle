"""Model v2 for self-play RL (plan-rl R3): a small pre-RMSNorm transformer over
observation v3 (features.rs OBS_VERSION 3), Jaxcalibur-style.

Tokens, in order: field 1, own team 6, foe team 6, own active's moves 4,
history 16; the 36 matchup tokens (each own slot vs up to 6 foe slots) join
halfway. Each token type has its own input encoder and FFN weights; attention
is shared.

Heads:
- policy over 14 action slots (moves 0-3, mega moves 4-7, switches 8-13), masked;
- value (win probability, from the field token);
- foe next action (14 slots, from the foe's tokens);
- foe item / ability / moves per foe slot (tied to the embedding tables).

    .venv\\Scripts\\python.exe model.py   # param count + GPU throughput
"""
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F

# Observation v3 layout (pe_env_genN.dims()).
TOKENS, MON_F, MON_BASE, MOVE_F, MON_IDS = 12, 165, 45, 30, 7
FIELD_F, HIST, HIST_F, HIST_IDS = 315, 16, 8, 2
# Matchups: each own slot against up to MATCH_FOES foe slots; token k is own slot k // MATCH_FOES.
MATCH_FOES = 6
MATCH, MATCH_F = 6 * MATCH_FOES, 20
MATCH_FOE_SLOT = slice(12, 18)  # the foe slot, one-hot
ACTIONS = 14
VOCAB = dict(species=1536, move=1024, item=512, ability=768)
UNK = {k: v - 1 for k, v in VOCAB.items()}
OBS_FLOATS = TOKENS * MON_F + FIELD_F + HIST * HIST_F + MATCH * MATCH_F
OBS_IDS = TOKENS * MON_IDS + HIST * HIST_IDS
assert (OBS_FLOATS, OBS_IDS) == (3143, 116)

# Token types and the order of the main sequence.
FIELD, OWN, FOE, MOVES, HISTORY, MATCHUP = range(6)
SEGMENTS = [(FIELD, 1), (OWN, 6), (FOE, 6), (MOVES, 4), (HISTORY, HIST)]
SEQ = sum(n for _, n in SEGMENTS)


@dataclass
class Config:
    # About 4.8M params (≈4.8 MB int8; owner OK'd going past 4 MB, Oct 31).
    d: int = 192
    layers: int = 4
    heads: int = 6
    ffn: int = 384
    emb: int = 64
    id_dropout: float = 0.15


class RMSNorm(nn.Module):
    def __init__(self, d):
        super().__init__()
        self.w = nn.Parameter(torch.ones(d))

    def forward(self, x):
        return F.rms_norm(x, (x.shape[-1],), self.w, 1e-6)


class TypedFFN(nn.Module):
    """A separate SwiGLU-free GELU MLP per token type, applied per segment."""

    def __init__(self, d, h, types=6):
        super().__init__()
        self.up = nn.ModuleList(nn.Linear(d, h) for _ in range(types))
        self.down = nn.ModuleList(nn.Linear(h, d) for _ in range(types))

    def forward(self, x, segments):
        out, at = [], 0
        for t, n in segments:
            out.append(self.down[t](F.gelu(self.up[t](x[:, at : at + n]))))
            at += n
        return torch.cat(out, 1)


class Block(nn.Module):
    def __init__(self, c: Config):
        super().__init__()
        self.n1, self.n2 = RMSNorm(c.d), RMSNorm(c.d)
        self.qkv = nn.Linear(c.d, 3 * c.d, bias=False)
        self.proj = nn.Linear(c.d, c.d, bias=False)
        self.ffn = TypedFFN(c.d, c.ffn)
        self.heads = c.heads

    def forward(self, x, segments):
        b, t, d = x.shape
        q, k, v = self.qkv(self.n1(x)).view(b, t, 3, self.heads, d // self.heads).permute(2, 0, 3, 1, 4)
        a = F.scaled_dot_product_attention(q, k, v).transpose(1, 2).reshape(b, t, d)
        x = x + self.proj(a)
        return x + self.ffn(self.n2(x), segments)


class Net(nn.Module):
    def __init__(self, c: Config = Config()):
        super().__init__()
        self.c = c
        d, e = c.d, c.emb
        self.species = nn.Embedding(VOCAB["species"], e)
        self.move = nn.Embedding(VOCAB["move"], e)
        self.item = nn.Embedding(VOCAB["item"], e)
        self.ability = nn.Embedding(VOCAB["ability"], e)
        mon_in = MON_BASE + 3 * e + 4 * (MOVE_F + e)
        self.enc_own = nn.Linear(mon_in, d)
        self.enc_foe = nn.Linear(mon_in, d)
        self.enc_field = nn.Linear(FIELD_F, d)
        self.enc_move = nn.Linear(MOVE_F + e + MON_BASE, d)
        self.enc_hist = nn.Linear(HIST_F + 2 * e, d)
        self.enc_match = nn.Linear(MATCH_F, d)
        self.slot = nn.Embedding(12, d)  # own 0-5, foe 6-11; shared with matchup tokens
        self.hist_pos = nn.Parameter(torch.zeros(HIST, d))
        self.move_pos = nn.Parameter(torch.zeros(4, d))
        self.in_norm = RMSNorm(d)
        self.blocks = nn.ModuleList(Block(c) for _ in range(c.layers))
        self.inject_at = c.layers // 2
        self.out_norm = RMSNorm(d)
        # Heads.
        self.pol_move = nn.Linear(d, 2)  # move, mega move
        self.pol_switch = nn.Linear(d, 1)
        self.value = nn.Sequential(nn.Linear(d, d), nn.GELU(), nn.Linear(d, 1))
        self.foe_move = nn.Linear(d, 8)
        self.foe_switch = nn.Linear(d, 1)
        self.set_item = nn.Linear(d, e)
        self.set_ability = nn.Linear(d, e)
        self.set_moves = nn.Linear(d, e)
        for p in [self.hist_pos, self.move_pos]:
            nn.init.normal_(p, std=0.02)

    def _drop_ids(self, ids):
        """ID dropout: names become "unknown" so the floats must carry the meaning."""
        if not self.training or self.c.id_dropout <= 0:
            return ids
        ids = ids.clone()
        drop = torch.rand(ids.shape, device=ids.device) < self.c.id_dropout
        mon = ids[:, : TOKENS * MON_IDS].view(-1, TOKENS, MON_IDS)
        unk_mon = torch.tensor(
            [UNK["species"], UNK["item"], UNK["ability"]] + [UNK["move"]] * 4, device=ids.device
        )
        mon_drop = drop[:, : TOKENS * MON_IDS].view(-1, TOKENS, MON_IDS)
        mon[mon_drop] = unk_mon.expand_as(mon)[mon_drop]
        hist = ids[:, TOKENS * MON_IDS :].view(-1, HIST, HIST_IDS)
        unk_hist = torch.tensor([UNK["species"], UNK["move"]], device=ids.device)
        hist_drop = drop[:, TOKENS * MON_IDS :].view(-1, HIST, HIST_IDS)
        hist[hist_drop] = unk_hist.expand_as(hist)[hist_drop]
        return ids

    def forward(self, floats, ids, mask):
        """floats [B, 3143] float, ids [B, 116] int, mask [B, 14] bool. Returns a dict of
        logits: policy [B,14] (masked), value [B], foe_action [B,14], item [B,6,512],
        ability [B,6,768], moves [B,6,1024]."""
        b = floats.shape[0]
        ids = self._drop_ids(ids.long())
        at = 0
        mons = floats[:, : TOKENS * MON_F].view(b, TOKENS, MON_F)
        at += TOKENS * MON_F
        field = floats[:, at : at + FIELD_F]
        at += FIELD_F
        hist_f = floats[:, at : at + HIST * HIST_F].view(b, HIST, HIST_F)
        at += HIST * HIST_F
        match_f = floats[:, at:].view(b, MATCH, MATCH_F)
        mon_ids = ids[:, : TOKENS * MON_IDS].view(b, TOKENS, MON_IDS)
        hist_ids = ids[:, TOKENS * MON_IDS :].view(b, HIST, HIST_IDS)

        move_f = mons[:, :, MON_BASE:].reshape(b, TOKENS, 4, MOVE_F)
        move_e = self.move(mon_ids[:, :, 3:])  # [b,12,4,e]
        mon_in = torch.cat(
            [
                mons[:, :, :MON_BASE],
                self.species(mon_ids[:, :, 0]),
                self.item(mon_ids[:, :, 1]),
                self.ability(mon_ids[:, :, 2]),
                torch.cat([move_f, move_e], -1).flatten(2),
            ],
            -1,
        )
        slots = self.slot.weight
        own = self.enc_own(mon_in[:, :6]) + slots[:6]
        foe = self.enc_foe(mon_in[:, 6:]) + slots[6:]
        # The own active's moves as their own tokens (the policy reads move logits off them).
        own_active = mons[:, :6, 1].argmax(1)
        ar = torch.arange(b, device=floats.device)
        act_moves = torch.cat(
            [move_f[ar, own_active], move_e[ar, own_active], mons[ar, own_active, :MON_BASE].unsqueeze(1).expand(-1, 4, -1)],
            -1,
        )
        moves = self.enc_move(act_moves) + self.move_pos
        hist = self.enc_hist(torch.cat([hist_f, self.species(hist_ids[:, :, 0]), self.move(hist_ids[:, :, 1])], -1))
        hist = hist + self.hist_pos
        x = torch.cat([self.enc_field(field).unsqueeze(1), own, foe, moves, hist], 1)
        x = self.in_norm(x)
        match_slots = slots[:6].repeat_interleave(MATCH_FOES, 0) + match_f[..., MATCH_FOE_SLOT] @ slots[6:]
        match = self.in_norm(self.enc_match(match_f) + match_slots)

        segments = SEGMENTS
        for i, blk in enumerate(self.blocks):
            if i == self.inject_at:
                x = torch.cat([x, match], 1)
                segments = SEGMENTS + [(MATCHUP, MATCH)]
            x = blk(x, segments)
        x = self.out_norm(x).float()

        field_t, own_t, foe_t = x[:, 0], x[:, 1:7], x[:, 7:13]
        move_t = x[:, 13:17]
        mv = self.pol_move(move_t)  # [b,4,2]
        policy = torch.cat([mv[..., 0], mv[..., 1], self.pol_switch(own_t).squeeze(-1)], 1)
        policy = policy.masked_fill(~mask, -1e9)
        foe_active = mons[:, 6:, 1].argmax(1)
        foe_action = torch.cat([self.foe_move(foe_t[ar, foe_active]), self.foe_switch(foe_t).squeeze(-1)], 1)
        return dict(
            policy=policy,
            value=self.value(field_t).squeeze(-1),
            foe_action=foe_action,
            item=self.set_item(foe_t) @ self.item.weight.float().T,
            ability=self.set_ability(foe_t) @ self.ability.weight.float().T,
            moves=self.set_moves(foe_t) @ self.move.weight.float().T,
        )


def count(m):
    return sum(p.numel() for p in m.parameters())


def upgrade(sd):
    """A state dict from an older observation layout, made loadable: observation v2 had
    12-float matchup tokens; v3's 20 floats start with the same 12, so the new
    inputs' weights start at zero. Returns the slot of each padded parameter's name."""
    w = sd.get("enc_match.weight")
    if w is not None and w.shape[1] < MATCH_F:
        sd["enc_match.weight"] = torch.cat([w, w.new_zeros(w.shape[0], MATCH_F - w.shape[1])], 1)
        return {"enc_match.weight": w.shape[1]}
    return {}


def load(net, sd):
    """Loads `sd` into `net`, upgrading older layouts (see `upgrade`)."""
    sd = dict(sd)
    upgrade(sd)
    net.load_state_dict(sd)
    return net


def _bench():
    import argparse
    import sys
    import time
    from pathlib import Path

    p = argparse.ArgumentParser()
    p.add_argument("--d", type=int, default=Config.d)
    p.add_argument("--layers", type=int, default=Config.layers)
    p.add_argument("--heads", type=int, default=Config.heads)
    p.add_argument("--ffn", type=int, default=Config.ffn)
    a = p.parse_args()
    here = Path(__file__).parent
    sys.path.insert(0, str(here))
    import numpy as np
    import pe_env_gen6 as pe

    dev = "cuda"
    net = Net(Config(d=a.d, layers=a.layers, heads=a.heads, ffn=a.ffn)).to(dev)
    emb = sum(p.numel() for n, p in net.named_parameters() if n in ("species.weight", "move.weight", "item.weight", "ability.weight"))
    print(f"params {count(net) / 1e6:.2f}M (embeddings {emb / 1e6:.2f}M, rest {(count(net) - emb) / 1e6:.2f}M)")
    env = pe.VecEnv(2048, 1, str(here / "data" / "catalog"))
    rng = np.random.default_rng(0)
    for _ in range(20):
        _, _, m, _ = env.observe()
        env.step((rng.random(m.shape) * m).argmax(1).astype(np.int64))
    f, i, m, n = env.observe()
    f = torch.from_numpy(f).to(dev)
    i = torch.from_numpy(i.astype(np.int32)).to(dev)
    m = torch.from_numpy(m).to(dev)
    m[~m.any(1), 0] = True
    B = f.shape[0]
    opt = torch.optim.AdamW(net.parameters(), 3e-4)

    def fwd(train):
        with torch.autocast("cuda", torch.bfloat16):
            return net(f, i, m)

    # Inference.
    net.eval()
    with torch.no_grad():
        for _ in range(3):
            fwd(False)
        torch.cuda.synchronize()
        t = time.perf_counter()
        for _ in range(10):
            fwd(False)
        torch.cuda.synchronize()
        inf = 10 * B / (time.perf_counter() - t)
    # Training step (forward + backward).
    net.train()

    def train_step():
        out = fwd(True)
        loss = F.cross_entropy(out["policy"], m.float().argmax(1)) + out["value"].float().pow(2).mean()
        loss = loss + sum(out[k].float().logsumexp(-1).mean() for k in ("foe_action", "item", "ability", "moves"))
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()

    for _ in range(3):
        train_step()
    torch.cuda.synchronize()
    t = time.perf_counter()
    for _ in range(10):
        train_step()
    torch.cuda.synchronize()
    tr = 10 * B / (time.perf_counter() - t)
    print(f"batch {B}: inference {inf:,.0f} rows/s, training {tr:,.0f} rows/s, peak mem {torch.cuda.max_memory_allocated() / 2**30:.1f} GB")
    # Decisions per second through PPO: 1 rollout forward + epochs x (forward + backward).
    for epochs in (1, 2):
        print(f"  PPO with {epochs} epoch(s): about {1 / (1 / inf + epochs / tr):,.0f} decisions/s")


if __name__ == "__main__":
    _bench()
