"""Synthesize kid-friendly SFX into web/assets/sfx/*.wav (16-bit mono 22.05kHz). Usage: python code/make_sfx.py"""
import numpy as np, wave
from pathlib import Path
SR = 22050; OUT = Path(__file__).resolve().parent.parent / "web/assets/sfx"; OUT.mkdir(parents=True, exist_ok=True)
t = lambda d: np.arange(int(SR * d)) / SR
def env(n, a=.005, r=.08):
    e = np.ones(n); na, nr = int(SR * a), int(SR * r); e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr) ** 2; return e
def tone(f, d, a=.005, r=.08, harm=(1,), decay=0):
    x = t(d); s = sum(np.sin(2 * np.pi * f * (k + 1) * x) * h for k, h in enumerate(harm)); return s * env(len(x), a, r) * np.exp(-decay * x)
def sweep(f0, f1, d, **k):
    x = t(d); ph = 2 * np.pi * np.cumsum(np.linspace(f0, f1, len(x))) / SR; return np.sin(ph) * env(len(x), **k)
def cat(*xs): return np.concatenate(xs)
def mix(*xs):
    n = max(len(x) for x in xs); o = np.zeros(n)
    for x in xs: o[:len(x)] += x
    return o
def save(name, s, vol=.5):
    s = s / (np.abs(s).max() + 1e-9) * vol
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((s * 32767).astype(np.int16).tobytes())
rng = np.random.default_rng(0)
save("pickup", sweep(500, 1100, .12, r=.05))
save("plop", sweep(700, 180, .18, r=.1) + .3 * sweep(300, 120, .18, r=.1))
# bubbling loop: random soft blips, 2s, seamless-ish
bub = np.zeros(int(SR * 2))
for _ in range(26):
    st = rng.integers(0, len(bub) - 3000); f = rng.uniform(250, 600); b = sweep(f, f * 1.8, .06, r=.04) * rng.uniform(.3, 1)
    bub[st:st + len(b)] += b
save("bubble", bub, .3)
save("ding", mix(tone(1318, .7, r=.6, harm=(1, .3, .1), decay=4), tone(1976, .7, r=.6, decay=6) * .4))
save("clink", mix(tone(2400, .25, r=.2, decay=18), tone(3300, .25, r=.2, decay=22) * .6))
coin = cat(tone(988, .08, r=.02, harm=(1, .3)), tone(1318, .35, r=.3, harm=(1, .3), decay=5))
reg = cat(np.zeros(int(SR * .02)), rng.uniform(-1, 1, int(SR * .04)) * env(int(SR * .04), r=.03) * .4, tone(1760, .25, r=.2, decay=8) * .6)
save("serve", cat(reg, coin))
save("wrong", cat(tone(220, .12, r=.04, harm=(1, .5, .25)), np.zeros(int(SR * .03)), tone(196, .16, r=.08, harm=(1, .5, .25))), .35)
save("tick", tone(1500, .05, a=.001, r=.04, decay=40), .4)
print(sorted(p.name for p in OUT.iterdir()))
