"""GIFs from recorded rollouts (web/data/*.json) with real sprites -> gifs/."""
import json
from pathlib import Path
from PIL import Image
from rl.render import Draw, Gif

DATA = Path(__file__).resolve().parent.parent / "web" / "data"
OUT = Path(__file__).resolve().parent / "gifs"


class Compose:
    @staticmethod
    def side(a, b):
        im = Image.new("RGB", (a.width + b.width + 8, a.height), (255, 255, 255))
        im.paste(a, (0, 0)); im.paste(b, (a.width + 8, 0)); return im

    @staticmethod
    def pair(name_a, title_a, name_b, title_b, out, steps=200, trail=0):
        A, B = (json.load(open(DATA / f"{n}.json")) for n in (name_a, name_b))
        frames = []
        for i in range(0, steps, 2):  # every 2nd env step keeps files small
            tr = lambda R: [(f["p"][1]["x"], f["p"][1]["y"]) for f in R["frames"][max(0, i - trail):i + 1]] if trail else None
            fa = Draw.frame(A["terrain"], A["frames"][i], title_a, trail=tr(A))
            fb = Draw.frame(B["terrain"], B["frames"][i], title_b, trail=tr(B))
            frames.append(Compose.side(fa, fb))
        Gif.save(frames, OUT / out, fps=5)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    Compose.pair("greedy_ep0", "untrained VDN (ep 0)", "greedy_ep200", "trained VDN (ep 200)", "vdn_untrained_vs_trained.gif")
    Compose.pair("stage_ep25", "ep 25, explore 77%", "stage_ep200", "ep 200, explore 38%", "footprints_early_vs_late.gif", trail=60)
    Compose.pair("full_ep100", "soup reward 50", "nosoup_ep100", "soup reward 0", "soup_reward_50_vs_0.gif")
