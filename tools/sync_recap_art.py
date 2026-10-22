#!/usr/bin/env python3
"""Copy GAD recap art (art/recap/*.png, not _old/ or the contact sheet) into web/assets/recap/ as webp, plus the certificate layout."""
import glob, os, shutil
from PIL import Image
SRC = "/workspace/cooking-game/art/recap"; DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../web/assets/recap")
os.makedirs(DST, exist_ok=True)
for f in sorted(glob.glob(f"{SRC}/*.png")):
    n = os.path.basename(f)[:-4]; im = Image.open(f).convert("RGB")
    im.save(f"{DST}/{n}.webp", "WEBP", quality=92 if n == "certificate" else 84, method=6); print(n, os.path.getsize(f"{DST}/{n}.webp"))
shutil.copy2(f"{SRC}/certificate_layout.json", os.path.join(DST, "../../data/certificate_layout.json"))
