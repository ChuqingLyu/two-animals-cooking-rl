// Guide: highlights the next target (glow ring + bouncing arrow), shows a 5 s idle hint, and turns wrong actions into a
// one-line hint from the relevant character. Copy: data/hints.json (built from docs/hints.md by tools/build_hints.py).
const GUIDE_ART = {
  ring:    {json: "assets/ui/guide/ring_sheet.json", still: "assets/ui/guide/ring.png"},        // 24 frames, scaled onto buttons/tiles
  pointer: {json: "assets/ui/guide/arrow_down_sheet.json", still: "assets/ui/guide/arrow_down.png"},
  hand:    {json: "assets/ui/guide/hand_point_sheet.json", still: "assets/ui/guide/hand_point.png"}, // delivered; not used by default (see report)
  bubble:  {left: "assets/ui/guide/hint_bubble_left.png", right: "assets/ui/guide/hint_bubble_right.png"},
  avatar:  {dingo: "assets/ui/dingo_avatar.png", wendy: "assets/home/wendy_home.png", kai: "assets/home/kai_home.png"},
};
class Guide {
  static IDLE_MS = 5000;
  static WRONG_GAP_MS = 5000;
  static hints = {levels: {}, shared: {}};
  static level = null; static step = null; static stepFn = null; static lastInput = performance.now(); static shownIdle = false; static lastWrong = {};
  static async load() {
    try { Guide.hints = await (await fetch("data/hints.json")).json(); } catch (e) {}
    try { const r = await fetch("data/hints_zh.json"); Guide.zh = r.ok ? await r.json() : {}; } catch (e) { Guide.zh = {}; }   // English text -> 中文 (tools/build_hints_zh.py)
    for (const k of ["ring", "pointer"]) try { GUIDE_ART[k].meta = await (await fetch(GUIDE_ART[k].json)).json(); } catch (e) {}
    ["pointerdown", "keydown"].forEach(t => addEventListener(t, () => Guide.input(), true));
    setInterval(() => Guide.poll(), 250);
    addEventListener("resize", () => Guide.place());
  }
  static get(level, id) { return ((Guide.hints.levels || {})[level] || {})[id]; }
  // level: "L0".."L4"; fn() -> current step id (state-based), or null for nothing to guide
  static watch(level, fn, kitchen) { Guide.level = level; Guide.stepFn = fn; Guide.kitchen = kitchen || null; Guide.step = null; Guide.input(); Guide.poll(); }
  static clear() { Guide.level = null; Guide.stepFn = null; Guide.kitchen = null; Guide.setStep(null); Guide.hide(); }
  static input() { Guide.lastInput = performance.now(); if (Guide.shownIdle) { Guide.shownIdle = false; Guide.hide(); } }
  static poll() {
    if (!Guide.stepFn) return;
    try { Guide.tick(); } catch (e) { console.warn("guide", e); }
  }
  static tick() {
    const id = Guide.stepFn(); if (id !== Guide.step) Guide.setStep(id);          // highlight moves the moment a step completes
    const h = Guide.get(Guide.level, Guide.step);
    if (h && h.idle && !Guide.shownIdle && !Voice.speaking && !(typeof Story !== "undefined" && Story.active) && performance.now() - Guide.lastInput >= Guide.IDLE_MS) {
      Guide.shownIdle = true; Guide.say(h.idle.speaker, h.idle.text);
    }
    Guide.place();
  }
  static setStep(id) { Guide.step = id; Guide.shownIdle = false; Guide.hide(); Guide.lastInput = performance.now(); try { Guide.place(); } catch (e) { console.warn("guide", e); } }
  // DOM rect(s) of the current target: CSS selector, kitchen tiles (via KitchenGame.tileRect) or a character
  static rects() {
    const h = Guide.get(Guide.level, Guide.step); if (!h || !h.target) return [];
    const t = h.target;
    if (t.tiles && Guide.kitchen) return t.tiles.map(([x, y]) => Guide.kitchen.tileRect(x, y));
    if (t.char !== undefined && Guide.kitchen) { const p = Guide.kitchen.k.p[t.char]; return [Guide.kitchen.tileRect(p.x, p.y)]; }
    if (t.sel) { const el = [...Guide.qsa(t.sel)].find(e => e.offsetParent && !e.disabled); return el ? [el.getBoundingClientRect()] : []; }
    return [];
  }
  // tolerant selector: hints.md may use ranges like [data-v=1..5]; fall back to the selector without that attribute
  static qsa(sel) {
    try { return document.querySelectorAll(sel); }
    catch (e) { try { return document.querySelectorAll(sel.replace(/\[[^\]]*\.\.[^\]]*\]/g, "")); } catch (e2) { return []; } }
  }
  static place() {
    const layer = document.getElementById("guideLayer"); if (!layer) return;
    const rs = (Guide.stepFn ? Guide.rects() : []).filter(r => r && r.width);
    while (layer.children.length < rs.length * 2) { const r = document.createElement("i"); r.className = "gRing"; const a = document.createElement("i"); a.className = "gPointer"; layer.append(r, a); }
    [...layer.children].forEach((e, k) => { const r = rs[k >> 1]; e.style.display = r ? "" : "none"; if (!r) return;
      if (e.className === "gRing") { const s = Math.max(r.width, r.height) * 1.35; Object.assign(e.style, {left: r.left + r.width / 2 - s / 2 + "px", top: r.top + r.height / 2 - s / 2 + "px", width: s + "px", height: s + "px"}); }
      else { const w = Math.max(28, Math.min(56, r.width * .45)); Object.assign(e.style, {left: r.left + r.width / 2 - w / 2 + "px", top: r.top - w * 1.5 - 4 + "px", width: w + "px", height: w * 1.5 + "px"}); }
    });
    Guide.placeBubble(rs[0]);
  }
  // one-line hint in the art bubble from the given speaker, placed next to the target (or the speaker in the kitchen)
  static say(speaker, text, near) {
    const b = document.getElementById("guideBubble");
    b.querySelector("img").src = GUIDE_ART.avatar[speaker] || GUIDE_ART.avatar.dingo;
    const zh = Lang.cur === "zh";   // Chinese mode: hints_zh.json, English fallback
    b.querySelector("b").textContent = ((zh ? Voice.NAMES_ZH : Voice.NAMES)[speaker] || speaker) + (zh ? "：" : ":");
    b.querySelector("span").textContent = Voice.fill((zh && (Guide.zh || {})[text]) || text); b.dataset.speaker = speaker;
    b.classList.remove("hidden"); Guide.near = near || null; Guide.shownAt = performance.now(); Guide.place();
    clearTimeout(Guide.hideT); Guide.hideT = setTimeout(() => Guide.hide(), 4500);
  }
  static hide() { const b = document.getElementById("guideBubble"); b && b.classList.add("hidden"); }
  static placeBubble(r) {
    const b = document.getElementById("guideBubble"); if (!b || b.classList.contains("hidden")) return;
    const t = Guide.near || r; const W = Math.min(440, innerWidth - 20);
    let x = t ? t.left + t.width / 2 : innerWidth / 2, y = t ? t.top : innerHeight / 2;
    const right = x > innerWidth / 2;                                   // bubble on the side with more room; tail points at target
    b.style.backgroundImage = `url(${right ? GUIDE_ART.bubble.right : GUIDE_ART.bubble.left})`;
    b.style.width = W + "px";
    const left = Math.max(10, Math.min(innerWidth - W - 10, right ? x - W + 40 : x - 40));
    const top = Math.max(10, y - b.offsetHeight - 70);
    Object.assign(b.style, {left: left + "px", top: (top < 10 ? (t ? t.bottom + 10 : 10) : top) + "px"});
  }
  // wrong action -> the relevant character's line (from the current step's "wrong" list), throttled; no red X
  static wrong(kind, {who, near} = {}) {
    let line = null;
    if (kind === "unreachable") line = Guide.hints.shared.unreachable;
    else if (kind === "bump") line = (Guide.get(Guide.level, "bump") || {wrong: []}).wrong[0];
    else { const h = Guide.get(Guide.level, Guide.step); const ws = (h && h.wrong) || [];
      line = (typeof kind === "string" && ws.find(w => w.when.includes(kind))) || ws[0]; }
    if (!line) return false;
    const key = line.text, now = performance.now(); if (now - (Guide.lastWrong[key] || -1e9) < Guide.WRONG_GAP_MS) return true;
    Guide.lastWrong[key] = now; Guide.say(line.speaker, line.text, near); return true;
  }
}
