"""Record seeded rollouts of saved checkpoints to JSON (consumed by the web demo and GIF renderer).
Usage: python -m rl.rollout"""
import json, random
from pathlib import Path
import numpy as np
import torch
from overcooked_ai_py.mdp.actions import Direction
from . import config as C
from .envtools import Env
from .vdn import Checkpoint
from .intent import Intent, PotInfo

ROOT = Path(__file__).resolve().parent.parent
FACING = {(0, -1): "up", (0, 1): "down", (1, 0): "right", (-1, 0): "left"}


class Snapshot:
    @staticmethod
    def events(prev, stats):
        out = []
        for k, w in C.REWARD_WEIGHTS.items():
            for i in (0, 1):
                n = len(stats.get(k, [[], []])[i]) - len(prev.get(k, [[], []])[i])
                if n > 0: out.append(dict(who=i, kind=k, reward=w))
        return out

    @staticmethod
    def frame(env, terrain, tiles, qs, ev, soups):
        st = env.state; pots = PotInfo.summary(st, tiles["P"]); fr = dict(p=[], pots=pots, soups=soups, ev=ev)
        for i, pl in enumerate(st.players):
            held = pl.held_object.name if pl.held_object else None
            d = dict(x=pl.position[0], y=pl.position[1], f=FACING[pl.orientation], h=held)
            d["intent"] = Intent.from_policy(qs[i], pl.position, held, pots, terrain, tiles)
            fr["p"].append(d)
        fr["counter"] = [dict(x=k[0], y=k[1], o=v.name) for k, v in st.objects.items() if k not in tiles["P"]]
        return fr


class Rollout:
    @staticmethod
    def run(pt, eps, seed, steps=C.HORIZON):
        random.seed(seed); np.random.seed(seed)
        env = Env.make(horizon=steps); env.reset()
        net = Checkpoint.load(pt, len(Env.obs(env)[0]))
        terrain = env.mdp.terrain_mtx
        tiles = {t: [(x, y) for y, r in enumerate(terrain) for x, c in enumerate(r) if c == t] for t in "PODS"}
        prev = {k: [list(a) for a in v] for k, v in env.game_stats.items() if isinstance(v, list)}
        frames, soups, done = [], 0, False
        o = Env.obs(env)
        with torch.no_grad(): qs = [net(torch.as_tensor(x)[None])[0].numpy() for x in o]
        frames.append(Snapshot.frame(env, terrain, tiles, qs, [], 0))
        while not done:
            acts = [int(np.argmax(q)) if random.random() >= eps else random.randrange(6) for q in qs]
            _, _, done, _ = env.step(Env.to_joint(*acts))
            stats = env.game_stats; ev = Snapshot.events(prev, stats)
            prev = {k: [list(a) for a in v] for k, v in stats.items() if isinstance(v, list)}
            soups += sum(e["kind"] == "soup_delivery" for e in ev)
            o = Env.obs(env)
            with torch.no_grad(): qs = [net(torch.as_tensor(x)[None])[0].numpy() for x in o]
            fr = Snapshot.frame(env, terrain, tiles, qs, ev, soups); fr["a"] = acts
            frames.append(fr)
        return dict(eps=eps, seed=seed, soups=soups, terrain=["".join(r) for r in terrain], frames=frames)


def stage_eps(ep):
    return max(C.EPS_MIN, C.EPS_START * C.EPS_DECAY ** ep)


if __name__ == "__main__":
    out = ROOT.parent / "web" / "data"; out.mkdir(parents=True, exist_ok=True)
    summary = {}
    jobs = [(f"stage_ep{e}", ROOT / "results/ckpt" / f"vdn_ep{e}.pt", stage_eps(e)) for e in C.CHECKPOINT_EPISODES]
    jobs += [("greedy_ep0", ROOT / "results/ckpt/vdn_ep0.pt", 0.05),
             ("greedy_ep200", ROOT / "results/ckpt/vdn_ep200.pt", 0.05),
             ("nosoup_ep100", ROOT / "results_nosoup/ckpt/vdn_ep100.pt", 0.05),
             ("full_ep100", ROOT / "results/ckpt/vdn_ep100.pt", 0.05)]
    for name, pt, eps in jobs:
        r = Rollout.run(pt, eps, seed=11)
        json.dump(r, open(out / f"{name}.json", "w"), separators=(",", ":"))
        summary[name] = dict(soups=r["soups"], eps=round(eps, 3))
        print(name, summary[name], flush=True)
    json.dump(summary, open(out / "rollout_summary.json", "w"), indent=1)
