"""Export the trained Kai (soup_shaped seed 7, ep200) for the browser + a validation set.
Writes web/data/kai_net.json (weights as base64 float32, cramped_room geometry, motion-planner distance table)
and code/results/kai_validate.json (recorded states with Python features and Q-values).
Usage: python -m rl.export_web_net"""
import json, base64, random
from pathlib import Path
import numpy as np, torch
from overcooked_ai_py.mdp.actions import Direction
from .envtools import Env
from .vdn import Checkpoint

ROOT = Path(__file__).resolve().parent.parent
CKPT = ROOT / "results_presets/soup_shaped_s7/ckpt/vdn_ep200.pt"


def b64(a): return base64.b64encode(np.asarray(a, dtype="<f4").tobytes()).decode()


def state_json(st, mdp):
    pl = [dict(x=p.position[0], y=p.position[1], o=Direction.DIRECTION_TO_INDEX[p.orientation],
               h=p.held_object.name if p.held_object else None) for p in st.players]
    objs = []
    for pos, ob in st.objects.items():          # insertion order matters for tie-breaks
        d = dict(name=ob.name, x=pos[0], y=pos[1])
        if ob.name == "soup":
            d.update(n=len(ob.ingredients), idle=bool(ob.is_idle), ready=bool(ob.is_ready), rem=int(0 if ob.is_idle else ob.cook_time_remaining))
        objs.append(d)
    for p, d in zip(st.players, pl):            # held soup ingredient count
        if p.held_object and p.held_object.name == "soup": d["n"] = len(p.held_object.ingredients)
    return dict(p=pl, objects=objs)


if __name__ == "__main__":
    env = Env.make(); env.reset(); mdp = env.mdp; mp = env.mlam.motion_planner
    net = Checkpoint.load(CKPT, 96)
    lin = [m for m in net.body if isinstance(m, torch.nn.Linear)]
    starts = mdp.get_valid_player_positions_and_orientations()
    feats = [p for t, ps in mdp.terrain_pos_dict.items() if t != " " for p in ps]
    dist = {}
    for s in starts:
        row = {}
        for f in feats:
            best = None
            for g in mp.motion_goals_for_pos[f]:
                if mp.is_valid_motion_start_goal_pair(s, g):
                    dd = mp.get_gridworld_distance(s, g)
                    if best is None or dd < best: best = dd
            if best is not None: row[f"{f[0]},{f[1]}"] = int(best)
        dist[f"{s[0][0]},{s[0][1]},{Direction.DIRECTION_TO_INDEX[s[1]]}"] = row
    loc = lambda l: [list(p) for p in l]
    out = dict(model=str(CKPT.relative_to(ROOT.parent)), arch=[96, 256, 256, 6],
               layers=[dict(W=b64(m.weight.detach().numpy()), b=b64(m.bias.detach().numpy()), shape=list(m.weight.shape)) for m in lin],
               terrain=["".join(r) for r in mdp.terrain_mtx], onion_disp=loc(mdp.get_onion_dispenser_locations()),
               dish_disp=loc(mdp.get_dish_dispenser_locations()), serving=loc(mdp.get_serving_locations()),
               counters=loc(mdp.get_counter_locations()), pots=loc(mdp.get_pot_locations()), cook_time=20, dist=dist,
               actions=["up", "down", "right", "left", "stay", "interact"])
    json.dump(out, open(ROOT.parent / "web/data/kai_net.json", "w"), separators=(",", ":"))
    # validation states: rollouts with different exploration so counters/held soups/cooking states all appear
    recs = []
    for seed, eps in [(1, .05), (2, .3), (3, .6), (4, .3), (5, .9)]:
        random.seed(seed); np.random.seed(seed); env.reset(); done = False
        while not done:
            o = Env.obs(env)
            with torch.no_grad(): q = [net(torch.as_tensor(x)[None])[0].numpy() for x in o]
            recs.append(dict(state=state_json(env.state, mdp), feats=[x.tolist() for x in o], q=[x.tolist() for x in q]))
            a = [int(np.argmax(x)) if random.random() >= eps else random.randrange(6) for x in q]
            _, _, done, _ = env.step(Env.to_joint(*a))
    random.seed(0); recs = random.sample(recs, 800)
    json.dump(recs, open(ROOT / "results/kai_validate.json", "w"), separators=(",", ":"))
    print("states", len(recs), "dist rows", len(dist))
