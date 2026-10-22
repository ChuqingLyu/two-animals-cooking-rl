#!/usr/bin/env python3
"""Recap teaching test: all lessons from data/recap_lessons.json show in order with the right teacher,
each line's speaker animates 'talk' while its voice plays, then Dingo's wrap-up, then the report. Server: localhost:8777 -> web/."""
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = "http://localhost:8777/"; OUT = "/workspace/cooking-game/shots/"
EXPECT = [("L0", "dingo"), ("L1", "wendy"), ("L2", "kai"), ("L3", "dingo"), ("L4", "wendy")]
async def NEXT(pg):   # video showing -> its Continue button (text box hidden); otherwise the box's Next
    await pg.click("#vidNext" if await pg.is_visible("#vidNext") else "#recapNext")
async def main():
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for w, h in [(1280, 720), (1920, 1080), (390, 844)]:
            pg = await b.new_page(viewport={"width": w, "height": h}); errs = []; bad = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("response", lambda r: r.status >= 400 and bad.append(r.url))
            await pg.goto(URL); await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip"); await pg.wait_for_timeout(500)
            await pg.evaluate("localStorage.setItem('progress',5); localStorage.setItem('playerName','Lucy'); App.go('final')"); await pg.wait_for_timeout(1200)
            data = await pg.evaluate("Final.data")
            for i, (lv, t) in enumerate(EXPECT):
                await pg.wait_for_timeout(900)
                st = await pg.evaluate("""(()=>{const r=document.getElementById('recap'), f=document.querySelector('.recapCast figure.teacher');
                  const sp=Voice.speaking, v=Final.views.find(v=>v.name===sp);
                  return {level:r.dataset.level, teacher:r.dataset.teacher, teacherFig:f&&f.dataset.who, head:document.getElementById('recapTeacher').textContent,
                    speaker:sp, talkAnim:v?v.ch.action:null, line:document.getElementById('recapLine').textContent, visual:!!document.querySelector('#recapVisual img'),
                    audio:Voice.audio.src.split('/voice/')[1]||'', scene:Voice.inVideo?document.getElementById('sceneVideo').dataset.scene:'', nobox:['subtitle','sceneSub'].every(id=>!document.getElementById(id).checkVisibility())&&!document.querySelector('.recapSay').checkVisibility({visibilityProperty:true}), btn:document.getElementById('vidNext').checkVisibility(), card:document.querySelector('.recapCard,#kcBullets').checkVisibility(), visible:r.checkVisibility(), term:document.getElementById('kcTermMain').textContent, draft:document.getElementById('kcDraft').checkVisibility(), lit:document.querySelectorAll('#kcBullets li.on').length, defn:document.getElementById('kcDef').textContent.length}})()""")
                ok = st["level"] == lv and st["teacher"] == t and st["teacherFig"] == t and st["visual"] and st["visible"] and st["talkAnim"] == "talk" and (st["scene"].startswith("recap_") and st["nobox"] and st["btn"] and st["card"] if st["scene"] else st["audio"].startswith("recap/"))
                ok = ok and st["term"] != "" and st["draft"] and st["lit"] == 1 and st["defn"] > 0
                ok = ok and data["lessons"][i]["level"] == lv and data["lessons"][i]["teacher"] == t
                print(w, "lesson", i + 1, st, "OK" if ok else "FAIL")
                if not ok: fails.append((w, i, st))
                if w != 390 and i in (0, 1): await pg.screenshot(path=f"{OUT}recap_{w}_lesson{i + 1}_{lv}_{t}.png")
                if w != 390 and i == 0: await pg.screenshot(path=f"{OUT}novidbox_recap_{w}.png")
                await NEXT(pg)
                if i + 1 < len(EXPECT): await pg.wait_for_function(f"document.getElementById('recap').dataset.lesson==='{i + 2}'", timeout=4000)
            await pg.wait_for_timeout(900)
            summ = await pg.evaluate("[document.getElementById('kcSummary').checkVisibility(), document.querySelectorAll('#kcSummary li').length]"); print(w, "summary card:", summ); fails += [] if summ == [True, 5] else [(w, "summary", summ)]
            wrap = await pg.evaluate("[document.getElementById('recap').dataset.lesson, document.getElementById('recap').dataset.teacher, document.getElementById('recapLine').textContent]")
            print(w, "wrap-up:", wrap); fails += [] if wrap[0] == "wrap" and wrap[1] == "dingo" else [(w, "wrap", wrap)]
            await pg.evaluate("Final.illus('recap_07')"); await pg.wait_for_function("document.querySelector('#recapIllus img').complete", timeout=5000)
            if w != 390: await pg.screenshot(path=f"{OUT}recap_illus_{w}.png")
            il = await pg.evaluate("[document.getElementById('recapIllus').dataset.key, document.querySelector('#recapIllus img').complete && document.querySelector('#recapIllus img').naturalWidth, document.querySelector('#recapIllus .illusText')?.textContent]")
            print(w, "illustration:", il); fails += [] if il[0] == "short_video_reward" and il[1] > 0 and il[2] == "+1" else [(w, "illus", il)]
            await NEXT(pg); await pg.wait_for_timeout(1200)
            cert = await pg.evaluate("""(()=>{const q=s=>document.querySelector('#certBox '+s);return {visible:document.getElementById('certBox').checkVisibility(), name:q('.cName').textContent,
              topics:document.querySelectorAll('#certBox .cTopics li').length, sigs:[...document.querySelectorAll('#certBox .cSig')].map(e=>e.textContent), date:q('.cDate').textContent,
              font:getComputedStyle(q('.cName')).fontFamily, color:getComputedStyle(q('.cName')).color}})()""")
            dl = await pg.evaluate("Final.downloadCert()")
            print(w, "certificate:", cert, "png bytes~", dl)
            if w != 390: await pg.screenshot(path=f"{OUT}certificate_{w}.png")
            okc = cert["visible"] and cert["name"] == "Lucy" and cert["topics"] == 5 and len(cert["sigs"]) == 3 and cert["date"] and "Nunito" in cert["font"] and cert["color"] == "rgb(74, 53, 40)" and dl > 100000
            fails += [] if okc else [(w, "cert", cert)]
            await pg.click("#certNext"); await pg.wait_for_timeout(300)
            rep = await pg.is_visible("#finalTable"); print(w, "report shown:", rep, "| errors:", errs, "| http>=400:", bad)
            if not rep or errs or bad: fails.append((w, "end", rep, errs, bad))
            await pg.close()
        await b.close()
    print("RESULT:", "PASS" if not fails else "FAIL " + json.dumps(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
