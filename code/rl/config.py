"""All hyper-parameters in one place (VDN on Overcooked cramped_room)."""
LAYOUT = "cramped_room"
HORIZON = 400
EPISODES = 200
SEED = 7
CHECKPOINT_EPISODES = (0, 25, 50, 100, 200)

EPS_START, EPS_MIN, EPS_DECAY = 0.85, 0.05, 0.996
STEP_PENALTY = -0.005
HARD_TARGET_EVERY = 2000

NET = dict(hidden=256, actions=6)
OPT = dict(lr=5e-4, gamma=0.99, buffer=150_000, batch=64, tau=0.01, clip=10.0)

REWARD_WEIGHTS = {
    "useful_onion_pickup": 0.10, "useful_onion_drop": 0.15,
    "useful_dish_pickup": 0.30, "useful_dish_drop": 0.15,
    "potting_onion": 1.0, "useless_onion_potting": -0.5,
    "catastrophic_onion_potting": -1.0,
    "soup_pickup": 3.0, "soup_delivery": 50.0,
}

# Variant for Level 1 "what if soup reward = 0?": VDN_VARIANT=nosoup python -m rl.train 100
import os
VARIANT = os.environ.get("VDN_VARIANT", "")
if VARIANT == "nosoup":
    REWARD_WEIGHTS = {**REWARD_WEIGHTS, "soup_delivery": 0.0}
    CHECKPOINT_EPISODES = (0, 100)

# Preset knobs (all optional env vars, used by rl/presets.py):
#   VDN_WEIGHTS='{"soup_delivery":50}'  -> replaces REWARD_WEIGHTS (unlisted events weigh 0)
#   VDN_SEED, VDN_EPS="start,min,decay", VDN_EVAL_EVERY (greedy eval every N eps), VDN_OUT (results dir name)
for _k in ("onion_pickup", "onion_drop", "dish_pickup"): REWARD_WEIGHTS.setdefault(_k, 0.0)  # raw events, 0 by default
if os.environ.get("VDN_WEIGHTS"):
    import json as _json
    REWARD_WEIGHTS = {k: 0.0 for k in REWARD_WEIGHTS} | _json.loads(os.environ["VDN_WEIGHTS"])
SEED = int(os.environ.get("VDN_SEED", SEED))
if os.environ.get("VDN_EPS"):
    EPS_START, EPS_MIN, EPS_DECAY = map(float, os.environ["VDN_EPS"].split(","))
EVAL_EVERY = int(os.environ.get("VDN_EVAL_EVERY", 0))
OUT_NAME = os.environ.get("VDN_OUT", "")
