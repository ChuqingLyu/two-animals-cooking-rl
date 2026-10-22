#!/usr/bin/env python3
"""Chinese line text for Chinese mode -> web/data/scene_lines_zh.json (existing zh text is kept).
  scenes[<scene_id>][i] = {id, speaker, en, zh}   one entry per line of the scene video (order = web/assets/lines/scenes.json)
  voice[<line id>]      = {speaker, en, zh}       lines without a scene video (mp3 / Kokoro fallback, recap lines)
zh "" = not translated: that scene keeps the English subtitled video, that caption stays English.
Also writes the same structure to cooking-game/docs/scene_lines_zh_template.json for PM bot. After filling zh, run sync_scenes.py
(copies <scene>_clean.mp4 only for fully translated scenes) and build_fonts.py (new Chinese characters)."""
import json, os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."); W = f"{R}/web"; P = f"{W}/data/scene_lines_zh.json"
TPL = "/workspace/cooking-game/docs/scene_lines_zh_template.json"
old = json.load(open(P)) if os.path.exists(P) else {}
if os.path.exists(TPL):   # merge PM bot's filled template (non-empty zh wins over web/data)
    t = json.load(open(TPL)); old.setdefault("scenes", {}); old.setdefault("voice", {})
    for k, ls in t.get("scenes", {}).items():
        cur = old["scenes"].setdefault(k, [])
        for i, l in enumerate(ls):
            while len(cur) <= i: cur.append({})
            if l.get("zh"): cur[i] = dict(cur[i], zh=l["zh"])
    for k, v in t.get("voice", {}).items():
        if v.get("zh"): old["voice"][k] = dict(old["voice"].get(k, {}), zh=v["zh"])
sc = json.load(open(f"{W}/assets/lines/scenes.json")); man = json.load(open(f"{W}/assets/voice/manifest.json"))
recap = json.load(open(f"{W}/data/recap_lessons.json"))
inscene = {l["id"] for s in sc.values() for l in s["lines"]}
oz = lambda k, i=None: ((old.get("scenes", {}).get(k) or [{}] * (i + 1))[i] if i is not None and i < len(old.get("scenes", {}).get(k) or []) else {}) if i is not None else old.get("voice", {}).get(k, {})
out = {"_doc": __doc__.strip().splitlines()[0] + " Fill zh; leave en as reference. Speaker names in zh mode: 豆丁 / Wendy / Kai.",
       "scenes": {k: [{"id": l["id"], "speaker": l["speaker"], "en": l["text"], "zh": oz(k, i).get("zh", "")} for i, l in enumerate(s["lines"])] for k, s in sorted(sc.items())},
       "voice": {}}
for l in man:
    k = l["file"].replace(".mp3", "")
    if k not in inscene: out["voice"][k] = {"speaker": l["character"], "en": l["text"], "zh": oz(k).get("zh", "")}
for ls in recap["lessons"] + [recap["wrapup"]]:
    for l in ls["lines"]:
        if l["id"] not in inscene: out["voice"][l["id"]] = {"speaker": l["character"], "en": l["text"], "zh": oz(l["id"]).get("zh", "")}
json.dump(out, open(P, "w"), indent=1, ensure_ascii=False)
D = "/workspace/cooking-game/docs"; os.makedirs(D, exist_ok=True); json.dump(out, open(f"{D}/scene_lines_zh_template.json", "w"), indent=1, ensure_ascii=False)
n = sum(len(v) for v in out["scenes"].values()); z = sum(1 for v in out["scenes"].values() for l in v if l["zh"]) + sum(1 for v in out["voice"].values() if v["zh"]); print(f"zh filled: {z};", f"{len(out['scenes'])} scenes / {n} scene lines, {len(out['voice'])} voice lines ->", P)
