"""Train + export reward/exploration presets for the 'child is the trainer' levels.
Usage: python -m rl.presets train NAME SEED   |   python -m rl.presets export"""
import json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRESETS = {
    "soup_only":   dict(weights={"soup_delivery": 50.0}),
    "soup_shaped": dict(),                                   # default config.REWARD_WEIGHTS
    "onion_only":  dict(weights={"onion_pickup": 1.0}),
    "pot_only":    dict(weights={"potting_onion": 1.0}),
    "eps_low":     dict(eps="0.01,0.01,1.0"),
    "eps_default": dict(),                                   # 0.85 * 0.996^ep, floor 0.05
    "eps_high":    dict(eps="0.8,0.8,1.0"),
}
REWARD = ["soup_only", "soup_shaped", "onion_only", "pot_only"]


def env_for(name, seed):
    p, e = PRESETS[name], dict(os.environ, VDN_SEED=str(seed), VDN_EVAL_EVERY="10", VDN_THREADS="1",
                               VDN_OUT=f"results_presets/{name}_s{seed}")
    if "weights" in p: e["VDN_WEIGHTS"] = json.dumps(p["weights"])
    if "eps" in p: e["VDN_EPS"] = p["eps"]
    return e


def export():
    import numpy as np
    from .rollout import Rollout
    out = ROOT.parent / "web/data/presets"; out.mkdir(parents=True, exist_ok=True)
    summary = {}
    for d in sorted(x for x in (ROOT / "results_presets").iterdir() if x.is_dir()):
        name, seed = d.name.rsplit("_s", 1)
        s = json.load(open(d / "summary.json")); ep = s["episodes_done"]
        ev = {int(k): v for k, v in s["greedy_eval_soups"].items()}
        first5 = next((k for k in sorted(ev) if ev[k] >= 5), None)
        r = Rollout.run(d / "ckpt" / f"vdn_ep{ep}.pt", 0.05, seed=11)
        r0 = Rollout.run(d / "ckpt" / f"vdn_ep{ep}.pt", 0.0, seed=11)
        cnt = {}
        for f in r["frames"]:
            for e in f["ev"]: cnt[e["kind"]] = cnt.get(e["kind"], 0) + 1
        row = dict(preset=name, seed=seed, reward_weights={k: v for k, v in s["reward_weights"].items() if v},
                   eps_schedule=s["eps_schedule"], final_eval_soups=ev[ep],
                   rollout_soups_eps005=r["soups"], rollout_soups_eps0=r0["soups"],
                   first_eval_ep_ge5_soups=first5, train_soups_last10=float(np.mean(s["soups_per_episode"][-10:])),
                   train_return_last10=float(np.mean(s["shaped_return_per_episode"][-10:])),
                   rollout_event_counts=cnt,
                   curve=dict(eval_episodes=sorted(ev), eval_soups=[ev[k] for k in sorted(ev)],
                              train_soups=s["soups_per_episode"], train_return=s["shaped_return_per_episode"]))
        summary[f"{name}_s{seed}"] = row
        if seed == "7":
            r["preset"] = {k: v for k, v in row.items()}
            json.dump(r, open(out / f"{name}.json", "w"), separators=(",", ":"))
        print(name, seed, {k: row[k] for k in ("final_eval_soups", "rollout_soups_eps005", "rollout_soups_eps0", "first_eval_ep_ge5_soups")}, cnt, flush=True)
    json.dump(summary, open(out / "summary.json", "w"), indent=1)


if __name__ == "__main__":
    if sys.argv[1] == "train":
        name, seed = sys.argv[2], int(sys.argv[3])
        subprocess.run([sys.executable, "-m", "rl.train"], env=env_for(name, seed), check=True)
    else:
        export()
