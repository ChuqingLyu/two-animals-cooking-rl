#!/usr/bin/env python3
"""Scene video test: L0 opening line dingo_L0_01 plays from the clean scene video (assets/lines/L0_s01_clean.mp4)
(subtitled scene video, speaker + line burned in; no caption box; story/bridge show just video + Continue), music ducked, no Kokoro mp3. Server: localhost:8777 -> web/."""
import asyncio, sys
from playwright.async_api import async_playwright
OUT = "/workspace/cooking-game/shots/"
async def main():
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
        for w, h in [(1280, 720), (1920, 1080), (390, 844)]:
            pg = await b.new_page(viewport={"width": w, "height": h}); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("response", lambda r: r.status >= 400 and errs.append(r.url))
            await pg.goto("http://localhost:8777/"); await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip"); await pg.wait_for_timeout(500)
            fb = await pg.evaluate("Object.keys(Voice.lines).find(k=>k.startsWith('dingo_')&&!Voice.sceneOf[k]&&Voice.lines[k].file&&!Voice.lines[k].cont)")   # a line with no scene video yet -> Kokoro mp3
            await pg.evaluate(f"void Voice.play(['dingo_L0_01','{fb}'])"); await pg.wait_for_timeout(1500)
            NOBOX = "['subtitle','sceneSub'].every(id=>!document.getElementById(id).checkVisibility())"
            st = await pg.evaluate("""(()=>{const v=document.getElementById('sceneVid');
              return {visible:document.getElementById('sceneVideo').checkVisibility(), src:v.currentSrc.split('/').pop(), playing:!v.paused&&v.currentTime>0.3,
                nobox:"""+NOBOX+""", ducked:Music.ducked, kokoro:!Voice.audio.paused}})()""")
            ok = st["visible"] and st["src"] == "L0_s01.mp4" and st["playing"] and st["nobox"] and st["ducked"] and not st["kokoro"]
            await pg.wait_for_function("document.getElementById('sceneVideo').classList.contains('hidden') && Voice.audio.src.includes('/voice/')", timeout=12000)
            after = await pg.evaluate("[document.getElementById('sceneVideo').classList.contains('hidden'), Voice.audio.src.split('/').pop(), document.getElementById('subtitle').checkVisibility()]")
            await pg.evaluate('Voice.stop()')
            ok = ok and after[0] and after[1] == fb + ".mp3" and after[2] and not errs   # next line falls back to Kokoro and keeps its caption box
            # story intro: only the video + Continue, no dialogue box; Continue advances to the next line
            await pg.evaluate("void Story.intro()"); await pg.wait_for_function("document.getElementById('sceneVideo').dataset.scene==='story_s01' && document.getElementById('sceneVid').currentTime>0.5", timeout=8000)
            si = await pg.evaluate("[document.querySelector('#dialog .dlgBox').checkVisibility({visibilityProperty:true}), document.getElementById('vidNext').checkVisibility(), "+NOBOX+"]")
            if w != 390: await pg.screenshot(path=f"{OUT}novidbox_story_{w}.png")
            await pg.evaluate("Story.data.intro.forEach(l=>l.after=null)")   # skip name entry for the test
            await pg.wait_for_function("!Story.typing", timeout=8000); t0 = await pg.evaluate("document.getElementById('dlgText').textContent")
            await pg.click("#vidNext"); await pg.wait_for_function("t=>{const x=document.getElementById('dlgText').textContent;return x.length>0&&x!==t&&!Story.typing}", arg=t0, timeout=8000)
            adv = await pg.evaluate("[Story.data.intro.findIndex(l=>Story.text(l)===document.getElementById('dlgText').textContent), document.getElementById('sceneVid').currentSrc.split('/').pop()]")
            for _ in range(6):
                if not await pg.evaluate("Story.active"): break
                await pg.click("#vidNext", timeout=15000); await pg.wait_for_timeout(400)
            sdone = await pg.evaluate("[Story.active, document.getElementById('dialog').classList.contains('hidden'), document.getElementById('sceneVideo').classList.contains('hidden')]")
            print(w, "story:", si, adv, sdone); ok = ok and si == [False, True, True] and adv[0] >= 1 and sdone == [None, True, True]
            # bridge: video + Continue, Continue leads to the roadmap walk
            await pg.evaluate("void Story.bridge('l0','l1')"); await pg.wait_for_function("document.getElementById('sceneVideo').dataset.scene==='trans_s01' && !document.getElementById('sceneVideo').classList.contains('hidden')", timeout=8000)
            br = await pg.evaluate("[document.querySelector('#bridge .bridgeCard').checkVisibility({visibilityProperty:true}), document.getElementById('vidNext').checkVisibility(), "+NOBOX+"]")
            await pg.click("#vidNext"); await pg.wait_for_timeout(1800)
            bd = await pg.evaluate("[document.getElementById('bridge').classList.contains('hidden'), document.getElementById('sceneVideo').classList.contains('hidden')]")
            print(w, "bridge:", br, bd); ok = ok and br == [False, True, True] and bd == [True, True]
            # gameplay: panel shrinks to the speaker's corner (Dingo -> right, Wendy -> left), no caption box, no Continue (play goes on)
            await pg.evaluate("localStorage.setItem('playerName','Lucy'); App.go('l0'); 0"); await pg.wait_for_timeout(1200)
            await pg.evaluate("void Voice.play(['dingo_L0_03'])"); await pg.wait_for_function("Voice.inVideo && document.getElementById('sceneVid').currentTime>0.5", timeout=6000)
            cor = await pg.evaluate("""(()=>{const b=document.getElementById('sceneVideo'),r=b.getBoundingClientRect();return {corner:b.classList.contains('corner'),left:b.classList.contains('left'),
              x:Math.round(r.left),w:Math.round(r.width),right:Math.round(innerWidth-r.right),bottom:Math.round(innerHeight-r.bottom),nobox:"""+NOBOX+""",btn:document.getElementById('vidNext').checkVisibility()}})()""")
            await pg.screenshot(path=f"{OUT}scene_L0_s03_corner_{w}.png")
            if w != 390: await pg.screenshot(path=f"{OUT}novidbox_level_{w}.png")
            await pg.wait_for_function("document.getElementById('sceneVideo').classList.contains('hidden')", timeout=15000)   # auto-advances, no click needed
            await pg.evaluate("void Voice.play(['wendy_L1_02'])"); await pg.wait_for_timeout(1200)
            wl = await pg.evaluate("[document.getElementById('sceneVideo').classList.contains('left'), "+NOBOX+"]")
            ok = ok and cor["corner"] and not cor["left"] and cor["right"] < 40 and cor["w"] < w * .5 and cor["nobox"] and not cor["btn"] and wl == [True, True]
            print(w, "corner:", cor, "wendy:", wl)
            print(w, st, after, errs, "OK" if ok else "FAIL"); ok or fails.append(w); await pg.close()
        # fresh profile: Start -> welcome (double-clicking Continue every step) -> journey map with L0 current, every line shown once
        pg = await b.new_page(viewport={"width": 1280, "height": 720}); await pg.goto("http://localhost:8777/"); await pg.evaluate("localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip"); await pg.wait_for_timeout(500)
        await pg.evaluate("window._seen=[]; const o=Story.type; Story.type=(el,t,c)=>{_seen.push(t); return o(el,t,c)}; 0")
        await pg.click("#homeStart"); await pg.wait_for_selector("#dialog:not(.hidden)", timeout=5000)
        for _ in range(60):
            if not await pg.evaluate("Story.active"): break
            if await pg.is_visible("#dlgNameRow"): await pg.fill("#dlgName", "Lucy"); await pg.click("#dlgNameOk"); continue
            if await pg.is_visible("#vidNext"): await pg.evaluate("{const b=document.getElementById('vidNext'); b.click(); b.click()}")   # fast double click
            await pg.wait_for_timeout(600)
        await pg.wait_for_timeout(800)
        rm = await pg.evaluate("({cur:App.cur, levels:document.getElementById('menu').classList.contains('levelsOn'), current:[...document.querySelectorAll('#roadmap .rmNode.current')].map(n=>n.dataset.i), lines:_seen.length, total:Story.data.intro.length})")
        await pg.screenshot(path=f"{OUT}intro_to_roadmap_1280.png")
        rok = rm["cur"] == "menu" and rm["levels"] and rm["current"] == ["0"] and rm["lines"] == rm["total"]
        print("intro -> roadmap (double clicks):", rm, "OK" if rok else "FAIL"); rok or fails.append("intro_roadmap"); await pg.close()
        await b.close()
    print("RESULT:", "PASS" if not fails else f"FAIL {fails}"); sys.exit(1 if fails else 0)
asyncio.run(main())
