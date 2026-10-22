// 两只小动物学做饭 — static demo. No server logic; open via any static file server.
// Levels 1, 2 and the team-value card replay precomputed rollouts of real VDN checkpoints (data/*.json).
// Level 3's AI partner is a small rule planner in JS (the trained MLP needs Overcooked's featurizer, not ported).
"use strict";
const T = 64, TOP = 64;
const REWARD_W = {useful_onion_pickup: .1, useful_onion_drop: .15, useful_dish_pickup: .3, useful_dish_drop: .15,
  potting_onion: 1, useless_onion_potting: -.5, catastrophic_onion_potting: -1, soup_pickup: 3, soup_delivery: 50};
const STAGES = [0, 25, 50, 100, 200];
const ITEM_COL = {onion: "#f0c83c", dish: "#f5f5f5", soup: "#e67832"};
const TILE = {X: "counter", P: "pot", O: "onion", D: "dish", S: "serve", " ": "floor"};

// ---------- i18n ----------
const Lang = {
  cur: "en",
  t(k) { return I18N[this.cur][k]; },
  apply() {
    document.querySelectorAll("[data-t]").forEach(e => { const v = this.t(e.dataset.t); if (typeof v === "string") e.textContent = v; });
    document.getElementById("langBtn").textContent = this.cur === "zh" ? "EN" : "中文";
    document.documentElement.lang = this.cur;
    document.title = this.t("title") + " · Demo";
    App.refresh();
  },
};

// ---------- assets (all filenames from assets/manifest.json) ----------
const Assets = {
  img: {},
  async load() {
    const m = await (await fetch("assets/manifest.json")).json();
    const jobs = [];
    const add = (key, file) => jobs.push(new Promise(res => { const i = new Image(); i.onload = () => res(); i.onerror = () => res(); i.src = "assets/" + file; this.img[key] = i; }));
    for (const [k, f] of Object.entries(m.tiles)) add("t_" + k, f);
    for (const who of ["player", "partner"]) for (const [k, f] of Object.entries(m[who])) add(who + "_" + k, f);
    for (const [k, f] of Object.entries(m.bubbles)) add("b_" + k, f);
    add("owl", m.owl);
    await Promise.all(jobs);
  },
  data: {},
  async json(name) {
    if (!this.data[name]) this.data[name] = await (await fetch("data/" + name + ".json")).json();
    return this.data[name];
  },
};

// ---------- drawing ----------
const Draw = {
  scene(ctx, terrain, fr, o = {}) {
    ctx.clearRect(0, 0, 320, 320);
    ctx.fillStyle = "#fff8ec"; ctx.fillRect(0, 0, 320, TOP);
    terrain.forEach((row, y) => [...row].forEach((c, x) => ctx.drawImage(Assets.img["t_" + TILE[c]], x * T, y * T + TOP, T, T)));
    const pots = Draw.cells(terrain, "P");
    fr.pots.forEach((p, i) => {
      if (!p.n) return; const [x, y] = pots[i];
      ctx.fillStyle = p.ready ? "#3caa3c" : p.cooking ? "#e67832" : "#5a5a5a";
      ctx.fillRect(x * T + 16, y * T + TOP + 44, 32, 16);
      ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.fillText(p.ready ? "OK" : p.n + "/3", x * T + 22, y * T + TOP + 56);
    });
    (fr.counter || []).forEach(c => Draw.item(ctx, c.x * T + 32, c.y * T + TOP + 32, c.o, 9));
    if (o.trails) o.trails.forEach(([pts, col]) => pts.forEach(([x, y], k) => {
      ctx.globalAlpha = .15 + .7 * k / pts.length; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x * T + 32, y * T + TOP + 40, 6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }));
    fr.p.forEach((p, i) => {
      const img = Assets.img[(i ? "partner_" : "player_") + p.f];
      const w = Math.min(T, img.naturalWidth || T), h = (img.naturalHeight || T) * w / (img.naturalWidth || T);
      const sx = p.x * T + (T - w) / 2, sy = p.y * T + TOP + T - h;      // bottom-anchored
      ctx.drawImage(img, sx, sy, w, h);
      if (p.h) Draw.item(ctx, p.x * T + 50, p.y * T + TOP + 50, p.h, 7);
      p._top = sy;
    });
    if (o.bubble !== false && fr.p[1] && fr.p[1].intent) Draw.bubble(ctx, fr.p[1], fr.p[1].intent);
  },
  cells(terrain, ch) { const r = []; terrain.forEach((row, y) => [...row].forEach((c, x) => { if (c === ch) r.push([x, y]); })); return r; },
  item(ctx, cx, cy, name, r) {
    ctx.fillStyle = ITEM_COL[name] || "#ccc"; ctx.strokeStyle = "#5a3c1e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke();
  },
  bubble(ctx, p, it) {
    const img = Assets.img["b_" + it.icon]; if (!img) return;
    const w = 40, h = img.naturalHeight * w / img.naturalWidth;
    const x = Math.min(320 - w, p.x * T + 30), y = Math.max(0, p._top - h + 6);   // above sprite top
    if (it.style === "dashed") {
      ctx.globalAlpha = .55; ctx.drawImage(img, x, y, w, h); ctx.globalAlpha = 1;
      ctx.setLineDash([4, 3]); ctx.strokeStyle = "#555"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
      ctx.fillStyle = "#c81e1e"; ctx.font = "bold 16px sans-serif"; ctx.fillText("?", x + w - 4, y + 12);
    } else ctx.drawImage(img, x, y, w, h);
  },
  hud(ctx, lines) {
    ctx.fillStyle = "#4a3420"; ctx.font = "14px sans-serif";
    lines.forEach((l, i) => ctx.fillText(l, 8, 20 + i * 18));
  },
  popups(ctx, pops) {
    ctx.font = "bold 16px sans-serif";
    pops.forEach(p => { ctx.globalAlpha = Math.max(0, 1 - p.age / 12); ctx.fillStyle = p.v >= 0 ? "#1e8c1e" : "#c81e1e";
      ctx.fillText((p.v >= 0 ? "+" : "") + p.v, p.x * T + 20, p.y * T + TOP - p.age * 2); p.age++; });
    ctx.globalAlpha = 1;
  },
};

// ---------- replay player for precomputed rollouts ----------
class Replay {
  constructor(canvas, onFrame) { this.ctx = canvas.getContext("2d"); this.onFrame = onFrame; this.timer = null; }
  play(roll, opts = {}) {
    this.stop(); this.roll = roll; this.i = 0; this.pops = []; this.reward = 0; this.opts = opts;
    this.timer = setInterval(() => this.tick(), opts.ms || 110);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  tick() {
    const fr = this.roll.frames[this.i];
    if (!fr) { this.stop(); this.opts.onEnd && this.opts.onEnd(); return; }
    for (const e of fr.ev || []) {
      this.reward += e.reward;
      if (this.opts.popups && Math.abs(e.reward) >= .3) this.pops.push({x: fr.p[e.who].x, y: fr.p[e.who].y, v: e.reward, age: 0});
    }
    if (this.i) this.reward -= .005 * 2;
    const tw = this.opts.trailLen || 0;
    const trails = tw ? [[this.roll.frames.slice(Math.max(0, this.i - tw), this.i + 1).map(f => [f.p[1].x, f.p[1].y]), "#2a9d8f"],
                         [this.roll.frames.slice(Math.max(0, this.i - tw), this.i + 1).map(f => [f.p[0].x, f.p[0].y]), "#e9b824"]] : null;
    Draw.scene(this.ctx, this.roll.terrain, fr, {trails, bubble: this.opts.bubble});
    Draw.popups(this.ctx, this.pops = this.pops.filter(p => p.age < 12));
    this.onFrame && this.onFrame(fr, this);
    this.i++;
  }
}

// ---------- popups / questions ----------
const Pop = {
  card(key, then) {
    Pop.show(Lang.t(key + "_title"), Lang.t(key), null, then);
    const img = document.createElement("img");
    img.src = "assets/cards/knowledge_card_" + Pop.CARD_IMG[key] + "_v2.png";
    img.alt = Lang.t(key + "_title") + ": " + Lang.t(key);
    img.style.cssText = "display:block;width:380px;max-width:80vw;border-radius:10px";
    if (Lang.cur === "en") {
      document.getElementById("popTitle").textContent = "";
      document.getElementById("popBody").textContent = "";
      document.getElementById("owl").style.display = "none";
    }
    document.getElementById("popBody").appendChild(img);
  },
  CARD_IMG: {card1: 1, card2: 2, card3: 4, card4: 3},
  question(q) {
    const box = document.getElementById("popChoices"); box.innerHTML = "";
    const fb = document.getElementById("popFeedback");
    Lang.t(q + "_choices").forEach((c, i) => {
      const b = document.createElement("button"); b.className = "choice"; b.textContent = c;
      b.onclick = () => { fb.textContent = Lang.t(q + "_fb")[i]; };
      box.appendChild(b);
    });
    Pop.show("", Lang.t(q), true);
  },
  show(title, body, keepChoices, then) {
    if (!keepChoices) document.getElementById("popChoices").innerHTML = "";
    document.getElementById("popFeedback").textContent = "";
    document.getElementById("popTitle").textContent = title;
    document.getElementById("popBody").textContent = body;
    document.getElementById("owl").src = Assets.img.owl.src;
    document.getElementById("owl").style.display = "";
    document.getElementById("overlay").classList.remove("hidden");
    document.getElementById("popClose").onclick = () => { document.getElementById("overlay").classList.add("hidden"); then && then(); };
  },
};


// ---------- Team value card ----------
const Team = {
  async start() {
    this.rp = this.rp || new Replay(document.getElementById("c4"), fr => {
      const a = fr.p[0].intent.qmax, b = fr.p[1].intent.qmax;
      document.getElementById("teamPanel").innerHTML =
        `<h3>${Lang.t("card4_title")}</h3><p>${Lang.t("card4")}</p><div class="stats">${Lang.t("team_expl")(a, b)}</div><p class="small">${Lang.t("team_note")}</p>`;
    });
    Pop.card("card4", async () => this.rp.play(await Assets.json("greedy_ep200"), {ms: 150}));
  },
  stop() { this.rp && this.rp.stop(); },
};


// ---------- kitchen model (used by L0 tutorial and L4 contest) ----------
const Kitchen = {
  DIRS: {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]},
  new(terrain) {
    return {terrain, p: [{x: 1, y: 2, f: "up", h: null}, {x: 3, y: 1, f: "up", h: null}],
      pots: Draw.cells(terrain, "P").map(() => ({n: 0, cooking: false, ready: false, t: 0, who: new Set()})),
      counterObj: {}, soups: 0, coop: 0, bumps: 0, ev: [], cap: 3, cook: Kitchen.COOK};
  },
  COOK: 20,
  tile(k, x, y) { return (k.terrain[y] || "")[x]; },
  emit(k, type, i, x, y) { k.ev.push({type, who: i, x, y}); },
  move(k, i, dir) {
    const p = k.p[i], [dx, dy] = Kitchen.DIRS[dir], nx = p.x + dx, ny = p.y + dy, o = k.p[1 - i];
    p.f = dir;
    if (Kitchen.tile(k, nx, ny) !== " ") return false;
    if (o.x === nx && o.y === ny) { k.bumps++; Kitchen.emit(k, "bump", i, nx, ny); return false; }
    p.x = nx; p.y = ny; return true;
  },
  interact(k, i) {
    const p = k.p[i], [dx, dy] = Kitchen.DIRS[p.f], x = p.x + dx, y = p.y + dy, c = Kitchen.tile(k, x, y), key = x + "," + y;
    const ok = t => { Kitchen.emit(k, t, i, x, y); return true; };
    if (c === "O" && !p.h) { p.h = "onion"; return ok("pick_onion"); }
    if (c === "D" && !p.h) { p.h = "dish"; return ok("pick_dish"); }
    if (c === "P") {
      const pot = k.pots[Draw.cells(k.terrain, "P").findIndex(([a, b]) => a === x && b === y)];
      if (!p.h && k.manualStart && pot.n >= 1 && !pot.cooking && !pot.ready) { pot.cooking = true; pot.t = k.cook; pot.who.add(i); return ok("start_cook"); }
      if (p.h === "onion" && pot.n < k.cap && !pot.cooking && !pot.ready) {
        pot.n++; pot.who.add(i); p.h = null; if (pot.n === k.cap && !k.manualStart) { pot.cooking = true; pot.t = k.cook; } return ok("pot_onion");
      } else if (p.h === "dish" && pot.ready) { p.h = "soup"; p.soupN = pot.n; pot.who.add(i); p.soupWho = new Set(pot.who); Object.assign(pot, {n: 0, ready: false, who: new Set()}); return ok("pick_soup"); }
    } else if (c === "S" && p.h === "soup") {
      p.h = null; k.soups++; p.soupWho.add(i); if (p.soupWho.size === 2) k.coop++; return ok("serve");
    } else if (c === "X") {
      if (p.h && !k.counterObj[key]) { k.counterObj[key] = {o: p.h, who: i, soupWho: p.soupWho, soupN: p.soupN}; p.h = null; return ok("drop"); }
      else if (!p.h && k.counterObj[key]) { const it = k.counterObj[key]; p.h = it.o; if (it.who !== i) k.coop++; p.soupWho = it.soupWho; p.soupN = it.soupN; delete k.counterObj[key]; return ok("pick_" + it.o); }
    }
    Kitchen.emit(k, "wrong", i, x, y); return false;
  },
  tick(k) {
    const cells = Draw.cells(k.terrain, "P");
    k.pots.forEach((p, j) => { if (p.cooking && --p.t <= 0) { p.cooking = false; p.ready = true; Kitchen.emit(k, "ready", -1, ...cells[j]); } });
  },
  frame(k, intent) {
    return {pots: k.pots, soups: k.soups, ev: [],
      counter: Object.entries(k.counterObj).map(([s, v]) => { const [x, y] = s.split(",").map(Number); return {x, y, o: v.o}; }),
      p: k.p.map((p, i) => ({...p, intent: i ? intent : null}))};
  },
};

// Rule-based AI partner. Same sub-goal logic as rl/intent.py (incl. the fix: full/cooking pot -> dish, not onion).
const Partner = {
  candidates(k, held) {
    const need = k.pots.some(p => p.n < 3 && !p.cooking && !p.ready), coming = k.pots.some(p => p.n >= 3 || p.cooking || p.ready);
    if (held === "onion") return need ? ["pot"] : ["counter"];
    if (held === "dish") return ["soup"];
    if (held === "soup") return ["serve"];
    if (!held && k.manualStart && k.pots.some(p => p.n >= k.cap && !p.cooking && !p.ready)) return ["start"];
    const c = []; if (coming) c.push("dish"); if (need) c.push("onion");
    // pot half full: fetching a dish early is also reasonable -> two plausible jobs
    if (!coming && k.pots.some(p => p.n >= 1 && p.n < 3) && !k.p.some(p => p.h === "dish")) c.push("dish"); return c.length ? c : ["onion"];
  },
  targetTiles(k, goal) {
    const ch = {onion: "O", dish: "D", pot: "P", soup: "P", start: "P", serve: "S", counter: "X"}[goal];
    let cells = Draw.cells(k.terrain, ch);
    if (goal === "counter") cells = cells.filter(([x, y]) => !k.counterObj[x + "," + y]);
    return cells;
  },
  bfs(k, from, targets, avoid) {
    // returns [firstDir, distance, faceDir] to reach a floor cell adjacent to any target
    const key = (x, y) => x + "," + y, seen = new Set([key(from.x, from.y)]), q = [[from.x, from.y, null, 0]];
    while (q.length) {
      const [x, y, first, d] = q.shift();
      for (const [dir, [dx, dy]] of Object.entries(Kitchen.DIRS))
        if (targets.some(([tx, ty]) => tx === x + dx && ty === y + dy)) return [first, d, dir];
      for (const [dir, [dx, dy]] of Object.entries(Kitchen.DIRS)) {
        const nx = x + dx, ny = y + dy;
        if (Kitchen.tile(k, nx, ny) !== " " || seen.has(key(nx, ny)) || (avoid && avoid.x === nx && avoid.y === ny)) continue;
        seen.add(key(nx, ny)); q.push([nx, ny, first || dir, d + 1]);
      }
    }
    return [null, 99, null];
  },
  plan(k, override) {
    const me = k.p[1], kid = k.p[0];
    let c = Partner.candidates(k, me.h);
    // division of labour: don't fetch what the child is clearly already doing
    if (c.length > 1 && kid.h === "onion") c = c.filter(g => g !== "onion").concat("onion");
    if (override && c.length > 1) c = c.slice(1).concat(c[0]);
    const goal = c[0];
    const [, dFree] = Partner.bfs(k, me, Partner.targetTiles(k, goal), null);
    const [, dAvoid] = Partner.bfs(k, me, Partner.targetTiles(k, goal), kid);
    // low confidence: more than one sensible job and the child is empty-handed (ambiguous split), or child blocks the path
    const ambiguous = c.length > 1 && !kid.h, blocked = dAvoid > dFree;
    const conf = ambiguous || blocked ? 0.35 : 0.9;
    return {goal, icon: goal === "counter" ? "unsure" : goal === "start" ? "pot" : goal, conf, style: conf >= .5 ? "solid" : "dashed", alts: c.length};
  },
  act(k, plan) {
    const me = k.p[1], [first, , face] = Partner.bfs(k, me, Partner.targetTiles(k, plan.goal), k.p[0]);
    if (first) return Kitchen.move(k, 1, first);
    if (face) {
      if (me.f !== face) { me.f = face; return; }
      if (plan.goal === "soup" && !k.pots.some(p => p.ready)) return;      // wait for soup
      Kitchen.interact(k, 1);
    }
  },
};

// Interactive kitchen: 1280x720 logical canvas (CSS-scaled to the viewport), kitchen drawn at scale S.
// ---------- recipe step bar (L0 + L1) ----------
const Steps = {
  render(el, on, toggles) {
    el.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
      const d = document.createElement("div"); d.className = "step";
      const im = document.createElement("img"); im.src = `assets/ui/step${i}_${on.has(i) ? "on" : "off"}.png`; im.alt = Lang.t("steps")[i - 1];
      d.appendChild(im);
      if (toggles) {
        const b = document.createElement("img"); b.className = "starbtn"; b.dataset.step = i;
        b.src = toggles.has(i) ? "assets/ui/star_button_pressed.png" : "assets/ui/star_button.png";
        b.alt = "star " + i; d.appendChild(b);
      }
      el.appendChild(d);
    }
  },
};

// ---------- kitchen game (big 1280x720 canvas): L0 tutorial (solo) and L4 contest (with Kai) ----------
class KitchenGame {
  constructor(canvasId, opts) {
    this.c = document.getElementById(canvasId); this.ctx = this.c.getContext("2d"); this.o = opts;
    this.W = 1280; this.H = 720; this.S = 2; this.OX = 320; this.OY = 104 - TOP * 2;
    this.c.addEventListener("click", e => this.click(e));
  }
  reset() {
    this.stop(); const k = this.k = Kitchen.new(["XXPXX", "O   O", "X   X", "XDXSX"]);
    if (this.o.solo) { k.p[1].x = -9; k.p[1].y = -9; }
    if (this.o.cap) k.cap = this.o.cap; if (this.o.cook) k.cook = this.o.cook; k.manualStart = !!this.o.manualStart;
    this.timeLeft = this.o.seconds || null; this.ticks = 0; this.plan = null; this.path = null; Fx.live = [];
    this.loop();
  }
  begin() {
    this.reset();
    this.timer = setInterval(() => this.tick(), 250);
    this.walker = setInterval(() => this.walk(), 170);
    this.c.focus();
  }
  get running() { return !!this.timer; }
  loop() {
    cancelAnimationFrame(this.raf);
    const f = () => { if (App.cur !== this.o.screen) return; this.render(); this.raf = requestAnimationFrame(f); };
    this.raf = requestAnimationFrame(f);
  }
  tick() {
    const k = this.k; this.ticks++;
    Kitchen.tick(k);
    if (!this.o.solo) {
      this.plan = Partner.plan(k, false);                    // bubble icon (and the fallback controller)
      if (this.ticks % 3 === 0) {                            // Kai moves at ~1.3 steps/s (80 steps per 60 s round)
        if (this.o.useNet && this.o.useNet() && KaiNet.ready) this.netAct(); else Partner.act(k, this.plan);
      }
      this.o.wendyHook && this.o.wendyHook(k, this.ticks);   // test hook (scripted Wendy for measurements)
    }
    if (this.timeLeft !== null && this.ticks % 4 === 0) { this.timeLeft--; if (this.timeLeft <= 10 && this.timeLeft > 0) Sfx.play("tick", .7); }
    Sfx.setLoop(k.pots.some(p => p.cooking));
    this.feedback();
    if (this.timeLeft !== null && this.timeLeft <= 0) { this.stop(); this.o.onEnd && this.o.onEnd(k); }
  }
  // exact map of the web kitchen to an overcooked OvercookedState (cramped_room), see web/kai.js
  ocState() {
    const k = this.k, O = {up: 0, down: 1, right: 2, left: 3}, objects = [];
    Draw.cells(k.terrain, "P").forEach(([x, y], j) => { const p = k.pots[j];
      if (p.n) objects.push({name: "soup", x, y, n: p.n, idle: !p.cooking && !p.ready, ready: p.ready, rem: p.cooking ? Math.ceil(p.t / 3) : 0}); });
    for (const [s, v] of Object.entries(k.counterObj)) { const [x, y] = s.split(",").map(Number);
      objects.push(v.o === "soup" ? {name: "soup", x, y, n: v.soupN || 3, idle: false, ready: true, rem: 0} : {name: v.o, x, y}); }
    return {p: k.p.map(p => ({x: p.x, y: p.y, o: O[p.f], h: p.h, n: p.h === "soup" ? (p.soupN || 3) : undefined})), objects};
  }
  netAct() {
    const r = KaiNet.act(this.ocState(), 1); this.lastQ = r.q;
    if (r.action === "interact") Kitchen.interact(this.k, 1);
    else if (r.action !== "stay") Kitchen.move(this.k, 1, r.action);
  }
  feedback() {
    const k = this.k, C = (x, y) => [x * T + T / 2, y * T + TOP + T / 2];
    for (const e of k.ev.splice(0)) {
      const p = e.who >= 0 ? k.p[e.who] : null, head = p ? [p.x * T + T / 2, (p._top || p.y * T + TOP) - 6] : null;
      const [cx, cy] = C(e.x, e.y);
      if (e.type === "pick_onion") { Fx.spawn("hud_pickup_onion", ...head, 44, 20, {rise: 20}); Sfx.play("pickup"); }
      else if (e.type === "pick_dish" || e.type === "pick_soup") { Fx.spawn("hud_pickup_dish", ...head, 44, 20, {rise: 20}); Sfx.play("clink"); }
      else if (e.type === "start_cook") { Fx.spawn("hud_splash", cx, cy, 72, 24); Sfx.play("plop", .6); }
      else if (e.type === "pot_onion") { Fx.spawn("hud_splash", cx, cy, 72, 24); Sfx.play("plop"); }
      else if (e.type === "ready") Sfx.play("ding");
      else if (e.type === "serve") { Fx.spawn("star_coin_fly", cx, cy - 40, 200, 24); Sfx.play("serve"); }
      else if (e.type === "drop") Sfx.play("pickup", .5);
      else if (e.type === "bump") Fx.spawn(e.who ? "kai_confused" : "wendy_confused", ...head, 48, 24);
      else if (e.type === "wrong" && e.who === 0) { Fx.spawn("wrong_x", cx, cy, 44); Sfx.play("wrong"); }
      this.o.onEvent && this.o.onEvent(e, k);
    }
  }
  render() {
    const k = this.k, ctx = this.ctx; if (!k) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff8ec"; ctx.fillRect(0, 0, this.W, this.H);
    ctx.setTransform(this.S, 0, 0, this.S, this.OX, this.OY);
    const fr = Kitchen.frame(k, this.plan); if (this.o.solo) fr.p = fr.p.slice(0, 1);
    Draw.scene(ctx, k.terrain, fr, {bubble: !!this.plan});
    k.p.forEach((p, i) => { const img = Assets.img[(i ? "partner_" : "player_") + p.f], w = Math.min(T, img.naturalWidth || T);
      p._top = p.y * T + TOP + T - (img.naturalHeight || T) * w / (img.naturalWidth || T); });
    Draw.cells(k.terrain, "P").forEach(([x, y], j) => {
      const pot = k.pots[j];
      if (k.manualStart && pot.n >= 1 && !pot.cooking && !pot.ready) { ctx.fillStyle = "#c0661a"; ctx.font = "bold 10px sans-serif"; ctx.fillText("▶ " + Lang.t("start_cook"), x * T + 2, y * T + TOP + 12); }
      if (!pot.cooking && !pot.ready) return;
      const i = pot.ready ? 39 : Math.min(38, Math.floor((1 - pot.t / k.cook) * 39));
      ctx.drawImage(Fx.frames.hud_cook_ring[i], x * T + T - 26, y * T + TOP + 2, 24, 24);
    });
    if (this.path && this.path.goal) { const [gx, gy] = this.path.goal; ctx.strokeStyle = "#e9b824"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.strokeRect(gx * T + 3, gy * T + TOP + 3, T - 6, T - 6); ctx.setLineDash([]); }
    Fx.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.timeLeft !== null) { const tim = Fx.timer[Math.max(0, Math.min(60, this.timeLeft))]; if (tim) ctx.drawImage(tim, this.W - 300, 24, 270, 96); }
    ctx.fillStyle = "#4a3420"; ctx.font = "bold 34px sans-serif"; ctx.fillText(`${Lang.t("soups")}: ${k.soups}`, 36, 70);
    ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
    k.p.forEach((p, i) => { if (this.o.solo && i) return; ctx.fillStyle = i ? "#2a7d72" : "#b8860b";
      ctx.fillText(i ? "Kai" : "Wendy", this.OX + (p.x * T + T / 2) * this.S, this.OY + ((p.y + 1) * T + TOP) * this.S - 4); });
    ctx.textAlign = "left";
  }
  key(e) {
    if (!this.timer) return;
    const m = {ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right",
               W: "up", S: "down", A: "left", D: "right"}[e.key];
    if (m) { this.path = null; Kitchen.move(this.k, 0, m); e.preventDefault(); }
    else if (e.key === " ") { this.path = null; Kitchen.interact(this.k, 0); e.preventDefault(); }
    else return;
    this.feedback();
  }
  // click a tile -> BFS walk; if it's a station/counter, face it and interact on arrival
  click(e) {
    if (!this.timer) return;
    const r = this.c.getBoundingClientRect();
    const lx = (e.clientX - r.left) * this.W / r.width, ly = (e.clientY - r.top) * this.H / r.height;
    const gx = Math.floor((lx - this.OX) / this.S / T), gy = Math.floor(((ly - this.OY) / this.S - TOP) / T);
    const t = Kitchen.tile(this.k, gx, gy); if (t === undefined) return;
    const me = this.k.p[0], key = (x, y) => x + "," + y, prev = {[key(me.x, me.y)]: null}, q = [[me.x, me.y]], station = t !== " ";
    let end = null;
    while (q.length) {
      const [x, y] = q.shift();
      if (station ? Math.abs(x - gx) + Math.abs(y - gy) === 1 : (x === gx && y === gy)) { end = [x, y]; break; }
      for (const [dx, dy] of Object.values(Kitchen.DIRS)) {
        const nx = x + dx, ny = y + dy, o = this.k.p[1];
        if (Kitchen.tile(this.k, nx, ny) !== " " || key(nx, ny) in prev || (o.x === nx && o.y === ny)) continue;
        prev[key(nx, ny)] = [x, y]; q.push([nx, ny]);
      }
    }
    if (!end) { Fx.spawn("wrong_x", gx * T + T / 2, gy * T + TOP + T / 2, 44); Sfx.play("wrong"); return; }
    const dirOf = (a, b) => Object.keys(Kitchen.DIRS).find(d => Kitchen.DIRS[d][0] === b[0] - a[0] && Kitchen.DIRS[d][1] === b[1] - a[1]);
    const steps = []; let cur = end;
    while (prev[key(...cur)]) { const p = prev[key(...cur)]; steps.unshift(dirOf(p, cur)); cur = p; }
    if (station) steps.push(dirOf(end, [gx, gy]), "act");
    this.path = {steps, goal: [gx, gy]};
  }
  walk() {
    if (!this.path || !this.timer) return;
    const s = this.path.steps.shift();
    if (s === undefined) { this.path = null; return; }
    if (s === "act") { Kitchen.interact(this.k, 0); this.path = null; }
    else if (this.path.steps.length === 1 && this.path.steps[0] === "act") this.k.p[0].f = s;
    else if (!Kitchen.move(this.k, 0, s)) this.path = null;
    this.feedback();
  }
  stop() { clearInterval(this.timer); clearInterval(this.walker); this.timer = null; this.path = null; Sfx.setLoop(false); }
}

const Next = (id, to) => { const b = document.getElementById(id); b.disabled = false; b.onclick = () => { Progress.done(to); App.go(to); }; };

// ---------- L0: become a Soup Master (solo tutorial, 1 onion, short cook) ----------
const L0 = {
  STEP_OF: {pick_onion: 1, pot_onion: 2, ready: 3, pick_dish: 4, serve: 5},
  start() {
    this.g = this.g || new KitchenGame("c0", {screen: "l0", solo: true, cap: 1, cook: 12, onEvent: e => this.ev(e)});
    this.on = new Set(); Steps.render(document.getElementById("l0steps"), this.on);
    document.getElementById("l0next").disabled = true; document.getElementById("l0teach").classList.add("hidden");
    Music.play("bgm_kitchen_loop", .35);
    this.g.begin();
    Voice.play(["dingo_L0_01", "dingo_L0_02"]);
  },
  ev(e) {
    const s = this.STEP_OF[e.type]; if (!s || e.who === 0 && this.on.has(s) || (e.type !== "ready" && e.who !== 0)) return;
    if (s !== this.on.size + 1) return;                    // only the next step in order lights up
    this.on.add(s); Steps.render(document.getElementById("l0steps"), this.on);
    const say = {1: "dingo_L0_03", 2: "dingo_L0_04", 3: "dingo_L0_05", 4: "dingo_L0_06"}[s];
    if (say) Voice.play([say]);
    if (s === 5) this.finish();
  },
  async finish() {
    this.g.stop(); Music.jingle("jingle_success");
    for (let i = 0; i < 6; i++) Fx.spawn("star_coin_fly", 60 + i * 40, 60 + (i % 2) * 120, 160, 24);
    await Voice.play(["dingo_L0_07"]);
    if (App.cur !== "l0") return;
    Theatre.show("intro", () => {
      Voice.play(["dingo_L0_10"]);
      const b = document.getElementById("l0teach"); b.classList.remove("hidden");
      b.onclick = () => { Progress.done("l1"); App.go("l1"); };
      Next("l0next", "l1");
    });
  },
  stop() { this.g && this.g.stop(); },
  key(e) { this.g && this.g.key(e); },
};

// ---------- L1: you give the stars (reward presets, really trained, seed 7) ----------
const L1 = {
  PRESET_TXT: {soup_shaped: "all", soup_only: "serve", pot_only: "pot", onion_only: "onion"},
  start() {
    this.sel = new Set(); this.tries = 0; this.rp = this.rp || new Replay(document.getElementById("c1"), (fr, r) => this.frame(fr));
    document.getElementById("l1next").disabled = true; this.draw(); this.msg("");
    Music.play("bgm_kitchen_loop", .3);
    const go = () => Pop.card("card1", () => Voice.play(["dingo_L1_01"]));
    Theatre.seen.l1 ? go() : Theatre.show("l1", go);
  },
  draw() {
    const el = document.getElementById("l1steps"); Steps.render(el, this.lit || new Set(), this.sel);
    el.querySelectorAll(".starbtn").forEach(b => b.onclick = () => {
      const s = +b.dataset.step; this.sel.has(s) ? this.sel.delete(s) : this.sel.add(s); Sfx.play("pickup", .6); this.draw(); });
    document.getElementById("l1tries").textContent = Lang.t("tries")(this.tries, 3);
  },
  msg(t) { document.getElementById("l1msg").textContent = t; },
  // which really-trained preset matches the chosen stars (untrained combos map to the closest one, and we say so)
  preset(sel) {
    const has = s => sel.has(s), only = s => sel.size === 1 && has(s);
    if (only(5)) return ["soup_only", true];
    if (has(5)) return ["soup_shaped", sel.size >= 4];
    if (only(1)) return ["onion_only", true];
    if (only(2)) return ["pot_only", true];
    return [has(2) ? "pot_only" : "onion_only", false];
  },
  async train() {
    if (!this.sel.size) return this.msg(Lang.t("pick_one"));
    if (this.tries === 0 && this.sel.size > 1) return this.msg(Lang.t("first_one"));
    if (this.tries >= 3) return;
    this.tries++; this.draw();
    const [name, exact] = this.preset(this.sel), roll = await Assets.json("presets/" + name);
    const sum = (await Assets.json("presets/summary"));
    const seeds = Object.values(sum).filter(r => r.preset === name).map(r => r.final_eval_soups);
    const s7 = sum[name + "_s7"];
    this.msg((exact ? "" : Lang.t("closest") + " ") + Lang.t("preset_" + name) + "  ·  " + Lang.t("seeds")(seeds) + "  ·  " + Lang.t("replay_note")(roll.soups, s7.final_eval_soups));
    this.lit = new Set(); this.name = name;
    if (name === "onion_only") Voice.play(["wendy_L1_02", "kai_L1_03"]);
    if (name === "soup_only") Voice.play(["kai_L1_04"]);
    this.rp.play(roll, {popups: true, ms: this.ms || 45, onEnd: () => this.end(roll)});
  },
  frame(fr) {
    const K = {useful_onion_pickup: 1, onion_pickup: 1, potting_onion: 2, useful_dish_pickup: 4, dish_pickup: 4, soup_delivery: 5};
    let ch = false;
    for (const e of fr.ev || []) if (K[e.kind] && !this.lit.has(K[e.kind])) { this.lit.add(K[e.kind]); ch = true; }
    if (fr.pots.some(p => p.cooking || p.ready) && !this.lit.has(3)) { this.lit.add(3); ch = true; }
    if (ch) this.draw();
    document.getElementById("l1stats").textContent = Lang.t("bowls_400")(fr.soups);
  },
  end(roll) {
    const v = {soup_only: ["dingo_L1_05"], soup_shaped: ["wendy_L1_06", "dingo_L1_07"], pot_only: ["dingo_L1_07"]}[this.name];
    if (v) Voice.play(v);
    Next("l1next", "l2");
  },
  stop() { this.rp && this.rp.stop(); },
};

// ---------- L2: curiosity (epsilon presets) ----------
const L2 = {
  band(eps) { return eps < .1 ? "eps_low" : eps <= .6 ? "eps_default" : "eps_high"; },
  start() {
    this.rp = this.rp || new Replay(document.getElementById("c2"), fr => {
      document.getElementById("l2stats").textContent = Lang.t("bowls_400")(fr.soups); });
    document.getElementById("l2next").disabled = true;
    Music.play("bgm_kitchen_loop", .3); this.knob();
    const go = () => Pop.card("card2", () => Voice.play(["wendy_L2_01", "kai_L2_02", "dingo_L2_03"]));
    Theatre.seen.l2 ? go() : Theatre.show("l2", go);
  },
  knob() {
    const v = +document.getElementById("eps").value / 100;
    document.getElementById("dial").style.transform = `rotate(${-120 + 240 * v}deg)`;
    document.getElementById("epsLabel").textContent = Lang.t("band_" + this.band(v))(v);
  },
  async train() {
    const b = this.band(+document.getElementById("eps").value / 100);
    // high curiosity shows the wandering DURING training (eps 0.8 rollout of the eps_high model)
    const roll = await Assets.json("presets/" + (b === "eps_high" ? "eps_high_train" : b));
    Voice.play({eps_low: ["kai_L2_05", "dingo_L2_06"], eps_default: ["dingo_L2_07"], eps_high: ["wendy_L2_04"]}[b]);
    this.rp.play(roll, {ms: this.ms || 45, trailLen: document.getElementById("trail").checked ? 12 : 0, onEnd: () => Next("l2next", "l3")});
  },
  stop() { this.rp && this.rp.stop(); },
};

// ---------- L3: confidence (child rates 1-5, then Wendy and Kai's real confidence from the trained net) ----------
const L3 = {
  start() {
    this.rp = this.rp || new Replay(document.getElementById("c3"), fr => {
      document.getElementById("l3stats").textContent = `${Lang.t("soups")}: ${fr.soups}`; });
    this.child = null; document.getElementById("l3next").disabled = true;
    document.getElementById("l3result").textContent = ""; this.bars({});
    document.querySelectorAll("#rate button").forEach(b => { b.disabled = false; b.classList.remove("on"); b.onclick = () => this.rate(+b.dataset.v, b); });
    Music.play("bgm_kitchen_loop", .3);
    const go = () => Pop.card("card3", () => Voice.play(["dingo_L3_01"]));
    Theatre.seen.l3 ? go() : Theatre.show("l3", go);
  },
  // softmax-max probability per step, averaged over the round, mapped from [1/6, 1] onto 1..5
  score(roll, i) {
    const cs = roll.frames.map(f => f.p[i].intent && f.p[i].intent.conf).filter(c => c != null);
    const m = cs.reduce((a, b) => a + b, 0) / cs.length;
    return {raw: m, s: Math.max(1, Math.min(5, Math.round(1 + 4 * (m - 1 / 6) / (5 / 6))))};
  },
  bars(v) {
    const row = (who, val, col) => `<div class="cbar"><span>${who}</span><div class="track">${[1, 2, 3, 4, 5].map(n =>
      `<i style="background:${val && n <= val ? col : "#eee"}"></i>`).join("")}</div><b>${val || "–"}</b></div>`;
    document.getElementById("confBars").innerHTML = row(Lang.t("you"), v.you, "#e9a94b") + row("Wendy", v.wendy, "#e9c84b") + row("Kai", v.kai, "#2a9d8f");
  },
  async rate(v, btn) {
    this.child = v; btn.classList.add("on"); document.querySelectorAll("#rate button").forEach(b => b.disabled = true);
    const roll = await Assets.json("presets/soup_shaped");
    const w = this.score(roll, 0), k = this.score(roll, 1);
    this.result = {you: v, wendy: w.s, kai: k.s, wendyRaw: w.raw, kaiRaw: k.raw};
    const shown = {you: v}; this.bars(shown);
    await Voice.play(["dingo_L3_02"]);
    shown.wendy = w.s; this.bars(shown); await Voice.play(["wendy_L3_03"]);
    shown.kai = k.s; this.bars(shown); await Voice.play(["kai_L3_04"]);
    // a 60 s round: the 400-step trained rollout played at 150 ms/step
    this.rp.play(roll, {ms: this.ms || 150, onEnd: () => {
      this.result.soups = roll.soups; App.state.l3 = this.result;
      document.getElementById("l3result").textContent = Lang.t("l3_reveal")(roll.soups);
      Pop.question("q3"); Next("l3next", "l4");
    }});
  },
  stop() { this.rp && this.rp.stop(); },
};

// ---------- L4: soup contest. Child plays Wendy, Kai is the AI partner. 60 s; win >= 2 bowls, 1 = partial ----------
const L4 = {
  WIN: 2,
  useNet: !/[?&]kai=rule/.test(location.search),   // trained Kai (web/kai.js); ?kai=rule -> rule planner fallback        // from web/data/l4_threshold.json (trained Kai+Wendy: 2 bowls in 80 partner steps = 60 s)
  // end-screen art: text-free frame folders; title / bowls / stars are drawn on top
  // one mp4 per end screen (one request, no burst of frame requests)
  END_ART: {success: {video: "assets/anim/end_success_bg.mp4", loop: true, still: "assets/ui/end_success_bg.png"},
            fail: {video: "assets/anim/end_fail_bg.mp4", loop: false, still: "assets/ui/end_fail_bg.png"}},
  // voice ids come from the manifest (level L4, by note/order), not hardcoded numbers
  lines() {
    const m = Object.entries(Voice.lines).filter(([, l]) => l.level === "L4").sort((a, b) => a[1].index - b[1].index);
    const of = tag => m.filter(([, l]) => (l.note || "").startsWith(tag)).map(([id]) => id);
    const ok = of("成功");
    return {failNum: n => ["fail_a", n <= 5 ? "num_" + n : {say: String(n)}, n === 1 ? "word_bowl" : "word_bowls", "fail_c"],
            intro: m.filter(([, l]) => !(l.note || "").match(/^(成功|失败)/) || l.note.includes("开场")).map(([id]) => id),
            win: ok.filter(id => !/_[ab]$/.test(id)), a: ok.find(id => /_a$/.test(id)), b: ok.find(id => /_b$/.test(id)), fail: of("失败")};
  },
  start() {
    this.g = this.g || new KitchenGame("c4k", {screen: "l4", seconds: 60, onEnd: k => this.end(k),
      cap: 3, cook: 60, manualStart: true, useNet: () => this.useNet});
    document.getElementById("endScreen").classList.add("hidden"); document.getElementById("l4next").disabled = true;
    this.g.reset(); Music.play("bgm_kitchen_loop", .35);
    document.getElementById("l4start").onclick = () => this.begin();
    Voice.play(this.lines().intro.slice(0, 1));
  },
  begin() {
    document.getElementById("endScreen").classList.add("hidden");
    this.g.begin(); const L = this.lines(); Voice.play(L.intro.slice(1));
  },
  numberItems(n) {
    const L = this.lines();
    return [L.a, n <= 5 ? "num_" + n : {say: String(n)}, n === 1 ? "single_b" : L.b];
  },
  async end(k) {
    const n = k.soups, win = n >= this.WIN; App.state.l4 = {soups: n, win};
    Music.stop(); Music.jingle(win ? "jingle_success" : "jingle_fail");
    this.showEnd(win, n);
    const L = this.lines();
    // fail: "You made" N "bowl(s)". "Two bowls wins. You're so close!" then the manifest's fail lines (last = "Close! Want another round?")
    await Voice.play(win ? [...L.win, ...this.numberItems(n)] : [...L.fail.slice(0, -1), ...L.failNum(n), ...L.fail.slice(-1)]);
    Music.play("bgm_story_loop", .3);
    Next("l4next", "final");
  },
  showEnd(win, n) {
    const art = this.END_ART[win ? "success" : "fail"], el = document.getElementById("endScreen"), c = document.getElementById("endCanvas");
    el.classList.remove("hidden"); const ctx = c.getContext("2d");
    if (this.vid) { this.vid.pause(); this.vid.removeAttribute("src"); this.vid.load(); }
    const vid = this.vid = document.createElement("video");
    Object.assign(vid, {muted: true, playsInline: true, loop: art.loop, preload: "auto", src: art.video});
    vid.play().catch(() => {});
    const still = new Image(); still.src = art.still;
    const coin = Assets.img.star_coin, t0 = performance.now();
    const title = Lang.t(win ? "end_win" : "end_fail"), sub = Lang.t(win ? "end_win_sub" : "end_fail_sub")(n);
    const draw = () => {
      if (el.classList.contains("hidden")) return;
      ctx.fillStyle = "#fff8ec"; ctx.fillRect(0, 0, 1280, 720);
      if (vid.readyState >= 2) ctx.drawImage(vid, 0, 0, 1280, 720);
      else if (still.complete && still.naturalWidth) ctx.drawImage(still, 0, 0, 1280, 720);
      ctx.textAlign = "center"; ctx.fillStyle = win ? "#c0661a" : "#56709a"; ctx.font = "bold 84px sans-serif"; ctx.fillText(title, 640, 120);
      ctx.fillStyle = "#4a3420"; ctx.font = "bold 38px sans-serif"; ctx.fillText(sub, 640, 182);
      const stars = 3, got = Math.min(n, stars);
      for (let s = 0; s < stars; s++) { ctx.globalAlpha = s < got ? 1 : .25; ctx.drawImage(coin, 640 + (s - 1) * 150 - 45, 210, 90, 90); }
      ctx.globalAlpha = 1; ctx.textAlign = "left";
      requestAnimationFrame(draw);
    };
    draw();
    document.getElementById("again").onclick = () => this.begin();
  },
  stop() { this.g && this.g.stop(); },
  key(e) { this.g && this.g.key(e); },
};

// ---------- final recap: confidence vs. reality, 4 knowledge cards ----------
const Final = {
  start() {
    Music.play("bgm_story_loop", .3);
    const s = App.state, l3 = s.l3 || {}, l4 = s.l4 || {};
    const v = x => x == null ? "–" : x;
    document.getElementById("finalTable").innerHTML = `<tr><th></th><th>${Lang.t("confidence")}</th><th>${Lang.t("actual")}</th></tr>
      <tr><td>${Lang.t("you")}</td><td>${v(l3.you)}/5</td><td rowspan="3">L3: ${v(l3.soups)} ${Lang.t("bowls")} / 400<br>L4: ${v(l4.soups)} ${Lang.t("bowls")} / 60 s</td></tr>
      <tr><td>Wendy</td><td>${v(l3.wendy)}/5</td></tr><tr><td>Kai</td><td>${v(l3.kai)}/5</td></tr>`;
    Pop.card("card4");
  },
};

// ---------- progress (linear) ----------
const Progress = {
  ORDER: ["l0", "l1", "l2", "l3", "l4", "final"],
  max() { return +(localStorage.getItem("progress") || 0); },
  done(id) { const i = this.ORDER.indexOf(id); if (i > this.max()) localStorage.setItem("progress", i); this.paint(); },
  paint() {
    const m = this.max(), cur = this.ORDER.indexOf(App.cur);
    document.querySelectorAll("[data-go]").forEach(b => { const i = this.ORDER.indexOf(b.dataset.go); if (i > 0 && b.closest(".levels")) b.disabled = i > m; });
    document.getElementById("menuProgress").innerHTML = document.getElementById("progress").innerHTML = this.ORDER.map((id, i) =>
      `<span class="dot ${i <= m ? "done" : ""} ${i === cur ? "cur" : ""}">${id === "final" ? "★" : i}</span>`).join("");
  },
};

// ---------- app shell ----------
const App = {
  cur: "menu", state: {},
  LEVELS: {l0: L0, l1: L1, l2: L2, l3: L3, l4: L4, team: Team, final: Final},
  go(id) {
    Object.values(this.LEVELS).forEach(l => l.stop && l.stop()); Voice.stop();
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("on", s.id === id));
    this.cur = id; Progress.paint();
    if (id === "menu") { Music.play("bgm_story_loop", .3); this.homeLevels(this.seenLevels); }
    document.body.classList.toggle("onHome", id === "menu" && !this.seenLevels);
    (this.LEVELS[id] || {start() {}}).start();
  },
  refresh() { Progress.paint(); },
  // home has two states: title + Start (matches the opening's last frame), then the level card
  homeLevels(on) {
    this.seenLevels = !!on; document.getElementById("menu").classList.toggle("levelsOn", !!on);
    document.getElementById(on ? "levelsDingoSlot" : "homeDingoSlot").appendChild(document.getElementById("menuDingo"));
    document.body.classList.toggle("onHome", this.cur === "menu" && !on);
  },
  async init() {
    await Promise.all([Assets.load(), Fx.load(), Sfx.load(), Voice.load()]);
    KaiNet.load(await Assets.json("kai_net"));
    Assets.img.star_coin = Object.assign(new Image(), {src: "assets/ui/star_coin.png"});
    document.getElementById("muteBtn").onclick = () => Sfx.toggle(); document.getElementById("muteBtn").textContent = Sfx.muted ? "🔇" : "🔊";
    document.getElementById("musicBtn").onclick = () => Music.toggle(); Music.paint();
    document.querySelectorAll("[data-theatre]").forEach(b => b.onclick = () => Theatre.show(b.dataset.theatre));
    document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => this.go(b.dataset.go));
    document.querySelectorAll("[data-q]").forEach(b => b.onclick = () => Pop.question(b.dataset.q));
    document.querySelectorAll("[data-fs]").forEach(b => b.onclick = () => {
      const w = document.getElementById(b.dataset.fs); document.fullscreenElement ? document.exitFullscreen() : (w.requestFullscreen && w.requestFullscreen()); });
    document.getElementById("langBtn").onclick = () => { Lang.cur = Lang.cur === "zh" ? "en" : "zh"; Lang.apply(); };
    document.getElementById("l1train").onclick = () => L1.train();
    document.getElementById("eps").oninput = () => L2.knob();
    document.getElementById("l2train").onclick = () => L2.train();
    window.addEventListener("keydown", e => { if (App.cur === "l0") L0.key(e); if (App.cur === "l4") L4.key(e); });
    const di = ART.DINGO_IDLE, dEl = document.getElementById("menuDingoImg");
    dEl.style.setProperty("--sheet", `url(${di.sheet})`); dEl.style.setProperty("--still", `url(${di.still})`);
    dEl.style.setProperty("--n", di.frames); dEl.style.setProperty("--dur", di.frames / di.fps + "s");
    document.getElementById("homeStart").onclick = () => this.homeLevels(true);
    Lang.apply(); this.go("menu");
    // the opening plays first; the menu shows once it ends or is skipped
    Theatre.boot();
  },
};
App.init();
