#!/usr/bin/env python3
"""Pack GAD frame-by-frame sets into web-ready sprite sheets. File-name driven: rerun after art overwrites.

Input : <art>/<char>_<action>/  with <char>_<action>_sheet.png (horizontal strip of square frames) or 0000.png...
        (optional <char>.json / index.json give fps; default 12)
Output: web/assets/anim2d/<char>/<action>.webp (grid sheet) + web/assets/anim2d/<char>/index.json
        {"actions": {action: {sheet, frameW, frameH, count, cols, fps}}, "anchor": [x, y]}
Rules : last frame == first frame -> dropped (seamless loop). One crop box per character, the union of the
        alpha bbox over every frame of every action, so the feet anchor stays at the same pixel in all actions.
Usage : python3 tools/build_anim2d.py [--art DIR] [--scale 0.5] [--quality 82]
"""
import argparse, glob, json, os, re
from PIL import Image, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument("--art", default=os.environ.get("ANIM2D_ART", "/workspace/cooking-game/art/anim2d"))
ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "web", "assets", "anim2d"))
ap.add_argument("--scale", type=float, default=0.5)
ap.add_argument("--quality", type=int, default=82)
ap.add_argument("--only", default="")
ap.add_argument("--cols", type=int, default=8)
a = ap.parse_args()

def frames_of(d, want=None):
    name = os.path.basename(d)
    sheet = os.path.join(d, name + "_sheet.png")
    pngs = sorted(f for f in glob.glob(os.path.join(d, "*.png")) if re.fullmatch(r"\d+\.png", os.path.basename(f)))
    if os.path.exists(sheet):
        s = Image.open(sheet).convert("RGBA"); h = s.height; n = s.width // h
        fr = [s.crop((i * h, 0, i * h + h, h)) for i in range(n)]
    else:
        fr = [Image.open(f).convert("RGBA") for f in pngs]
    if want: fr = fr[:want]          # frame count comes from the GAD json (index.json / <char>.json)
    if len(fr) > 1 and ImageChops.difference(fr[0], fr[-1]).getbbox() is None: fr = fr[:-1]
    return fr

meta = {}
for j in glob.glob(os.path.join(a.art, "*.json")):
    try: d = json.load(open(j))
    except Exception: continue
    if os.path.basename(j) == "index.json":
        for c, v in d.items(): meta.setdefault(c, {}).update(v.get("actions", {}))
    else: meta.setdefault(os.path.basename(j)[:-5], {}).update(d)

sets = {}
for d in sorted(glob.glob(os.path.join(a.art, "*_*/"))):
    name = os.path.basename(d.rstrip("/")); m = re.fullmatch(r"([a-z]+)_([a-z_]+)", name)
    if not m or (a.only and m[1] != a.only): continue
    fr = frames_of(d.rstrip("/"), (meta.get(m[1], {}).get(m[2]) or {}).get("frames"))
    if fr: sets.setdefault(m[1], {})[m[2]] = fr

total = 0
for ch, acts in sets.items():
    box = None
    for fr in acts.values():
        for f in fr:
            b = f.getbbox()
            if b: box = b if not box else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    box = (max(0, box[0] - 2), max(0, box[1] - 2), box[2] + 2, box[3] + 2)
    fw, fh = round((box[2] - box[0]) * a.scale), round((box[3] - box[1]) * a.scale)
    od = os.path.join(a.out, ch); os.makedirs(od, exist_ok=True)
    for old in glob.glob(os.path.join(od, "*.webp")): os.remove(old)
    idx = {"source": a.art, "crop": box, "scale": a.scale, "anchor": [fw / 2, fh], "actions": {}}
    for act, fr in sorted(acts.items()):
        n = len(fr); cols = min(a.cols, n); rows = -(-n // cols)
        sheet = Image.new("RGBA", (cols * fw, rows * fh))
        for i, f in enumerate(fr):
            sheet.paste(f.crop(box).resize((fw, fh), Image.LANCZOS), ((i % cols) * fw, (i // cols) * fh))
        p = os.path.join(od, act + ".webp"); sheet.save(p, "WEBP", quality=a.quality, method=4)
        total += os.path.getsize(p)
        fps = (meta.get(ch, {}).get(act) or {}).get("fps", 12)
        idx["actions"][act] = {"sheet": act + ".webp", "frameW": fw, "frameH": fh, "count": n, "cols": cols, "fps": fps}
    json.dump(idx, open(os.path.join(od, "index.json"), "w"), indent=1)
    print(ch, "crop", box, "frame", fw, fh, "actions", {k: len(v) for k, v in acts.items()})
print("total webp bytes", total)
