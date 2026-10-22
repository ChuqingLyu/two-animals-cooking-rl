#!/usr/bin/env python3
"""Representative screens for typography review: python3 tools/shots_typo.py before|after"""
import asyncio, sys
from playwright.async_api import async_playwright
TAG = sys.argv[1]; OUT = "/workspace/cooking-game/shots/typo/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for w, h in [(1280, 720)]:
            pg = await b.new_page(viewport={"width": w, "height": h})
            await pg.goto("http://localhost:8777/"); await pg.wait_for_selector("#theatre:not(.hidden)", timeout=8000); await pg.click("#theatreSkip"); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"{OUT}{TAG}_1_home.png")
            await pg.click("#homeStart"); await pg.wait_for_selector("#dialog:not(.hidden)"); await pg.wait_for_timeout(2500); await pg.screenshot(path=f"{OUT}{TAG}_2_intro_dialog.png")
            await pg.evaluate("Voice.stop(); localStorage.setItem('playerName','Lucy'); localStorage.setItem('progress',3); document.getElementById('dialog').classList.add('hidden'); Story.active=null; App.go('menu'); 0"); await pg.wait_for_timeout(300)
            await pg.evaluate("document.querySelector('[data-go=menu]') && document.querySelector('header [data-go=menu]').click(); 0"); await pg.wait_for_timeout(1200); await pg.screenshot(path=f"{OUT}{TAG}_3_roadmap.png")
            await pg.evaluate("App.go('l1'); 0"); await pg.wait_for_timeout(1200)
            await pg.evaluate("document.getElementById('theatreSkip').click(); 0"); await pg.wait_for_timeout(800)
            await pg.evaluate("document.getElementById('popClose') && document.getElementById('popClose').click(); void Voice.play(['wendy_L1_02']); 0"); await pg.wait_for_timeout(2000); await pg.screenshot(path=f"{OUT}{TAG}_4_level1_subtitle.png")
            await pg.evaluate("Voice.stop(); localStorage.setItem('progress',5); App.go('final'); 0"); await pg.wait_for_timeout(2500); await pg.screenshot(path=f"{OUT}{TAG}_5_recap.png")
        await b.close()
asyncio.run(main())
