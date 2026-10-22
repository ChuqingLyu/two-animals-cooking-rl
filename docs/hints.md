# In-game hint copy · L0–L4

*Two Little Monsters Learn to Cook · for players around 12 · English UI*
Sources: `repo/web/game.js`, `index.html`, `i18n.js`; `characters_and_script.md` (authoritative); `GDD_level_design.md`.

## How hints work (spec)
- **Idle hint:** show after **5 s with no input** on the current step, as a speech bubble from the named speaker, and pulse/outline the **highlight target**. Clear on the next input. Max 12 words per line.
- **Wrong-action line:** show once when the game already flags a wrong action (kitchen `wrong` event → `wrong_x` + `wrong` sfx; unreachable tile click; L1 `pick_one` / `first_one` messages). Don't repeat it within 5 s.
- **Voices:** Dingo = warm, short, praising ("Nice work!"). Wendy = fast, excited, asks questions ("Ooh, what's that?"). Kai = slow, polite, shy, starts with "Um..." ("I'll do my best.").
- **Kitchen tiles** (grid `XXPXX / O···O / X···X / XDXSX`, x = column, y = row, from 0): onion boxes **O (0,1)** and **(4,1)**; pot **P (2,0)**; plate stack **D (1,3)**; serve window **S (3,3)**; counters **X**. Controls: arrows/WASD to move, **Space** to pick up / put down / use, or click a tile (the game walks there and uses it).
- Most levels open with a popup (a knowledge card in L1–L3), closed with **`#popClose`** ("Got it"). Its idle hint is shared: **Dingo: "Tap Got it when you're ready."**

### Suggested button icons
| Button (id / selector) | Label | Icon |
|---|---|---|
| `#popClose` | Got it | ✔ check mark |
| `#l0teach` | Yes, I'll teach them! | 🤝 handshake / raised hand |
| `#l0next`, `#l1next`, `#l2next`, `#l3next`, `#l4next` (`.next`) | Next ▶ | ▶ arrow (already in label) |
| `.starbtn[data-step=1..5]` (L1) | star toggle | ⭐ star (existing `star_button.png` / `_pressed`) |
| `#l1train`, `#l2train` | Train | 🏋️ dumbbell (or ↻ "practice loop") |
| `#eps` + `#dial` (L2) | curiosity dial | 🔍 magnifying glass |
| `#trail` (L2) | Show footprints | 👣 footprints |
| `#rate button[data-v=1..5]` (L3) | 1–5 | 🌡️ filling bar / 1–5 pips |
| `.ask` (`data-q=q1/q2/q3`) | Answer | 💬 speech bubble with "?" |
| `[data-theatre]` | Watch again | 🎬 replay / clapper |
| `#l4start` | Ready... cook! | 🍳 pan / ⏱ stopwatch |
| `#again` (L4 end screen) | Try again | ↻ circular arrow |
| `[data-fs]` | ⛶ fullscreen | ⛶ (keep) |

---

## L0 · Become a Soup Master (solo; Wendy is the player sprite, 1 onion fills the pot, it cooks by itself in ~3 s)
Steps light up only in order (`L0.STEP_OF`: pick_onion 1 → pot_onion 2 → ready 3 → pick_dish 4 → serve 5).

| # | Step id / trigger | Highlight target | Idle hint (5 s) | Wrong action → gentle line |
|---|---|---|---|---|
| 0.1 | `pick_onion` (step 1) | onion box O (0,1) / (4,1) | **Dingo:** "First, grab an onion from the onion box." | Space on an empty spot / wrong station → **Dingo:** "Not there. Look for the onion box." |
| 0.2 | `pot_onion` (step 2) | pot P (2,0) | **Dingo:** "Now walk to the pot and press Space." | Holding the onion at another station → **Dingo:** "Almost! The onion goes in the pot." |
| 0.3 | `ready` (step 3, automatic) | pot P (2,0) (cook ring) | **Dingo:** "Let it cook. Watch the ring fill up." | Pressing Space on the pot while it cooks → **Dingo:** "Patience! It's still cooking." |
| 0.4 | `pick_dish` (step 4) | plate stack D (1,3) | **Dingo:** "Soup's ready! Grab a plate from the plate stack." | Grabbed a plate before the soup was ready (step won't light) → **Dingo:** "Put the plate on a counter, then grab it again." |
| 0.5a | scoop soup (`pick_soup`, not a step on the bar) | pot P (2,0) | **Dingo:** "Take your plate to the pot to scoop the soup." | Plate used anywhere else → **Dingo:** "Plates go to the pot first. Scoop the soup!" |
| 0.5b | `serve` (step 5) | serve window S (3,3) | **Dingo:** "Serve it right here, at the serve window!" | Soup used on another tile → **Dingo:** "So close! The serve window is down there." |
| 0.6 | `#l0teach` (after intro video) | `#l0teach` | **Kai:** "Um... will you teach us? Tap the big button." | — (any press is right) |
| 0.7 | `#l0next` (same effect) | `#l0next` | **Wendy:** "Ooh, let's go! Press Next!" | — |

Unreachable-tile click (red X) anywhere in L0 → **Dingo:** "Can't walk there. Try a floor tile next to it."

## L1 · You Give the Stars (Reward)
Flow: knowledge card → toggle stars → **Train** (try 1 = exactly one star; up to 3 tries) → replay ends → **Next** unlocks.

| # | Step id / trigger | Highlight target | Idle hint (5 s) | Wrong action → gentle line |
|---|---|---|---|---|
| 1.1 | close card1 | `#popClose` | **Dingo:** "Tap Got it when you're ready." | — |
| 1.2 | toggle a star (first try) | `.starbtn` under steps 1–5 | **Dingo:** "Pick one step that deserves a star." | — |
| 1.3 | press Train | `#l1train` | **Wendy:** "Ooh, stars are set! Press Train, press Train!" | No star picked (`pick_one`) → **Kai:** "Um... I need at least one star, please." / More than one on try 1 (`first_one`) → **Dingo:** "First try, just one star. Then mix them!" |
| 1.4 | watch replay (no input needed) | `#c1` canvas + `#l1steps` | **Kai:** "Um... watch which steps light up for us." | — |
| 1.5 | try again (tries 2–3, optional) | `.starbtn` + `#l1train` | **Wendy:** "Want to try different stars? You can mix them now!" | Train pressed after 3/3 tries (button does nothing) → **Dingo:** "That's all three tries. Nice work! Press Next." |
| 1.6 | Answer (optional) | `.ask[data-q=q1]` | **Dingo:** "Why did Wendy keep grabbing onions? Tap Answer." | — (choices give their own feedback) |
| 1.7 | Next | `#l1next` (enabled after replay ends) | **Dingo:** "They learn whatever you reward. Press Next!" | — |

## L2 · Curious Monsters (Exploration)
Dial bands: < 0.10 almost zero · 0.10–0.60 curious then focused · > 0.60 very high (shows wandering during training).

| # | Step id / trigger | Highlight target | Idle hint (5 s) | Wrong action → gentle line |
|---|---|---|---|---|
| 2.1 | close card2 | `#popClose` | **Dingo:** "Tap Got it when you're ready." | — |
| 2.2 | set curiosity | `#eps` slider / `#dial` | **Wendy:** "Turn my curiosity dial! What happens up high?" | — |
| 2.3 | footprints (optional) | `#trail` | **Kai:** "Um... footprints show where we walked." | — |
| 2.4 | press Train | `#l2train` | **Dingo:** "Dial set? Press Train and watch them practice." | — |
| 2.5 | watch replay | `#c2` canvas + `#l2stats` | **Kai:** "Um... count how many bowls we make." | — |
| 2.6 | retry another band (optional) | `#eps` + `#l2train` | **Dingo:** "Try curiosity near zero, then in the middle." | — |
| 2.7 | Answer (optional) | `.ask[data-q=q2]` | **Dingo:** "Why let them be curious at first? Tap Answer." | — |
| 2.8 | Next | `#l2next` (enabled after replay ends) | **Wendy:** "That was fun! Press Next!" | — |

## L3 · Are You Sure? (Confidence)
Flow: card3 → child rates 1–5 (buttons lock) → bars fill You → Wendy → Kai → 60 s trained round plays → q3 popup opens itself → Next unlocks.

| # | Step id / trigger | Highlight target | Idle hint (5 s) | Wrong action → gentle line |
|---|---|---|---|---|
| 3.1 | close card3 | `#popClose` | **Dingo:** "Tap Got it when you're ready." | — |
| 3.2 | rate yourself | `#rate button[data-v=1..5]` | **Dingo:** "How sure are you we'll win? Pick 1 to 5." | — (every number is OK; buttons lock after one pick) |
| 3.3 | watch the round (no input) | `#confBars`, `#c3`, solid/dashed bubbles | **Kai:** "Um... a dashed bubble means I'm not sure." | — |
| 3.4 | answer q3 (auto popup) | `#popChoices` | **Dingo:** "Who was more sure, you or them? Pick one." | — |
| 3.5 | close popup | `#popClose` | **Dingo:** "Tap Got it when you're ready." | — |
| 3.6 | Next | `#l3next` | **Wendy:** "Contest time! Press Next!" | — |

## L4 · Soup Contest (Team value)
Child plays Wendy; Kai is AI. 60 s, win = **2+ bowls**. Pot holds 3 onions and does **not** cook by itself: once it has 1+ onion, press **Space empty-handed** at the pot ("▶ Space: cook!") to start; it cooks ~15 s. Kai's bubble shows his next job (dashed = unsure).

| # | Step id / trigger | Highlight target | Idle hint (5 s) | Wrong action → gentle line |
|---|---|---|---|---|
| 4.1 | start | `#l4start` | **Dingo:** "Press Ready... cook! when you're set." | — |
| 4.2 | `pick_onion` | onion box O (0,1) / (4,1) | **Kai:** "Um... could you grab an onion, please?" | Wrong station / empty spot → **Kai:** "Um... the onions are in the onion box." |
| 4.3 | `pot_onion` (up to 3) | pot P (2,0) | **Wendy:** "Onion in hand! Into the pot it goes!" | Pot full or cooking → **Kai:** "Um... the pot is busy. Maybe grab a plate?" |
| 4.4 | `start_cook` (empty hands) | pot P (2,0) "▶ Space: cook!" | **Dingo:** "Hands empty? Press Space at the pot to cook." | Space at pot while holding a plate before soup is ready → **Dingo:** "Not ready yet. Wait for the ring." |
| 4.5 | `pick_dish` | plate stack D (1,3) | **Kai:** "Um... soup's cooking. Can you get a plate?" | Plate grabbed with full hands → **Wendy:** "Oops, hands full! Put something down first." |
| 4.6 | `pick_soup` | pot P (2,0) | **Wendy:** "Ding! Soup's ready! Scoop it with your plate!" | — |
| 4.7 | `serve` | serve window S (3,3) | **Dingo:** "Serve it at the window. Every bowl counts!" | Soup used on another tile → **Kai:** "Um... the serve window is that way." |
| 4.8 | counter hand-off (optional) | empty counter X | **Kai:** "Um... you can leave things on a counter for me." | Counter already full → **Wendy:** "That spot's taken! Try another counter." |
| — | bump into Kai (`bump`) | Kai sprite | — | **Kai:** "Um... sorry! I'll move. Let's take turns." |
| 4.9a | end · fail → retry | `#again` | **Wendy:** "Let's try again! I know we can do it!" | — |
| 4.9b | end · Next | `#l4next` | **Dingo:** "Great teamwork! Press Next to see your cards." | — |

---
### Notes for implementers
- All hints describe existing behaviour only; no new mechanics. Kai's idle lines in 4.2–4.5 are suggestions in his voice, not promises that Kai will do the other job.
- Idle lines for watch-only phases (1.4, 2.5, 3.3) are optional; suppress them if a voice line is playing.
- Original characters only (Dingo, Wendy, Kai); no third-party characters used.
