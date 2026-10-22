#!/usr/bin/env python3
"""Copy Game Art Director scene videos into web/assets/lines/ and build web/assets/lines/scenes.json.
Timing/speaker source per scene, in priority order:
  1. art/lines/scenes.json (GAD's full manifest, once it exists)
  2. art/lines/scenes/<scene>.srt  (cues "Speaker: text", start/end)
  3. art/lines/scenes/<scene>.json (per-scene metadata)
Line ids (file_id) come from the per-scene json, else art/lines/scene_specs.json (lines[] in order).
Re-run whenever new scenes land; the web app picks them up by line id with no code change."""
import json, shutil, filecmp, glob, os, re, sys
SRC = "/workspace/cooking-game/art/lines"; SC = f"{SRC}/scenes"; DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../web/assets/lines")
os.makedirs(DST, exist_ok=True)
load = lambda p: json.load(open(p)) if os.path.exists(p) else None
def t(s): h, m, x = s.replace(",", ".").split(":"); return round(int(h) * 3600 + int(m) * 60 + float(x), 3)
def srt(p):
    out = []
    for b in re.split(r"\n\s*\n", open(p, encoding="utf-8").read().strip()):
        L = [x.strip() for x in b.splitlines() if x.strip()]; i = next((k for k, x in enumerate(L) if "-->" in x), None)
        if i is None: continue
        a, z = [s.strip() for s in L[i].split("-->")]; txt = " ".join(L[i + 1:]); m = re.match(r"^([^:]{1,16}):\s*(.*)$", txt)
        out.append({"speaker": (m.group(1) if m else "").strip().lower(), "text": m.group(2) if m else txt, "start": t(a), "end": t(z)})
    return out
big = load(f"{SRC}/scenes.json") or {}
if isinstance(big, dict) and "scenes" in big: big = big["scenes"]
big = {m["scene_id"]: m for m in big} if isinstance(big, list) else {k: dict(v, scene_id=k) for k, v in big.items()}
specs = {s["scene_id"]: s for s in (load(f"{SRC}/scene_specs.json") or [])}
sids = sorted({os.path.basename(p)[:-10] for p in glob.glob(f"{SC}/*_clean.mp4")} | set(big))
out, gaps, copied = {}, [], []
for sid in sids:
    per = load(f"{SC}/{sid}.json") or {}; src = os.path.join(SRC, (big.get(sid) or {}).get("clean_file") or f"scenes/{sid}_clean.mp4")
    if not os.path.exists(src): gaps.append(f"{sid}: no _clean.mp4"); continue
    ids = [l["file_id"] for l in per.get("lines", [])] or specs.get(sid, {}).get("lines", [])
    if sid in big:
        lines = [{"id": l["file_id"], "speaker": (l.get("speaker") or l.get("character")).lower(), "text": l["text"], "start": l["start"], "end": l["end"]} for l in big[sid]["lines"]]; how = "scenes.json"
    elif os.path.exists(f"{SC}/{sid}.srt") and srt(f"{SC}/{sid}.srt"):
        cues = srt(f"{SC}/{sid}.srt"); how = "srt"
        if len(cues) != len(ids): gaps.append(f"{sid}: {len(cues)} srt cues vs {len(ids)} line ids ({ids})"); 
        lines = [dict(c, id=ids[i]) for i, c in enumerate(cues) if i < len(ids)]
    elif per.get("lines") and all("start" in l for l in per["lines"]):
        lines = [{"id": l["file_id"], "speaker": l["character"].lower(), "text": l["text"], "start": l["start"], "end": l["end"]} for l in per["lines"]]; how = "json"
    else: gaps.append(f"{sid}: no timing (no scenes.json/srt/json)"); continue
    if per.get("ok") is False and how == "json": gaps.append(f"{sid}: GAD marked ok=false (skipped)"); continue
    if not lines: gaps.append(f"{sid}: no lines"); continue
    dst = os.path.join(DST, f"{sid}_clean.mp4")
    if not os.path.exists(dst) or not filecmp.cmp(src, dst, shallow=False): shutil.copy2(src, dst); copied.append(sid)
    out[sid] = {"video": f"assets/lines/{sid}_clean.mp4", "duration": per.get("duration") or (big.get(sid) or {}).get("duration"), "source": how, "lines": lines}
json.dump(out, open(os.path.join(DST, "scenes.json"), "w"), indent=1, ensure_ascii=False)
print("scenes wired:", {k: (v["source"], [l["id"] for l in v["lines"]]) for k, v in out.items()})
print("copied/updated:", copied); print("gaps:", gaps or "none")
