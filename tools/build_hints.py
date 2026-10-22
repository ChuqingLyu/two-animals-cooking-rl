#!/usr/bin/env python3
"""Build web/data/hints.json from docs/hints.md (run after editing the hint copy).
Each level table row -> {"target": {...}, "idle": {speaker, text}, "wrong": [{when, speaker, text}]} keyed by step id ("0.1", "4.9a", ...).
target: {"tiles": [[x, y], ...]} for kitchen tiles, or {"sel": "<css selector>"} for buttons/elements."""
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
md = (ROOT / "docs/hints.md").read_text(encoding="utf-8")
LINE = re.compile(r'\*\*(Dingo|Wendy|Kai):\*\*\s*"([^"]+)"')
def lines(cell): return [{"speaker": s.lower(), "text": t} for s, t in LINE.findall(cell)]
def target(cell):
    tiles = [[int(a), int(b)] for a, b in re.findall(r"\((\d),\s*(\d)\)", cell)]
    if tiles: return {"tiles": tiles}
    sels = [s for s in re.findall(r"`([^`]+)`", cell) if s[0] in "#.["]
    if "Kai sprite" in cell: return {"char": 1}
    return {"sel": ", ".join(sels)} if sels else {}
out = {"_source": "docs/hints.md (built by tools/build_hints.py)", "levels": {}, "shared": {}}
level = None
for raw in md.splitlines():
    m = re.match(r"## (L\d)\b", raw)
    if m: level = m.group(1); out["levels"][level] = {}; continue
    if level and raw.startswith("Unreachable-tile click"):
        out["shared"]["unreachable"] = lines(raw)[0]
    if not (level and raw.startswith("|")): continue
    cells = [c.strip() for c in raw.strip().strip("|").split("|")]
    if len(cells) < 5 or not re.match(r"^(\d\.\d\w?|—)$", cells[0]): continue
    sid = cells[0] if cells[0] != "—" else re.sub(r"\W", "", cells[1].split("(")[-1]) or "extra"
    wrong = []
    for part in re.split(r"\s/\s(?=[^\"]*(?:\"[^\"]*\"[^\"]*)*$)", cells[4]):
        ls = lines(part)
        if ls: wrong.append({"when": part.split("→")[0].strip() if "→" in part else "", **ls[0]})
    idle = lines(cells[3])
    out["levels"][level][sid] = {"trigger": cells[1], "target": target(cells[2]), "idle": idle[0] if idle else None, "wrong": wrong}
dst = ROOT / "web/data/hints.json"; dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", dst, {k: len(v) for k, v in out["levels"].items()})
