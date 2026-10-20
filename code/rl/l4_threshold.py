"""L4 win-threshold measurement: trained Kai (agent 1, greedy) in cramped_room with (a) Wendy doing STAY,
(b) trained Wendy (agent 0, greedy). Random start positions per seed. Usage: python -m rl.l4_threshold"""
import json, random
from pathlib import Path
import numpy as np, torch
from overcooked_ai_py.mdp.overcooked_mdp import OvercookedGridworld
from overcooked_ai_py.mdp.overcooked_env import OvercookedEnv
from overcooked_ai_py.mdp.actions import Action
from .envtools import Env, Reward
from .vdn import Checkpoint

ROOT = Path(__file__).resolve().parent.parent
CKPT = ROOT / "results_presets/soup_shaped_s7/ckpt/vdn_ep200.pt"
STAY = Action.ACTION_TO_INDEX[Action.STAY]


def run(steps, seed, partner):
    random.seed(seed); np.random.seed(seed)
    mdp = OvercookedGridworld.from_layout_name("cramped_room")
    env = OvercookedEnv.from_mdp(mdp, start_state_fn=mdp.get_random_start_state_fn(random_start_pos=True, rnd_obj_prob_thresh=0.0), horizon=steps)
    env.reset()
    net = Checkpoint.load(CKPT, len(Env.obs(env)[0])); done = False
    while not done:
        o = Env.obs(env)
        with torch.no_grad(): a = [int(net(torch.as_tensor(x)[None])[0].argmax()) for x in o]
        if partner == "stay": a[0] = STAY
        _, _, done, _ = env.step(Env.to_joint(*a))
    return Reward.soups(env.game_stats)


if __name__ == "__main__":
    seeds = list(range(10)); res = {}
    for steps in (80, 240, 400):
        for partner in ("stay", "trained_wendy"):
            s = [run(steps, sd, partner) for sd in seeds]
            res[f"{partner}_{steps}"] = dict(steps=steps, partner=partner, soups=s, mean=float(np.mean(s)), min=min(s), max=max(s))
            print(partner, steps, s, flush=True)
    json.dump(res, open(ROOT / "l4_raw.json", "w"), indent=1)
