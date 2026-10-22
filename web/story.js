// Story layer: Dingo's welcome dialogue (typewriter, name entry), level bridges, and the roadmap progress view.
// Text + voice ids: data/story.json ({name} templating; voice may be ""). Roadmap art: ROADMAP_ART (swap when delivered).
const ROADMAP_ART = {
  bg: {"1920": "assets/roadmap/roadmap_bg.jpg", "1280": "assets/roadmap/roadmap_bg_1280.jpg"}, // path is painted into the background
  nodes: "assets/roadmap/nodes.json",            // node centres as 0-1 ratios of the background (nx, ny), node_size px @1920
  node: {locked: "assets/roadmap/node_locked_blank.png", current: "assets/roadmap/node_current_blank.png", done: "assets/roadmap/node_done_blank.png"},
  bounce: "assets/roadmap/node_current_bounce.json", // 16-frame sprite sheet, bottom-anchored, for the current node
  dingo: "assets/ui/dingo_avatar.png",          // avatar that sits on the current node
};

// A canvas that draws one Character (home skin) every frame, e.g. Dingo in the dialogue and bridge boxes
class CharView {
  constructor(canvas, name, skin = "home") {
    this.c = canvas; this.ctx = canvas.getContext("2d"); this.ch = Character.create(name, skin); this.name = name; this.last = performance.now();
    const f = now => { this.raf = requestAnimationFrame(f); if (!this.c.offsetParent) { this.last = now; return; }
      this.ch.auto({talking: Voice.speaking === this.name}); this.ch.update(now - this.last); this.last = now; this.draw(); };
    this.raf = requestAnimationFrame(f);
  }
  draw() {
    const {c, ctx, ch} = this, [w, h] = ch.size("down") || [c.width, c.height], s = Math.min(c.width / w, c.height / h);
    ctx.clearRect(0, 0, c.width, c.height); ch.draw(ctx, (c.width - w * s) / 2, c.height - h * s, w * s, h * s, "down");
  }
}

class Story {
  static data = {intro: [], bridges: {}, default_name: {en: "Friend", zh: "小朋友"}};
  static active = null;                                   // "intro" | "bridge" while a box owns Dingo's lines
  static async load() { try { Story.data = await (await fetch("data/story.json")).json(); } catch (e) {} }
  static defaultName() { return (Story.data.default_name || {})[Lang.cur] || "Friend"; }
  static text(line) { return Voice.fill(line[Lang.cur] || line.en || ""); }
  static captures(line) { return Story.active === "recap" || (!!Story.active && line.character === "dingo"); }
  static view() { return Story._view || (Story._view = new CharView(document.getElementById("dlgDingo"), "dingo")); }

  // typewriter into el; resolves when done; a click (skip()) completes it at once
  static type(el, text, cps = 40) {
    el.textContent = ""; let i = 0;
    return new Promise(res => {
      Story.finish = () => { clearInterval(Story.tw); el.textContent = text; Story.typing = false; res(); };
      Story.typing = true; Story.tw = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) Story.finish(); }, 1000 / cps);
    });
  }
  // wait for Next / click-to-advance (first click finishes the typewriter)
  static next() { return new Promise(res => { Story.advance = res; }); }
  static click() { if (Story.typing) return Story.finish(); if (Story.inputOpen) return; const a = Story.advance; Story.advance = null; a && a(); }

  // Dingo's welcome after the opening. Resolves when the last line is acknowledged.
  static async intro() {
    const box = document.getElementById("dialog"), txt = document.getElementById("dlgText"), inp = document.getElementById("dlgName");
    Story.active = "intro"; Story.view(); Music.scene("welcome");
    box.classList.remove("hidden"); document.getElementById("dlgNameRow").classList.add("hidden");
    for (const line of Story.data.intro) {
      if (line.voice) Voice.play([line.voice]);
      await Story.type(txt, Story.text(line));
      if (line.after === "name_input") {
        await Story.voiceDone();
        const row = document.getElementById("dlgNameRow"); row.classList.remove("hidden");
        inp.value = localStorage.getItem("playerName") || ""; inp.placeholder = Story.defaultName(); inp.focus(); Story.inputOpen = true;
        await new Promise(res => { const ok = () => { Story.inputOpen = false; row.classList.add("hidden");
          localStorage.setItem("playerName", inp.value.trim().slice(0, 16) || Story.defaultName()); res(); };
          document.getElementById("dlgNameOk").onclick = e => { e.stopPropagation(); ok(); };
          inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") ok(); }; });
        continue;
      }
      await Story.next();
    }
    Voice.stop(); box.classList.add("hidden"); Story.active = null;
  }
  static voiceDone() { return new Promise(res => { const w = () => Voice.speaking ? setTimeout(w, 100) : res(); setTimeout(w, 150); }); }

  // end of a level: Dingo + bridge line + big Next, then the roadmap shows Dingo walking to the next stop
  static async bridge(from, to) {
    const line = Story.data.bridges[from + ">" + to] || {en: "", zh: ""};
    const box = document.getElementById("bridge"), txt = document.getElementById("bridgeText");
    Story.active = "bridge"; Music.scene("bridge"); Voice.stop();
    box.classList.remove("hidden"); Roadmap.render(document.getElementById("bridgeMap"), Progress.ORDER.indexOf(from));
    Story._bview = Story._bview || new CharView(document.getElementById("bridgeDingo"), "dingo");
    if (line.voice) Voice.play([line.voice]);
    await Story.type(txt, Story.text(line));
    await new Promise(res => { document.getElementById("bridgeNext").onclick = e => { e.stopPropagation(); if (Story.typing) Story.finish(); res(); }; });
    Voice.stop(); Story.active = null; box.classList.add("walking");
    await Roadmap.walk(document.getElementById("bridgeMap"), Progress.ORDER.indexOf(from), Progress.ORDER.indexOf(to));
    box.classList.add("hidden"); box.classList.remove("walking");
  }
}

// Storybook roadmap: winding SVG path with 6 stops (L0..L4 + Recap). States: locked / current (bounce + ring) / done (star).
class Roadmap {
  static STOPS = [[.1416, .6944], [.2246, .809], [.4141, .8715], [.5898, .7708], [.7373, .8142], [.8369, .6267]];   // overwritten from nodes.json
  static NODE = 160 / 1920;
  static LABEL = ["l0_name", "l1_name", "l2_name", "l3_name", "l4_name", "final_name"];
  static async load() {
    try { const n = await (await fetch(ROADMAP_ART.nodes)).json(); Roadmap.STOPS = n.nodes.map(o => [o.nx, o.ny]); Roadmap.NODE = n.node_size / n.size[0]; } catch (e) {}
    try { Roadmap.bounce = await (await fetch(ROADMAP_ART.bounce)).json(); } catch (e) {}
  }
  static state(i, cur) { const done = Progress.max(); return i === cur ? "current" : i < cur || i < done ? "done" : "locked"; }
  static render(el, cur = Progress.cur(), {clickable = false} = {}) {
    const P = Roadmap.STOPS, bg = innerWidth > 1300 ? ROADMAP_ART.bg["1920"] : ROADMAP_ART.bg["1280"], b = Roadmap.bounce;
    el.classList.add("roadmap"); el.style.setProperty("--node", Roadmap.NODE * 100 + "cqw");
    el.innerHTML = `<div class="rmBox" style="background-image:url(${bg})">` + P.map(([x, y], i) => { const st = Roadmap.state(i, cur);
        return `<button class="rmNode ${st}" data-i="${i}" style="left:${x * 100}%;top:${y * 100}%;--img:url(${ROADMAP_ART.node[st]})" ${st === "locked" ? "disabled" : ""}
          aria-label="${Lang.t(Roadmap.LABEL[i])}"><i class="rmBounce" style="--sheet:url(assets/roadmap/${b ? b.sheet : ""});--n:${b ? b.count : 1};--dur:${b ? b.count / b.fps : 1}s"></i><b>${i === 5 ? "★" : i}</b><span>${Lang.t(Roadmap.LABEL[i])}</span></button>`; }).join("") +
      `<img class="rmDingo" src="${ROADMAP_ART.dingo}" alt="Dingo" style="left:${P[cur][0] * 100}%;top:${P[cur][1] * 100}%"></div>`;
    if (clickable) el.querySelectorAll(".rmNode:not(:disabled)").forEach(n => n.onclick = () => App.go(Progress.ORDER[+n.dataset.i]));
  }
  static walk(el, a, b) {
    const d = el.querySelector(".rmDingo"), P = Roadmap.STOPS; if (!d || b < 0) return Promise.resolve();
    return new Promise(res => {
      d.style.transition = "left .9s ease-in-out, top .9s ease-in-out";
      requestAnimationFrame(() => requestAnimationFrame(() => { d.style.left = P[b][0] * 100 + "%"; d.style.top = P[b][1] * 100 + "%"; }));
      const n = el.querySelectorAll(".rmNode");
      setTimeout(() => { const set = (k, st) => { if (!n[k]) return; n[k].className = "rmNode " + st; n[k].style.setProperty("--img", `url(${ROADMAP_ART.node[st]})`); n[k].disabled = false; }; set(a, "done"); set(b, "current"); }, 600);
      setTimeout(res, 1300);
    });
  }
}
