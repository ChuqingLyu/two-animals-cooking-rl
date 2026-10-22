#!/usr/bin/env python3
"""Character sprite test: each character switches actions (walk / carry / talk) and draws real sprite frames.
Also screenshots the home screen and the L4 kitchen (Wendy + Kai + Dingo referee). Server: localhost:8777 -> web/."""
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = "http://localhost:8777/"; OUT = "/workspace/cooking-game/shots/"
CHECK = """async () => {
  const res = {};
  for (const n of ["wendy", "kai", "dingo"]) {
    const c = Character.create(n, "kitchen"); await c.backend.ready;
    const cv = document.createElement("canvas"); cv.width = 240; cv.height = 240; const x = cv.getContext("2d");
    const cases = [["idle", {}, "down"], ["walk", {moving: true}, "left"], ["walk", {moving: true}, "up"],
                   ["carry", {moving: true, carrying: n === "kai" ? "dish" : "onion"}, "right"], ["talk", {talking: true}, "down"]];
    const out = [];
    for (const [label, st, f] of cases) {
      c.facing = f; c.auto(st); c.current(f); c.backend.spec(c, f);
      const s = c.backend.spec(c, f); await new Promise(r => { const w = () => s.img && s.img.complete ? r() : setTimeout(w, 30); w(); });
      const px = []; for (const t of [0, 250]) { c.t = t; x.clearRect(0, 0, 240, 240); c.draw(x, 0, 0, 240, 240, f);
        const d = x.getImageData(0, 0, 240, 240).data; let a = 0, h = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { a++; h = (h * 31 + d[i - 3] + d[i - 1]) % 1e9; } px.push([a, h, c.drawnFrame]); }
      out.push({label, facing: f, sheet: c.drawn, frames: s.count, opaque: px[0][0], animates: px[0][1] !== px[1][1] && px[0][2] !== px[1][2]});
    }
    res[n] = out;
  }
  return res;
}"""
EXPECT = lambda n: ["idle", "walk_left", "walk_up", "carry_right", "talk"]
async def main():
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for w, h in [(1280, 720), (1920, 1080)]:
            pg = await b.new_page(viewport={"width": w, "height": h}); errs = []; reqs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
            pg.on("request", lambda r: "/anim2d/" in r.url and reqs.append(r.url.split("/anim2d/")[-1]))
            await pg.goto(URL); await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip")
            await pg.wait_for_timeout(2000)
            home = await pg.evaluate("App.homeViews.map(v => [v.name, v.ch.drawn || 'static', v.ch.current('down')])")
            await pg.screenshot(path=f"{OUT}anim_home_{w}.png")
            r = await pg.evaluate(CHECK)
            for n, cases in r.items():
                for c, want in zip(cases, EXPECT(n)):
                    ok = c["sheet"] == want and c["opaque"] > 2000 and c["animates"]
                    if not ok: fails.append((w, n, c))
                print(w, n, [(c["label"], c["facing"], c["sheet"], c["frames"], c["opaque"], c["animates"]) for c in cases])
            if any(s != "idle" for _, s, _ in home): fails.append((w, "home", home))
            print(w, "home:", home)
            # kitchen: L4 shows Wendy, Kai and the Dingo referee
            await pg.evaluate("App.go('l4')"); await pg.wait_for_timeout(800)
            if await pg.is_visible("#overlay"): await pg.click("#popClose")
            if await pg.is_visible("#theatre"): await pg.click("#theatreSkip")
            await pg.wait_for_timeout(500)
            try: await pg.click("#l4start", timeout=3000)
            except Exception: pass
            for k in ["d", "d", "s", "a", " "]: await pg.keyboard.press(k); await pg.wait_for_timeout(120)
            await pg.wait_for_timeout(300); await pg.screenshot(path=f"{OUT}anim_kitchen_{w}.png")
            kit = await pg.evaluate("[...Cast.of(document.getElementById('c4k').getContext('2d')).chars.map(c=>[c.name,c.drawn,c.drawnFrame]), ['dingo', App.refView.ch.drawn, App.refView.ch.drawnFrame]]")
            print(w, "kitchen:", kit, "| anim2d requests:", len(reqs), "| errors:", errs)
            if any(not d for _, d, _ in kit): fails.append((w, "kitchen", kit))
            if errs: fails.append((w, "errors", errs))
            await pg.close()
        await b.close()
    print("RESULT:", "PASS" if not fails else "FAIL " + json.dumps(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
