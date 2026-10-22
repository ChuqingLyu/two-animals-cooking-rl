#!/usr/bin/env python3
"""Recap teaching test: all lessons from data/recap_lessons.json show in order with the right teacher,
each line's speaker animates 'talk' while its voice plays, then Dingo's wrap-up, then the report. Server: localhost:8777 -> web/."""
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = "http://localhost:8777/"; OUT = "/workspace/cooking-game/shots/"
EXPECT = [("L0", "dingo"), ("L1", "wendy"), ("L2", "kai"), ("L3", "dingo"), ("L4", "wendy")]
async def main():
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for w, h in [(1280, 720), (1920, 1080), (390, 844)]:
            pg = await b.new_page(viewport={"width": w, "height": h}); errs = []; bad = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("response", lambda r: r.status >= 400 and bad.append(r.url))
            await pg.goto(URL); await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip"); await pg.wait_for_timeout(500)
            await pg.evaluate("localStorage.setItem('progress',5); App.go('final')"); await pg.wait_for_timeout(1200)
            data = await pg.evaluate("Final.data")
            for i, (lv, t) in enumerate(EXPECT):
                await pg.wait_for_timeout(900)
                st = await pg.evaluate("""(()=>{const r=document.getElementById('recap'), f=document.querySelector('.recapCast figure.teacher');
                  const sp=Voice.speaking, v=Final.views.find(v=>v.name===sp);
                  return {level:r.dataset.level, teacher:r.dataset.teacher, teacherFig:f&&f.dataset.who, head:document.getElementById('recapTeacher').textContent,
                    speaker:sp, talkAnim:v?v.ch.action:null, line:document.getElementById('recapLine').textContent, visual:!!document.querySelector('#recapVisual img'),
                    audio:Voice.audio.src.split('/voice/')[1]||'', scene:Voice.inVideo?document.getElementById('sceneVideo').dataset.scene:'', cap:document.getElementById('sceneSub').textContent, visible:r.checkVisibility()}})()""")
                ok = st["level"] == lv and st["teacher"] == t and st["teacherFig"] == t and st["visual"] and st["visible"] and st["talkAnim"] == "talk" and (st["scene"].startswith("recap_") and st["cap"].startswith(st["speaker"].capitalize() + ": ") if st["scene"] else st["audio"].startswith("recap/"))
                ok = ok and data["lessons"][i]["level"] == lv and data["lessons"][i]["teacher"] == t
                print(w, "lesson", i + 1, st, "OK" if ok else "FAIL")
                if not ok: fails.append((w, i, st))
                if w != 390 and i in (0, 1): await pg.screenshot(path=f"{OUT}recap_{w}_lesson{i + 1}_{lv}_{t}.png")
                await pg.click("#recapNext")
            await pg.wait_for_timeout(900)
            wrap = await pg.evaluate("[document.getElementById('recap').dataset.lesson, document.getElementById('recap').dataset.teacher, document.getElementById('recapLine').textContent]")
            print(w, "wrap-up:", wrap); fails += [] if wrap[0] == "wrap" and wrap[1] == "dingo" else [(w, "wrap", wrap)]
            await pg.click("#recapNext"); await pg.wait_for_timeout(300)
            rep = await pg.is_visible("#finalTable"); print(w, "report shown:", rep, "| errors:", errs, "| http>=400:", bad)
            if not rep or errs or bad: fails.append((w, "end", rep, errs, bad))
            await pg.close()
        await b.close()
    print("RESULT:", "PASS" if not fails else "FAIL " + json.dumps(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
