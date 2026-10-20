"""Render rollout frames (JSON format from rl.rollout) to GIFs using sprites from web/assets/manifest.json."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
import imageio.v2 as imageio
import numpy as np

ASSETS = Path(__file__).resolve().parent.parent.parent / "web" / "assets"
T, TOP = 64, 56
TILE = {"X": "counter", "P": "pot", "O": "onion", "D": "dish", "S": "serve", " ": "floor"}
ITEM_COL = {"onion": (240, 200, 60), "dish": (245, 245, 245), "soup": (230, 120, 50)}


class Sprites:
    _cache = None

    @staticmethod
    def get():
        if Sprites._cache: return Sprites._cache
        m = json.load(open(ASSETS / "manifest.json")); s = {}
        for k, f in m["tiles"].items(): s["t_" + k] = Image.open(ASSETS / f).convert("RGBA").resize((T, T))
        for who in ("player", "partner"):  # keep aspect, width <= 64, bottom-anchored when drawn
            for k, f in m[who].items():
                im = Image.open(ASSETS / f).convert("RGBA")
                if im.width > T: im = im.resize((T, int(im.height * T / im.width)))
                s[f"{who}_{k}"] = im
        for k, f in m["bubbles"].items():
            im = Image.open(ASSETS / f).convert("RGBA"); w = 40
            s["b_" + k] = im.resize((w, int(im.height * w / im.width)))
        Sprites._cache = s
        return s


class Draw:
    @staticmethod
    def item(d, cx, cy, name, r=9):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ITEM_COL.get(name, (200, 200, 200)), outline=(90, 60, 30), width=2)

    @staticmethod
    def dashed(im, conf):
        """Low confidence: fade bubble and add dashed outline + '?'."""
        im = im.copy(); a = np.array(im); a[..., 3] = (a[..., 3] * 0.55).astype(np.uint8); im = Image.fromarray(a)
        d = ImageDraw.Draw(im); w, h = im.size
        for x in range(0, w, 6): d.line([x, 0, x + 3, 0], fill=(80, 80, 80), width=2); d.line([x, h - 1, x + 3, h - 1], fill=(80, 80, 80), width=2)
        for y in range(0, h, 6): d.line([0, y, 0, y + 3], fill=(80, 80, 80), width=2); d.line([w - 1, y, w - 1, y + 3], fill=(80, 80, 80), width=2)
        d.text((w - 10, 2), "?", fill=(200, 30, 30))
        return im

    @staticmethod
    def frame(terrain, fr, title="", bubble=True, trail=None, trail_col=(70, 120, 220)):
        S = Sprites.get(); H, W = len(terrain), len(terrain[0])
        im = Image.new("RGBA", (W * T, H * T + TOP), (255, 248, 236)); d = ImageDraw.Draw(im)
        for y, row in enumerate(terrain):
            for x, c in enumerate(row): im.paste(S["t_" + TILE[c]], (x * T, y * T + TOP))
        for i, p in enumerate(fr["pots"]):
            px, py = [(x, y) for y, r in enumerate(terrain) for x, c in enumerate(r) if c == "P"][i]
            if p["n"]:
                col = (60, 170, 60) if p["ready"] else (230, 120, 50) if p["cooking"] else (90, 90, 90)
                d.rectangle([px * T + 18, py * T + TOP + 44, px * T + 46, py * T + TOP + 60], fill=col)
                d.text((px * T + 22, py * T + TOP + 46), "ok" if p["ready"] else f"{p['n']}/3", fill=(255, 255, 255))
        for c in fr.get("counter", []): Draw.item(d, c["x"] * T + 32, c["y"] * T + TOP + 32, c["o"])
        if trail:
            for k, (x, y) in enumerate(trail):
                a = int(40 + 180 * k / max(1, len(trail)))
                d.ellipse([x * T + 26, y * T + TOP + 26, x * T + 38, y * T + TOP + 38], fill=trail_col + (a,))
        for i, p in enumerate(fr["p"]):
            spr = S[f"{('player', 'partner')[i]}_{p['f']}"]
            im.alpha_composite(spr, (p["x"] * T + (T - spr.width) // 2, max(0, p["y"] * T + TOP + T - spr.height)))
            if p["h"]: Draw.item(d, p["x"] * T + 48, p["y"] * T + TOP + 50, p["h"], 7)
        if bubble:
            p = fr["p"][1]; it = p["intent"]; b = S["b_" + it["icon"]]
            if it["style"] == "dashed": b = Draw.dashed(b, it["conf"])
            im.alpha_composite(b, (min(W * T - b.width, p["x"] * T + 34),
                                  max(0, p["y"] * T + TOP + T - S["partner_" + p["f"]].height - b.height + 6)))
        d.text((6, 6), title, fill=(60, 40, 20)); d.text((6, 24), f"soups: {fr['soups']}", fill=(60, 40, 20))
        for e in fr.get("ev", []):
            if e["reward"] > 0.5: d.text((W * T - 70, 24 + 14 * e["who"]), f"+{e['reward']:g}", fill=(0, 140, 0))
        return im.convert("RGB")


class Gif:
    @staticmethod
    def save(frames, path, fps=8):
        imageio.mimsave(path, [np.array(f) for f in frames], duration=1000 / fps, loop=0)
        print("wrote", path, len(frames), "frames")
