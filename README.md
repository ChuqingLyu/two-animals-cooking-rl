# 两只小动物学做饭 · Two Little Chefs Learn to Cook (demo)

A playable **web demo + GIFs** for a Grade-7 lesson on reinforcement learning: **reward**, **exploration**, **cooperation**
(plus a "team value" card explaining VDN). The child controls the *player* character; the *AI partner* shows an intent bubble.
This is a prototype, not a full game. Art is placeholder; characters are being redesigned.

## What is here
| Path | What |
|---|---|
| `code/rl/` | Clean VDN re-implementation (shared MLP Q-net, Q_tot = Q0 + Q1, double-DQN target) on Overcooked-AI `cramped_room` |
| `code/rl/intent.py` | Intent bubble from the policy: icon = sub-goal the greedy action moves toward; confidence = softmax max of Q (also logs top-2 gap) → solid / dashed+? |
| `code/results/` | Checkpoints ep 0/25/50/100/200 (`.pt` + JSON weights), `train_log.npz`, `summary.json`, `learning_curve.png`, `train.log` |
| `code/results_nosoup/` | Same training with soup-delivery reward = 0 (100 episodes), for Level 1 |
| `code/gifs/` | GIFs rendered with the sprites |
| `web/` | Static demo (plain JS canvas, no build, no server logic) |

## Training results (CPU, seed 7, 200 episodes × 400 steps, ~1.2 s/episode, ~5 min)
Soups delivered per training episode (ε-greedy, mean over window): ep 1-25: **0.44**, 26-50: **1.36**, 51-100: **5.2**, 101-150: **8.9**, 151-200: **11.0** (last episode 13).
Greedy evaluation (ε = 0.05, 3 episodes) at checkpoints: ep0 **0**, ep25 **0**, ep50 **9.3**, ep100 **14.7**, ep200 **16.0** soups / 400 steps.
Soup reward = 0 variant: greedy eval at ep100 = **0** soups (only accidental deliveries while exploring).

## Run
```bash
cd code && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
# numpy 2: overcooked-ai 1.1.0 uses np.Inf -> patch site-packages: sed -i 's/np\.Inf/np.inf/g' <overcooked_ai_py files>
python -m rl.train                     # 200 episodes -> results/
VDN_VARIANT=nosoup python -m rl.train 100   # -> results_nosoup/
python -m rl.rollout                   # records rollouts -> ../web/data/*.json
python make_gifs.py && python rule_demo.py  # -> gifs/
cd ../web && python -m http.server 8000     # open http://localhost:8000
```
The page must be served over http (any static server / GitHub Pages) because it `fetch`es JSON; opening `index.html` via `file://` will not load data.

## Web demo
* **Level 1 Reward** – owl knowledge card, reward table, "+reward" popups from real game events, soup-reward selector **50 / 0** (each a really trained policy), end question.
* **Level 2 Exploration** – slider over checkpoints ep 0/25/50/100/200, each replayed at the ε it had at that point in training; footprint trails; guess question.
* **Level 3 Cooperation** – arrow keys + Space; bubble on/off toggle; dashed bubble prompts "小熊没把握，你觉得它对吗？" with agree / disagree buttons; 60 s rounds; recap shows *real* counts from the rounds played (soups, teamwork moments = soups both contributed to or counter hand-offs, bumps, times questioned) and bubble ON vs OFF average soups.
* **Team value card** – replays the ep-200 policy and shows Q_player + Q_partner = Q_team from the real network.
* zh/en toggle; all copy in `web/i18n.js` (lines marked *placeholder* await the copywriter).
* All art is loaded by filename from `web/assets/manifest.json` (`player` / `partner` / tiles / bubbles / owl). Character sprites can be up to 64×96; they are drawn bottom-anchored to the tile with the bubble above the sprite top. Swap art by replacing files or editing the manifest.

**How the AI is run in the browser:** Levels 1, 2 and the team card use **precomputed rollouts** of the real checkpoints (`web/data/*.json`, recorded by `rl/rollout.py`).
Level 3's AI partner is a **rule planner in JS** (BFS + the same sub-goal logic as `intent.py`), because the trained net needs Overcooked's `featurize_state_mdp` (96 features incl. planner distances), which was not ported. JSON weights are exported (`results/ckpt/*.json`) for a future JS port.

## Limitations / honesty notes
* **Bubbles are not true policy explanations.** The icon combines held object + pot state rules with the direction of the greedy action; confidence is a softmax over Q-values. In Level 3 the bubble and its confidence are fully rule-based (ambiguous job split or path blocked → dashed).
* Rule fix included: a full / cooking / ready pot now gives a dish/soup bubble instead of onion.
* Only one layout (cramped_room), one seed, small eval (3 episodes). Q "values" on the team card are unnormalised returns.
* **No testing with children has been done.** Usability, learning effect and copy must be validated with teachers and students.
* **Ethics:** any classroom pilot needs school approval and **parental consent**; do not collect personal data (the demo stores nothing and sends nothing).

## Credits
Environment: [overcooked_ai](https://github.com/HumanCompatibleAI/overcooked_ai). VDN: Sunehag et al., 2017.
