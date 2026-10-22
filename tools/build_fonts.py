#!/usr/bin/env python3
"""Self-hosted fonts (one file each, no unicode-range request bursts):
  Nunito (variable weight, OFL) -> web/assets/fonts/nunito.woff2 (Latin + punctuation)
  ZCOOL KuaiLe (OFL)            -> web/assets/fonts/zcool_kuaile.woff2, subset to every CJK char used by the game text.
Re-run after adding Chinese text. Sources: tools/fonts_src/ (from github.com/google/fonts)."""
import glob, os, re
from fontTools import subset
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."); W = f"{R}/web"
txt = "".join(open(f, encoding="utf-8", errors="ignore").read() for pat in ["web/*.js", "web/*.html", "web/data/*.json", "web/assets/**/*.json", "web/assets/voice/subtitles/*.vtt"] for f in glob.glob(f"{R}/{pat}", recursive=True))
cjk = sorted(set(c for c in txt if ord(c) > 0x2E7F)) + list("０１２３４５６７８９")
def run(src, dst, text=None, unicodes=None):
    o = subset.Options(); o.flavor = "woff2"; o.layout_features = ["*"]; o.name_IDs = ["*"]
    f = subset.load_font(src, o); s = subset.Subsetter(o); s.populate(text=text or "", unicodes=unicodes or []); s.subset(f); subset.save_font(f, dst, o)
    print(dst, os.path.getsize(dst), "bytes")
run(f"{R}/tools/fonts_src/Nunito-wght.ttf", f"{W}/assets/fonts/nunito.woff2", unicodes=list(range(0x20, 0x250)) + list(range(0x2000, 0x2070)) + [0x20AC, 0x2122, 0x2190, 0x2192, 0x2605, 0x2606])
run(f"{R}/tools/fonts_src/ZCOOLKuaiLe-Regular.ttf", f"{W}/assets/fonts/zcool_kuaile.woff2", text="".join(cjk))
print(len(cjk), "CJK chars")
