#!/usr/bin/env python3
"""Chinese in-level hints. hints.json is rebuilt from docs/hints.md (build_hints.py), so translations live apart, keyed by the English text:
  web/data/hints_zh.json = {"<English hint>": "<中文>"}   (Guide shows zh in Chinese mode, English when missing)
Template for PM bot: cooking-game/docs/hints_zh_template.json = {"hints": [{where, speaker, en, zh}]}. Fill zh, re-run this script
(merges template -> web/data/hints_zh.json, refreshes the template with any new hints), then build_fonts.py."""
import json, os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."); H = f"{R}/web/data/hints.json"; P = f"{R}/web/data/hints_zh.json"
TPL = "/workspace/cooking-game/docs/hints_zh_template.json"
zh = json.load(open(P)) if os.path.exists(P) else {}
if os.path.exists(TPL): zh.update({x["en"]: x["zh"] for x in json.load(open(TPL)).get("hints", []) if x.get("zh")})
h = json.load(open(H)); rows, seen = [], set()
def add(where, line):
    if not line or not line.get("text") or line["text"] in seen: return
    seen.add(line["text"]); rows.append({"where": where, "speaker": line.get("speaker", ""), "en": line["text"], "zh": zh.get(line["text"], "")})
for lv, steps in h.get("levels", {}).items():
    for sid, st in steps.items():
        add(f"{lv} {sid} idle", st.get("idle"))
        for w in st.get("wrong", []): add(f"{lv} {sid} wrong: {w.get('when', '')}", w)
for k, v in h.get("shared", {}).items(): add(f"shared {k}", v if isinstance(v, dict) else {"text": v})
json.dump({k: v for k, v in zh.items() if k in seen}, open(P, "w"), indent=1, ensure_ascii=False)
os.makedirs(os.path.dirname(TPL), exist_ok=True)
json.dump({"_doc": __doc__.strip().splitlines()[0], "hints": rows}, open(TPL, "w"), indent=1, ensure_ascii=False)
print(len(rows), "hint strings,", sum(1 for r in rows if r["zh"]), "translated ->", P, "| template:", TPL)
