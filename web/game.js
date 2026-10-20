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
    if (o.bubble !== false && fr.p[1].intent) Draw.bubble(ctx, fr.p[1], fr.p[1].intent);
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
    Pop.show("🦉", Lang.t(q), true);
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

// ---------- Level 1: reward ----------
const L1 = {
  async start() {
    this.rp = this.rp || new Replay(document.getElementById("c1"), (fr, r) => this.stats(fr, r));
    Pop.card("card1", () => this.run());
  },
  async run() {
    const soup = document.getElementById("soupReward").value;
    const roll = await Assets.json(soup === "0" ? "nosoup_ep100" : "full_ep100");
    this.rp.play(roll, {popups: true, ms: 90});
  },
  stats(fr, r) {
    const ev = Lang.t("ev"), soup = document.getElementById("soupReward").value;
    const table = Object.entries(REWARD_W).map(([k, v]) => `${ev[k]}: ${k === "soup_delivery" ? soup : v}`).join("\n");
    document.getElementById("l1stats").textContent =
      `${Lang.t("soups")}: ${fr.soups}   ${Lang.t("rewards")}: ${r.reward.toFixed(1)}\n\n${table}\n${Lang.t("step_penalty")}`;
  },
  stop() { this.rp && this.rp.stop(); },
};

// ---------- Level 2: exploration ----------
const L2 = {
  async start() {
    this.rp = this.rp || new Replay(document.getElementById("c2"), fr => {
      document.getElementById("l2stats").textContent = `${Lang.t("soups")}: ${fr.soups}`;
    });
    Pop.card("card2", () => this.run());
  },
  async run() {
    const ep = STAGES[+document.getElementById("stage").value];
    const roll = await Assets.json("stage_ep" + ep);
    document.getElementById("stageLabel").textContent = Lang.t("stage")(ep, roll.eps);
    this.rp.play(roll, {trailLen: document.getElementById("trail").checked ? 40 : 0, ms: 80});
  },
  stop() { this.rp && this.rp.stop(); },
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

// ---------- Level 3: cooperation (interactive kitchen) ----------
const Kitchen = {
  DIRS: {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]},
  new(terrain) {
    return {terrain, p: [{x: 1, y: 2, f: "up", h: null}, {x: 3, y: 1, f: "up", h: null}],
      pots: Draw.cells(terrain, "P").map(() => ({n: 0, cooking: false, ready: false, t: 0, who: new Set()})),
      counterObj: {}, soups: 0, coop: 0, bumps: 0};
  },
  tile(k, x, y) { return (k.terrain[y] || "")[x]; },
  move(k, i, dir) {
    const p = k.p[i], [dx, dy] = Kitchen.DIRS[dir], nx = p.x + dx, ny = p.y + dy, o = k.p[1 - i];
    p.f = dir;
    if (Kitchen.tile(k, nx, ny) !== " ") return;
    if (o.x === nx && o.y === ny) { k.bumps++; return; }
    p.x = nx; p.y = ny;
  },
  interact(k, i) {
    const p = k.p[i], [dx, dy] = Kitchen.DIRS[p.f], x = p.x + dx, y = p.y + dy, c = Kitchen.tile(k, x, y), key = x + "," + y;
    if (c === "O" && !p.h) p.h = "onion";
    else if (c === "D" && !p.h) p.h = "dish";
    else if (c === "P") {
      const pot = k.pots[Draw.cells(k.terrain, "P").findIndex(([a, b]) => a === x && b === y)];
      if (p.h === "onion" && pot.n < 3 && !pot.cooking && !pot.ready) {
        pot.n++; pot.who.add(i); p.h = null; if (pot.n === 3) { pot.cooking = true; pot.t = 20; }
      } else if (p.h === "dish" && pot.ready) { p.h = "soup"; pot.who.add(i); p.soupWho = new Set(pot.who); Object.assign(pot, {n: 0, ready: false, who: new Set()}); }
    } else if (c === "S" && p.h === "soup") {
      p.h = null; k.soups++; p.soupWho.add(i); if (p.soupWho.size === 2) k.coop++;
    } else if (c === "X") {
      if (p.h && !k.counterObj[key]) { k.counterObj[key] = {o: p.h, who: i, soupWho: p.soupWho}; p.h = null; }
      else if (!p.h && k.counterObj[key]) { const it = k.counterObj[key]; p.h = it.o; if (it.who !== i) k.coop++; p.soupWho = it.soupWho; delete k.counterObj[key]; }
    }
  },
  tick(k) { k.pots.forEach(p => { if (p.cooking && --p.t <= 0) { p.cooking = false; p.ready = true; } }); },
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
    const c = []; if (coming) c.push("dish"); if (need) c.push("onion");
    // pot half full: fetching a dish early is also reasonable -> two plausible jobs
    if (!coming && k.pots.some(p => p.n >= 1 && p.n < 3) && !k.p.some(p => p.h === "dish")) c.push("dish"); return c.length ? c : ["onion"];
  },
  targetTiles(k, goal) {
    const ch = {onion: "O", dish: "D", pot: "P", soup: "P", serve: "S", counter: "X"}[goal];
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
    return {goal, icon: goal === "counter" ? "unsure" : goal, conf, style: conf >= .5 ? "solid" : "dashed", alts: c.length};
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

const L3 = {
  rounds: [], questioned: 0,
  start() {
    this.ctx = document.getElementById("c3").getContext("2d");
    Pop.card("card3", () => this.idle());
  },
  idle() {
    this.k = Kitchen.new(["XXPXX", "O   O", "X   X", "XDXSX"]);
    Draw.scene(this.ctx, this.k.terrain, Kitchen.frame(this.k, null), {bubble: false});
  },
  begin() {
    this.stop(); this.k = Kitchen.new(["XXPXX", "O   O", "X   X", "XDXSX"]);
    this.bubbleOn = document.getElementById("bubbleOn").checked;
    this.timeLeft = 60; this.ticks = 0; this.override = false; this.prompted = null; this.questionedRound = 0;
    this.timer = setInterval(() => this.tick(), 250);
    document.getElementById("c3").focus();
  },
  tick() {
    const k = this.k; this.ticks++;
    Kitchen.tick(k);
    const plan = Partner.plan(k, this.override);
    if (plan.goal !== this.lastGoal) { this.override = false; this.prompted = null; }
    this.lastGoal = plan.goal;
    this.bubbleOn = document.getElementById("bubbleOn").checked;
    const box = document.getElementById("unsureBox");
    if (this.bubbleOn && plan.style === "dashed" && this.prompted !== plan.goal) { box.classList.remove("hidden"); this.prompted = plan.goal; }
    if (plan.style !== "dashed") box.classList.add("hidden");
    if (this.ticks % 3 === 0) Partner.act(k, plan);       // partner moves at ~1.3 steps/s
    this.plan = plan;
    if (this.ticks % 4 === 0) this.timeLeft--;
    this.render();
    if (this.timeLeft <= 0) this.end();
  },
  render() {
    const k = this.k;
    Draw.scene(this.ctx, k.terrain, Kitchen.frame(k, this.plan), {bubble: this.bubbleOn});
    Draw.hud(this.ctx, [`${Lang.t("time")}: ${this.timeLeft}s   ${Lang.t("soups")}: ${k.soups}`]);
    document.getElementById("l3stats").textContent =
      `${Lang.t("recap_coop")}: ${k.coop}\n${Lang.t("recap_bumps")}: ${k.bumps}\n${Lang.t("recap_questioned")}: ${this.questionedRound}`;
  },
  key(e) {
    if (!this.timer) return;
    const m = {ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"}[e.key];
    if (m) { Kitchen.move(this.k, 0, m); e.preventDefault(); }
    else if (e.key === " ") { Kitchen.interact(this.k, 0); e.preventDefault(); }
    else return;
    this.render();
  },
  agree() { document.getElementById("unsureBox").classList.add("hidden"); },
  disagree() { this.override = true; this.questioned++; this.questionedRound++; document.getElementById("unsureBox").classList.add("hidden"); },
  end() {
    this.stop();
    const k = this.k;
    this.rounds.push({bubble: this.bubbleOn, soups: k.soups, coop: k.coop, bumps: k.bumps, q: this.questionedRound});
    Recap.show(this.rounds);
  },
  stop() { clearInterval(this.timer); this.timer = null; document.getElementById("unsureBox").classList.add("hidden"); },
};

// ---------- recap (real counts from the rounds played in L3) ----------
const Recap = {
  show(rounds) {
    const sum = f => rounds.reduce((a, r) => a + r[f], 0);
    document.getElementById("r_soups").textContent = sum("soups");
    document.getElementById("r_coop").textContent = sum("coop");
    document.getElementById("r_bumps").textContent = sum("bumps");
    document.getElementById("r_q").textContent = sum("q");
    const avg = on => { const rs = rounds.filter(r => r.bubble === on); return rs.length ? rs.reduce((a, r) => a + r.soups, 0) / rs.length : null; };
    const bar = (lab, v, col) => `<div class="bar"><div>${v === null ? "–" : v.toFixed(1)}</div><div style="height:${(v || 0) * 20 + 2}px;background:${col}"></div><div>${lab}</div></div>`;
    document.getElementById("bars").innerHTML = bar(Lang.t("bubble_on"), avg(true), "#e9a94b") + bar(Lang.t("bubble_off"), avg(false), "#8aa7d6");
    App.go("recap");
  },
};

// ---------- app shell ----------
const App = {
  cur: "menu",
  go(id) {
    [L1, L2, L3, Team].forEach(l => l.stop && l.stop());
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("on", s.id === id));
    this.cur = id;
    ({l1: L1, l2: L2, l3: L3, team: Team}[id] || {start() {}}).start();
  },
  refresh() { if (this.cur === "recap" && L3.rounds.length) Recap.show(L3.rounds); },
  async init() {
    await Assets.load();
    document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => this.go(b.dataset.go));
    document.querySelectorAll("[data-q]").forEach(b => b.onclick = () => Pop.question(b.dataset.q));
    document.getElementById("langBtn").onclick = () => { Lang.cur = Lang.cur === "zh" ? "en" : "zh"; Lang.apply(); };
    document.getElementById("soupReward").onchange = () => L1.run();
    document.getElementById("l1play").onclick = () => L1.run();
    document.getElementById("stage").oninput = () => L2.run();
    document.getElementById("trail").onchange = () => L2.run();
    document.getElementById("l3start").onclick = () => L3.begin();
    document.getElementById("agree").onclick = () => L3.agree();
    document.getElementById("disagree").onclick = () => L3.disagree();
    window.addEventListener("keydown", e => L3.key(e));
    Lang.apply(); this.go("menu");
  },
};
App.init();
