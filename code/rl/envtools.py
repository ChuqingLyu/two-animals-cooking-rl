"""Environment construction, observation and shaped reward helpers."""
import numpy as np
from overcooked_ai_py.mdp.overcooked_mdp import OvercookedGridworld
from overcooked_ai_py.mdp.overcooked_env import OvercookedEnv
from overcooked_ai_py.mdp.actions import Action
from . import config as C


class Env:
    @staticmethod
    def make(layout=C.LAYOUT, horizon=C.HORIZON):
        return OvercookedEnv.from_mdp(OvercookedGridworld.from_layout_name(layout), horizon=horizon)

    @staticmethod
    def obs(env):
        a, b = env.featurize_state_mdp(env.state)
        return a.astype(np.float32), b.astype(np.float32)

    @staticmethod
    def to_joint(a0, a1):
        return Action.INDEX_TO_ACTION[a0], Action.INDEX_TO_ACTION[a1]


class Reward:
    """Shaped reward = step penalty + weighted increments of env.game_stats event counts."""
    @staticmethod
    def counts(stats):
        return {k: sum(len(x) for x in stats.get(k, [[], []])) for k in C.REWARD_WEIGHTS}

    @staticmethod
    def shaped(prev_counts, now_counts):
        return C.STEP_PENALTY + sum(w * (now_counts[k] - prev_counts[k]) for k, w in C.REWARD_WEIGHTS.items())

    @staticmethod
    def soups(stats):
        return sum(len(x) for x in stats.get("soup_delivery", [[], []]))
