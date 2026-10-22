#!/usr/bin/env python3
"""Scene video test: L0 opening line dingo_L0_01 plays from the clean scene video (assets/lines/L0_s01_clean.mp4)
with our own 'Dingo: ...' caption (speaker colored), music ducked, no Kokoro mp3. Server: localhost:8777 -> web/."""
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
            st = await pg.evaluate("""(()=>{const v=document.getElementById('sceneVid'),c=document.getElementById('sceneSub'),bb=c.querySelector('b');
              return {visible:document.getElementById('sceneVideo').checkVisibility(), src:v.currentSrc.split('/').pop(), playing:!v.paused&&v.currentTime>0.3,
                caption:c.textContent, cls:c.className, color:bb&&getComputedStyle(bb).color, ducked:Music.ducked, kokoro:!Voice.audio.paused}})()""")
            ok = st["visible"] and st["src"] == "L0_s01_clean.mp4" and st["playing"] and st["caption"].startswith("Dingo: Welcome") and st["cls"] == "sub-dingo" and st["color"] == "rgb(246, 178, 107)" and st["ducked"] and not st["kokoro"]
            if w != 390: await pg.screenshot(path=f"{OUT}scene_L0_s01_{w}.png")
            await pg.wait_for_function("document.getElementById('sceneVideo').classList.contains('hidden') && Voice.audio.src.includes('/voice/')", timeout=12000)
            after = await pg.evaluate("[document.getElementById('sceneVideo').classList.contains('hidden'), Voice.audio.src.split('/').pop()]")
            await pg.evaluate('Voice.stop()')
            ok = ok and after[0] and after[1] == fb + ".mp3" and not errs   # next line falls back to Kokoro
            # gameplay: panel shrinks to the speaker's corner (Dingo -> right, Wendy -> left), centred elsewhere
            await pg.evaluate("localStorage.setItem('playerName','Lucy'); App.go('l0'); 0"); await pg.wait_for_timeout(1200)
            await pg.evaluate("void Voice.play(['dingo_L0_03'])"); await pg.wait_for_function("document.getElementById('sceneSub').textContent.length>0", timeout=6000)
            cor = await pg.evaluate("""(()=>{const b=document.getElementById('sceneVideo'),r=b.getBoundingClientRect();return {corner:b.classList.contains('corner'),left:b.classList.contains('left'),
              x:Math.round(r.left),w:Math.round(r.width),right:Math.round(innerWidth-r.right),bottom:Math.round(innerHeight-r.bottom),cap:document.getElementById('sceneSub').textContent}})()""")
            await pg.screenshot(path=f"{OUT}scene_L0_s03_corner_{w}.png")
            await pg.evaluate("void Voice.play(['wendy_L1_02'])"); await pg.wait_for_timeout(1200)
            wl = await pg.evaluate("[document.getElementById('sceneVideo').classList.contains('left'), document.getElementById('sceneSub').textContent]")
            ok = ok and cor["corner"] and not cor["left"] and cor["right"] < 40 and cor["w"] < w * .5 and cor["cap"].startswith("Dingo: ") and wl[0] and wl[1].startswith("Wendy: ")
            print(w, "corner:", cor, "wendy:", wl)
            print(w, st, after, errs, "OK" if ok else "FAIL"); ok or fails.append(w); await pg.close()
        await b.close()
    print("RESULT:", "PASS" if not fails else f"FAIL {fails}"); sys.exit(1 if fails else 0)
asyncio.run(main())
