"""Rule-based bunny+bear (overcooked GreedyHumanModel) on cramped_room -> gifs/rule_partner.gif.
Bubble = Intent.rule (fixed: full/cooking pot -> dish/soup bubble, not onion)."""
import json, random
from pathlib import Path
import numpy as np
from overcooked_ai_py.agents.agent import GreedyHumanModel, AgentPair
from overcooked_ai_py.planning.planners import MediumLevelActionManager, NO_COUNTERS_PARAMS
from rl.envtools import Env
from rl.intent import Intent, PotInfo
from rl.rollout import FACING
from rl.render import Draw, Gif

OUT = Path(__file__).resolve().parent / "gifs"


class RuleDemo:
    @staticmethod
    def run(steps=200, seed=0):
        random.seed(seed); np.random.seed(seed)
        env = Env.make(horizon=steps); env.reset(); mdp = env.mdp
        mlam = MediumLevelActionManager.from_pickle_or_compute(mdp, NO_COUNTERS_PARAMS, force_compute=False)
        pair = AgentPair(GreedyHumanModel(mlam), GreedyHumanModel(mlam)); pair.set_mdp(mdp)
        terrain = mdp.terrain_mtx; pot_xy = [(x, y) for y, r in enumerate(terrain) for x, c in enumerate(r) if c == "P"]
        frames, soups, done = [], 0, False
        while not done:
            ja = pair.joint_action(env.state)
            _, r, done, _ = env.step((ja[0][0], ja[1][0])); soups += int(r // 20)
            st = env.state; pots = PotInfo.summary(st, pot_xy)
            fr = dict(pots=pots, soups=soups, ev=[], p=[],
                      counter=[dict(x=k[0], y=k[1], o=v.name) for k, v in st.objects.items() if k not in pot_xy])
            for pl in st.players:
                h = pl.held_object.name if pl.held_object else None
                fr["p"].append(dict(x=pl.position[0], y=pl.position[1], f=FACING[pl.orientation], h=h,
                                    intent=dict(icon=Intent.rule(h, pots), conf=1.0, style="solid")))
            frames.append(fr)
        return terrain, frames, soups


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    terrain, frames, soups = RuleDemo.run()
    Gif.save([Draw.frame(terrain, f, "rule-based AI partner (scripted)") for f in frames[::2]], OUT / "rule_partner.gif", fps=5)
    print("rule demo soups in 200 steps:", soups)
