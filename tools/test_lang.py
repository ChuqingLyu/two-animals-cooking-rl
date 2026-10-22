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
        await pg.evaluate(f"""Voice.zh.voice['{fb}']={{zh:'测试中文字幕'}}; Lang.toggle(); 0""")
        for sid in ["L0_s01", "C1_s01", "L2_s01", "trans_s01"]:   # real PM-bot zh text + synced clean videos
            lid, zt = await pg.evaluate(f"[Voice.scenes['{sid}'].lines[0].id, Voice.zhLine(Voice.scenes['{sid}'].lines[0].id)]")
            await pg.evaluate(f"Voice.stop(); void Voice.play(['{lid}'])"); await pg.wait_for_function("Voice.inVideo && document.getElementById('sceneSub').textContent.length>0 && document.getElementById('sceneSub').checkVisibility()", timeout=10000)
            zv = await pg.evaluate("[document.getElementById('sceneVid').currentSrc.split('/').pop(), document.getElementById('sceneSub').checkVisibility(), document.getElementById('sceneSub').textContent]")
            await pg.screenshot(path=f"{OUT}lang_scene_zh_{sid}_1280.png")
            ck(f"zh scene video {sid}: clean + web subtitle", zv[0] == sid + "_clean.mp4" and zv[1] and bool(zt) and zv[2].endswith(zt), zv)
        await pg.evaluate(f"Voice.stop(); void Voice.play(['{fb}'])"); await pg.wait_for_timeout(700)
        cap = await pg.evaluate("document.getElementById('subtitle').textContent"); ck("zh Kokoro caption", "测试中文字幕" in cap, cap)
        await pg.evaluate("Voice.stop(); delete Voice.zh.scenes[Voice.sceneOf.dingo_L0_03.sid]; void Voice.play(['dingo_L0_03'])"); await pg.wait_for_function("Voice.inVideo && document.getElementById('sceneVid').currentTime>0.3", timeout=8000)
        nz = await pg.evaluate("[document.getElementById('sceneVid').currentSrc.split('/').pop(), document.getElementById('sceneSub').checkVisibility()]")
        ck("zh, scene without zh text -> English subtitled video", not nz[0].endswith("_clean.mp4") and not nz[1], nz)
        await pg.evaluate("Voice.stop(); Lang.toggle(); void Voice.play(['dingo_L0_01'])"); await pg.wait_for_function("Voice.inVideo && document.getElementById('sceneVid').currentTime>0.3", timeout=8000)
        ev = await pg.evaluate("[document.getElementById('sceneVid').currentSrc.split('/').pop(), document.getElementById('sceneSub').checkVisibility()]")
        ck("en scene video unchanged", ev == ["L0_s01.mp4", False], ev)
        # in-level hint: zh from hints_zh.json, English fallback
        await pg.evaluate("Voice.stop(); Lang.toggle(); Guide.zh['Now walk to the pot and press Space.']='现在走到锅边，按空格键。'; 0")
        hz = await pg.evaluate("Guide.say('dingo','Now walk to the pot and press Space.'); const a=document.querySelector('#guideBubble').textContent; Guide.say('dingo','Not there. Look for the onion box.'); [a, document.querySelector('#guideBubble').textContent]")
        ck("zh hint + English fallback", "现在走到锅边" in hz[0] and "豆丁" in hz[0] and "Not there" in hz[1], hz)
        # knowledge-card images: live swap to *_v2_zh.png and back (popup + report gallery)
        await pg.evaluate("Lang.cur==='zh'&&Lang.toggle(); Pop.card(Object.keys(Pop.CARD_IMG)[0]); 0"); await pg.wait_for_timeout(300)
        KC = "[...document.querySelectorAll('img[src*=knowledge_card_]')].map(i=>i.getAttribute('src').split('/').pop())"
        en = await pg.evaluate(KC); await pg.evaluate("Lang.toggle()"); zh = await pg.evaluate(KC)
        ld = await pg.evaluate("Promise.all([...document.querySelectorAll('img[src*=knowledge_card_]')].map(i=>i.decode().then(()=>i.naturalWidth).catch(()=>0)))")
        await pg.evaluate("Lang.toggle()"); back = await pg.evaluate(KC)
        ck("knowledge card images en/zh/en", len(en) >= 5 and all(x.endswith("_v2.png") for x in en) and all(x.endswith("_v2_zh.png") for x in zh) and len(zh) == len(en) and all(ld) and back == en, [en, zh])
        await pg.evaluate("Voice.stop()"); ck("no page errors", not errs, errs)
        await b.close()
    print("RESULT:", "PASS" if not fails else f"FAIL {fails}"); sys.exit(1 if fails else 0)
asyncio.run(main())
