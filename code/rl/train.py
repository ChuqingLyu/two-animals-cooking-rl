"""Train VDN on cramped_room. Usage: python -m rl.train [episodes]"""
import json, random, sys, time
from pathlib import Path
import numpy as np
import torch
from . import config as C
from .envtools import Env, Reward
from .vdn import VDN, Target, Checkpoint

OUT = Path(__file__).resolve().parent.parent / ("results" + ("_" + C.VARIANT if C.VARIANT else ""))


class Seeds:
    @staticmethod
    def fix(s):
        random.seed(s); np.random.seed(s); torch.manual_seed(s)


class Evaluate:
    @staticmethod
    def greedy(net, episodes=3, seed=123):
        random.seed(seed)
        env, soups = Env.make(), []
        for _ in range(episodes):
            env.reset(); done = False
            while not done:
                o0, o1 = Env.obs(env)
                with torch.no_grad():
                    a = [int(net(torch.as_tensor(o)[None]).argmax()) if random.random() > 0.05
                         else random.randrange(6) for o in (o0, o1)]
                _, _, done, _ = env.step(Env.to_joint(*a))
            soups.append(Reward.soups(env.game_stats))
        return float(np.mean(soups))


class Trainer:
    @staticmethod
    def run(episodes=C.EPISODES):
        Seeds.fix(C.SEED); torch.set_num_threads(4)
        OUT.mkdir(exist_ok=True); (OUT / "ckpt").mkdir(exist_ok=True)
        env = Env.make(); env.reset()
        obs_dim = len(Env.obs(env)[0])
        agent, eps, step = VDN(obs_dim), C.EPS_START, 0
        log = {k: [] for k in ("soups", "shaped", "loss", "eps", "secs")}
        evals = {}
        Trainer._ckpt(agent, 0, obs_dim, evals)
        for ep in range(1, episodes + 1):
            t0 = time.time(); env.reset(); done = False
            o0, o1 = Env.obs(env); prev = Reward.counts(env.game_stats)
            tot, losses = 0.0, []
            while not done:
                a0, a1 = agent.act(o0, eps), agent.act(o1, eps)
                _, _, done, _ = env.step(Env.to_joint(a0, a1))
                now = Reward.counts(env.game_stats)
                r = Reward.shaped(prev, now); prev = now; tot += r
                n0, n1 = Env.obs(env)
                agent.buf.add(o0, o1, a0, a1, r, n0, n1, float(done))
                l = agent.learn()
                if l is not None: losses.append(l)
                step += 1
                if step % C.HARD_TARGET_EVERY == 0: Target.hard(agent.tq, agent.q)
                o0, o1 = n0, n1
            for k, v in zip(log, (Reward.soups(env.game_stats), tot, float(np.mean(losses or [0])), eps, time.time() - t0)):
                log[k].append(v)
            print(f"ep {ep} soups={log['soups'][-1]} shaped={tot:.2f} eps={eps:.3f} {log['secs'][-1]:.1f}s", flush=True)
            eps = max(C.EPS_MIN, eps * C.EPS_DECAY)
            if ep in C.CHECKPOINT_EPISODES or ep == episodes:
                Trainer._ckpt(agent, ep, obs_dim, evals)
                np.savez(OUT / "train_log.npz", **{k: np.array(v) for k, v in log.items()})
                json.dump({"episodes_done": ep, "greedy_eval_soups": evals, "seed": C.SEED,
                           "soups_per_episode": log["soups"]}, open(OUT / "summary.json", "w"), indent=1)
        Plot.curve(log)

    @staticmethod
    def _ckpt(agent, ep, obs_dim, evals):
        evals[ep] = Evaluate.greedy(agent.q)
        Checkpoint.save(agent.q, OUT / "ckpt" / f"vdn_ep{ep}.pt", OUT / "ckpt" / f"vdn_ep{ep}.json",
                        {"episode": ep, "obs_dim": obs_dim, "greedy_eval_soups": evals[ep]})
        print(f"[ckpt] ep {ep} greedy-eval soups/ep = {evals[ep]:.2f}", flush=True)


class Plot:
    @staticmethod
    def curve(log):
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
        fig, ax = plt.subplots(1, 2, figsize=(10, 4))
        for a, k in zip(ax, ("soups", "shaped")):
            y = np.array(log[k]); a.plot(y, alpha=.35)
            w = min(10, len(y)); a.plot(np.convolve(y, np.ones(w) / w, "valid"))
            a.set_title(f"{k} per episode"); a.set_xlabel("episode")
        fig.tight_layout(); fig.savefig(OUT / "learning_curve.png", dpi=110)


if __name__ == "__main__":
    Trainer.run(int(sys.argv[1]) if len(sys.argv) > 1 else C.EPISODES)
