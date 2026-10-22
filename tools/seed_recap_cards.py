#!/usr/bin/env python3
"""Seed recap knowledge-card text into web/data/recap_lessons.json from GAD's draft docs/recap_cards.md.
Copies the draft verbatim (no rewriting); every card is marked status "draft" pending Lucy's review.
Per bullet: term_zh / term_en from '**中文 English**', text_zh = the rest; 'def_zh' = first sentence, 'kitchen_zh' = the rest.
text_en / def_en / kitchen_en stay empty until the English copy is approved (the card then shows the Chinese draft)."""
import json, re, os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."); MD = "/workspace/cooking-game/docs/recap_cards.md"; J = f"{R}/web/data/recap_lessons.json"
md = open(MD, encoding="utf-8").read(); data = json.load(open(J, encoding="utf-8"))
secs = re.split(r"^## ", md, flags=re.M)[1:]
def bullet(b):
    b = b.strip()[2:].strip(); m = re.match(r"^\*\*([^*]+)\*\*[：:]\s*(.*)$", b)
    term_zh = term_en = ""
    if m:
        t, b = m.group(1).strip(), m.group(2).strip(); mm = re.match(r"^([^A-Za-z]+?)\s*([A-Za-z].*)$", t)
        term_zh, term_en = (mm.group(1).strip(), mm.group(2).strip()) if mm else (t, "")
    s = re.split(r"(?<=[。！？])", b, maxsplit=1)
    return {"term_zh": term_zh, "term_en": term_en, "text_zh": b, "def_zh": s[0].strip(), "kitchen_zh": (s[1].strip() if len(s) > 1 else ""), "text_en": "", "def_en": "", "kitchen_en": ""}
cards = []
for sec in secs:
    head, *body = sec.splitlines(); mh = re.search(r"——\s*(.+)$", head)
    cards.append({"heading_zh": head.strip(), "topic_zh": mh.group(1).strip() if mh else head.strip(), "bullets": [bullet(x) for x in body if x.strip().startswith("- ")]})
meta = {"status": "draft", "approved_by": None, "source": "cooking-game/docs/recap_cards.md (GAD draft)", "note": "DRAFT, pending Lucy's review. Do not treat as final copy."}
for ls, c in zip(data["lessons"], cards[:len(data["lessons"])]):
    c["line_bullet"] = [min(i, len(c["bullets"]) - 1) for i in range(len(ls["lines"]))]   # which bullet lights up per teacher line (editable)
    ls["card"] = dict(meta, **c)
data["summary_card"] = dict(meta, heading_zh=cards[-1]["heading_zh"] if len(cards) > len(data["lessons"]) else "",
                            topics=[{"level": ls["level"], "teacher": ls["teacher"], "topic_zh": ls["card"]["topic_zh"], "terms": [b for b in ls["card"]["bullets"] if b["term_zh"]]} for ls in data["lessons"]],
                            closing_zh=(cards[-1]["bullets"][0]["text_zh"] if len(cards) > len(data["lessons"]) and cards[-1]["bullets"] else ""))
data["_cards_doc"] = "lessons[].card / summary_card: knowledge-card text, seeded by tools/seed_recap_cards.py from GAD's draft. status=draft until Lucy approves; edit freely, no code change needed."
json.dump(data, open(J, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
for ls in data["lessons"]: print(ls["level"], [(b["term_zh"], b["term_en"]) for b in ls["card"]["bullets"]])
