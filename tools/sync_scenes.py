#!/usr/bin/env python3
"""Copy Game Art Director scene videos into web/assets/lines/ and build web/assets/lines/scenes.json.
Source: cooking-game/art/lines/scenes/<scene>.json (+ <scene>_clean.mp4), or art/lines/scenes.json.
Re-run whenever new scenes land; the web app picks them up by file_id with no code change."""
import json, shutil, glob, os
SRC = "/workspace/cooking-game/art/lines"; DST = os.path.join(os.path.dirname(__file__), "../web/assets/lines")
os.makedirs(DST, exist_ok=True)
metas = []
if os.path.exists(f"{SRC}/scenes.json"):
    d = json.load(open(f"{SRC}/scenes.json")); metas += d if isinstance(d, list) else d.get("scenes", list(d.values()))
for f in sorted(glob.glob(f"{SRC}/scenes/*.json")):
    metas.append(json.load(open(f)))
out = {}
for m in metas:
    sid = m.get("scene_id"); clean = m.get("clean_file") or f"scenes/{sid}_clean.mp4"
    src = os.path.join(SRC, clean)
    if not sid or not os.path.exists(src) or m.get("ok") is False or not m.get("lines"): continue
    dst = os.path.join(DST, f"{sid}_clean.mp4")
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src): shutil.copy2(src, dst)
    out[sid] = {"video": f"assets/lines/{sid}_clean.mp4", "duration": m.get("duration"),
                "lines": [{"id": l["file_id"], "speaker": l["character"].lower(), "text": l["text"], "start": l["start"], "end": l["end"]} for l in m["lines"]]}
json.dump(out, open(os.path.join(DST, "scenes.json"), "w"), indent=1, ensure_ascii=False)
print("scenes wired:", list(out))
