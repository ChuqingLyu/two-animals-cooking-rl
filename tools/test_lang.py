#!/usr/bin/env python3
"""Language toggle test: English by default (fresh profile, zh browser locale ignored), EN / 中文 toggle switches a UI label, the recap
knowledge card, the certificate and a Kokoro caption to Chinese and back, persists across reload; Chinese scene video = clean mp4 + web
subtitle strip (only when the scene has zh text), English = subtitled mp4. Server: localhost:8777 -> web/."""
import asyncio, sys, json
from playwright.async_api import async_playwright
OUT = "/workspace/cooking-game/shots/"; ART = "/workspace/cooking-game/art/lines/scenes/"
async def main():
    fails = []
    def ck(name, ok, info=""): print(name, info, "OK" if ok else "FAIL"); ok or fails.append(name)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN"); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        # clean scene video is not in web/ until its zh text exists -> serve GAD's file for the test
        await pg.route("**/assets/lines/L0_s01_clean.mp4", lambda r: r.fulfill(path=ART + "L0_s01_clean.mp4", content_type="video/mp4"))
        await pg.goto("http://localhost:8777/"); await pg.evaluate("localStorage.clear()"); await pg.reload()
        await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip"); await pg.wait_for_timeout(500)
        nav = "document.querySelector('button[data-go=menu]').textContent"
        st = await pg.evaluate(f"[Lang.cur, document.documentElement.lang, {nav}, document.title, document.getElementById('langBtn').textContent]")
        ck("default English", st[0] == "en" and st[1] == "en" and st[2] == "Levels" and st[3] == "Q-Kitchen" and "EN" in st[4] and "中文" in st[4], st)
        await pg.evaluate("document.getElementById('langBtn').click()"); await pg.wait_for_timeout(200)
        st = await pg.evaluate(f"[Lang.cur, {nav}, localStorage.getItem('lang'), document.title]")
        ck("toggle -> zh UI label", st[:3] == ["zh", "关卡菜单", "zh"] and st[3] == "Q-Kitchen", st)
        await pg.reload(); await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip"); await pg.wait_for_timeout(500)
        ck("persists across reload", await pg.evaluate("Lang.cur") == "zh")
        await pg.evaluate("document.getElementById('langBtn').click()"); await pg.wait_for_timeout(200)
        # recap card + certificate
        await pg.evaluate("localStorage.setItem('playerName','Lucy'); localStorage.setItem('progress',5); App.go('final'); 0"); await pg.wait_for_selector("#recap:not(.hidden)", timeout=8000); await pg.wait_for_timeout(800)
        CARD = "[document.getElementById('kcTermMain').textContent, document.getElementById('kcDef').textContent, document.getElementById('recapTitle').textContent]"
        en = await pg.evaluate(CARD); await pg.evaluate("document.getElementById('langBtn').click()"); await pg.wait_for_timeout(300); zh = await pg.evaluate(CARD)
        await pg.screenshot(path=f"{OUT}lang_recap_zh_1280.png"); await pg.evaluate("document.getElementById('langBtn').click()"); await pg.wait_for_timeout(300); back = await pg.evaluate(CARD)
        ck("recap card en/zh/en", en[0] == "Agent" and en[1].startswith("The one") and zh[0] == "智能体" and zh[1].startswith("做决定") and "智能体" in zh[2] and back == en, [en, zh])
        await pg.evaluate("Final.show(Final.data.lessons.length + 1)"); await pg.wait_for_selector("#certificate:not(.hidden)", timeout=5000)
        CERT = "[document.querySelector('#certBox .cTitle').textContent, [...document.querySelectorAll('#certBox .cTopics li')].map(e=>e.textContent).join('|'), document.querySelector('#certBox .cSig').textContent]"
        en = await pg.evaluate(CERT); await pg.evaluate("document.getElementById('langBtn').click()"); await pg.wait_for_timeout(300); zh = await pg.evaluate(CERT)
        await pg.screenshot(path=f"{OUT}lang_cert_zh_1280.png"); await pg.evaluate("document.getElementById('langBtn').click()"); await pg.wait_for_timeout(300); back = await pg.evaluate(CERT)
        ck("certificate en/zh/en", en[0] == "Little AI Chef" and "Reward design" in en[1] and "Confidence" in en[1] and "Team value" in en[1] and zh[0] == "小小 AI 厨师" and "智能体" in zh[1] and zh[2] == "豆丁" and back == en, [en, zh])
        # Kokoro / mp3 caption + scene video in zh mode
        await pg.evaluate("App.go('l0'); Voice.stop(); 0"); await pg.wait_for_timeout(800)
        fb = await pg.evaluate("Object.keys(Voice.lines).find(k=>k.startsWith('dingo_')&&!Voice.sceneOf[k]&&Voice.lines[k].file&&!Voice.lines[k].cont)")
        await pg.evaluate(f"""Voice.zh.voice['{fb}']={{zh:'测试中文字幕'}}; Voice.zh.scenes.L0_s01=Voice.scenes.L0_s01.lines.map(l=>({{id:l.id,zh:'欢迎来到我的厨房'}})); Voice.scenes.L0_s01.video_clean='assets/lines/L0_s01_clean.mp4'; Lang.toggle(); 0""")
        await pg.evaluate("Voice.stop(); void Voice.play(['dingo_L0_01'])"); await pg.wait_for_function("Voice.inVideo && document.getElementById('sceneVid').currentTime>0.5", timeout=8000); await pg.wait_for_timeout(800)
        zv = await pg.evaluate("[document.getElementById('sceneVid').currentSrc.split('/').pop(), document.getElementById('sceneSub').checkVisibility(), document.getElementById('sceneSub').textContent]")
        await pg.screenshot(path=f"{OUT}lang_scene_zh_1280.png")
        ck("zh scene video: clean + web subtitle", zv[0] == "L0_s01_clean.mp4" and zv[1] and zv[2] == "豆丁：欢迎来到我的厨房", zv)
        await pg.evaluate(f"Voice.stop(); void Voice.play(['{fb}'])"); await pg.wait_for_timeout(700)
        cap = await pg.evaluate("document.getElementById('subtitle').textContent"); ck("zh Kokoro caption", "测试中文字幕" in cap, cap)
        await pg.evaluate("Voice.stop(); delete Voice.zh.scenes.L0_s02; void Voice.play(['dingo_L0_03'])"); await pg.wait_for_function("Voice.inVideo && document.getElementById('sceneVid').currentTime>0.3", timeout=8000)
        nz = await pg.evaluate("[document.getElementById('sceneVid').currentSrc.split('/').pop(), document.getElementById('sceneSub').checkVisibility()]")
        ck("zh, scene without zh text -> English subtitled video", not nz[0].endswith("_clean.mp4") and not nz[1], nz)
        await pg.evaluate("Voice.stop(); Lang.toggle(); void Voice.play(['dingo_L0_01'])"); await pg.wait_for_function("Voice.inVideo && document.getElementById('sceneVid').currentTime>0.3", timeout=8000)
        ev = await pg.evaluate("[document.getElementById('sceneVid').currentSrc.split('/').pop(), document.getElementById('sceneSub').checkVisibility()]")
        ck("en scene video unchanged", ev == ["L0_s01.mp4", False], ev)
        await pg.evaluate("Voice.stop()"); ck("no page errors", not errs, errs)
        await b.close()
    print("RESULT:", "PASS" if not fails else f"FAIL {fails}"); sys.exit(1 if fails else 0)
asyncio.run(main())
