// Character animation layer. Every character drawn in the game (kitchen canvases, home screen) goes through here.
// Backends per character/skin come from data/characters.json (see docs/ANIMATION_ASSETS.md):
//   static : the current images (default, fallback)   sprite : one sheet per action   spine : spine-canvas runtime (lazy)
// Instance API: play(action, {loop}), update(dt), draw(ctx, x, y, w, h, facing), size(facing) -> [w, h] (natural px)
class Character {
  static ACTIONS = ["idle", "walk", "talk", "happy", "confused"];
  static ONESHOT_MS = {happy: 1200, confused: 900};
  static defs = {};
  static src = "data/characters.json";

  // ?chars=<name> loads data/<name>.json instead (used by tests with a dummy sprite set)
  static async load() {
    const q = new URLSearchParams(location.search).get("chars");
    const url = q ? `data/${q.replace(/[^\w-]/g, "")}.json` : Character.src;
    try { Character.defs = await (await fetch(url)).json(); } catch (e) { Character.defs = {}; }
  }
  // name: wendy | kai | dingo; skin: kitchen | home
  static create(name, skin = "kitchen") {
    const d = (Character.defs[name] || {})[skin] || {backend: "static"};
    return new Character(name, skin, d);
  }
  static reducedMotion() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  static image(src) { const i = new Image(); i.src = Character.url(src); return i; }
  static url(src) { return /^(data:|https?:|\/)/.test(src) ? src : "assets/" + src; }

  constructor(name, skin, def) {
    this.name = name; this.skin = skin; this.def = def;
    this.action = "idle"; this.facing = "down"; this.carrying = null; this.loop = true; this.t = 0; this.oneshot = null;
    this.fallback = new StaticBackend(def.static || {}, name, skin);
    this.backend = Character.makeBackend(def, this.fallback);
  }
  static makeBackend(def, fallback) {
    if (def.backend === "sprite") return new SpriteBackend(def);
    if (def.backend === "spine") return new SpineBackend(def, fallback);
    return fallback;
  }
  play(action, {loop = true} = {}) {
    if (action === this.action && loop === this.loop) return this;
    this.action = action; this.loop = loop; this.t = 0;
    this.oneshot = loop ? null : (Character.ONESHOT_MS[action] || 1000);
    this.backend.play && this.backend.play(action, loop);
    return this;
  }
  // one-shot reaction (happy / confused); returns to the state machine afterwards
  react(action) { this.play(action, {loop: false}); }
  // state machine: one-shot > walk (moving) > talk (voice line) > idle
  // kitchen: walk resolves to walk_<facing>, or carry_<facing> while holding an item (see SpriteBackend.candidates)
  auto({moving = false, talking = false, carrying = null} = {}) {
    this.carrying = carrying || null;
    if (this.oneshot !== null) return;
    this.play(moving ? "walk" : talking ? "talk" : "idle");
  }
  // true when the current sprite already shows the held prop (def.carries: item names baked into carry_* frames)
  showsItem(item, facing = this.facing) {
    const s = this.backend.spec && this.backend.spec(this, facing);
    return !!(s && s.name && s.name.startsWith("carry_") && (this.def.carries || []).includes(item));
  }
  // name of the sheet actually drawn right now (tests / debugging)
  current(facing = this.facing) { const s = this.backend.spec && this.backend.spec(this, facing); return s ? s.name : "static"; }
  update(dt) {
    this.t += dt;
    if (this.oneshot !== null && this.t >= this.oneshot) { this.oneshot = null; this.play("idle"); }
    this.backend.update && this.backend.update(dt, this);
  }
  frame() { return this.backend.frameIndex ? this.backend.frameIndex(this) : 0; }
  size(facing) { this.facing = facing || this.facing; const s = this.backend.size(facing, this); return s || this.fallback.size(facing, this); }
  draw(ctx, x, y, w, h, facing = "down") {
    this.facing = facing;
    if (!this.backend.draw(ctx, x, y, w, h, facing, this)) this.fallback.draw(ctx, x, y, w, h, facing, this);
  }
}

// static: one image per facing (kitchen: from assets/manifest.json via Assets.img; home: def.static.down)
class StaticBackend {
  constructor(files, name, skin) {
    this.img = {};
    for (const [f, src] of Object.entries(files)) this.img[f] = Character.image(src);
    this.legacy = skin === "kitchen" ? {wendy: "player_", kai: "partner_"}[name] : null;
  }
  pick(facing) {
    if (this.legacy && typeof Assets !== "undefined" && Assets.img[this.legacy + facing]) return Assets.img[this.legacy + facing];
    return this.img[facing] || this.img.down || Object.values(this.img)[0];
  }
  size(facing) { const i = this.pick(facing); return i && i.naturalWidth ? [i.naturalWidth, i.naturalHeight] : null; }
  draw(ctx, x, y, w, h, facing) { const i = this.pick(facing); if (!i || !i.complete || !i.naturalWidth) return false; ctx.drawImage(i, x, y, w, h); return true; }
}

// sprite: one sheet per action, loaded lazily (one request per action, never per frame).
//   def.index = "anim2d/<char>/index.json" (written by tools/build_anim2d.py from the GAD folders: file-name driven,
//   whatever <char>_<action>/ folders exist become actions; frame counts come from the GAD json)
//   and/or def.actions[action] = {sheet, frameW, frameH, count, fps, cols?} or {json: "path.json"}.
//   def.use: optional whitelist of actions for this skin (home uses idle/talk only).
class SpriteBackend {
  constructor(def) {
    this.actions = {}; this.def = def; this.ready = Promise.resolve();
    const use = def.use ? new Set(def.use) : null, add = (a, spec, base) => {
      if (use && !use.has(a)) return;
      this.actions[a] = {...spec, name: a, base, img: null};
    };
    for (const [a, spec] of Object.entries(def.actions || {})) {
      if (spec.json) { const s = this.actions[a] = {name: a, img: null, pending: true};
        fetch(Character.url(spec.json)).then(r => r.json()).then(j => { Object.assign(s, j, {pending: false}); s.base = spec.json; }).catch(() => {}); }
      else add(a, spec, "");
    }
    if (def.index) this.ready = fetch(Character.url(def.index)).then(r => r.json()).then(j => {
      for (const [a, spec] of Object.entries(j.actions || {})) if (!this.actions[a]) add(a, spec, def.index);
      this.load(this.actions.idle);
    }).catch(() => {});
  }
  static rel(jsonPath, sheet) { return sheet.includes("/") || !jsonPath ? sheet : jsonPath.replace(/[^/]*$/, "") + sheet; }
  load(s) { if (s && !s.img && s.sheet) s.img = Character.image(SpriteBackend.rel(s.base, s.sheet)); return s; }
  // fallback chain per logical action; first one that has a sheet wins (missing everything -> static)
  static candidates(c, facing = "down") {
    const f = facing || "down";
    if (c.action === "walk") return [...(c.carrying ? ["carry_" + f] : []), "walk_" + f, "walk", "idle"];
    return [c.action, "idle"];
  }
  spec(c, facing = c.facing) {
    for (const n of SpriteBackend.candidates(c, facing)) { const s = this.actions[n]; if (s && !s.pending && s.sheet) return this.load(s); }
    return null;
  }
  frameIndex(c) {
    const s = this.spec(c); if (!s || !s.count) return 0;
    if (Character.reducedMotion()) return 0;
    const i = Math.floor(c.t / 1000 * (s.fps || 12));
    return c.loop || c.oneshot !== null ? i % s.count : Math.min(i, s.count - 1);
  }
  size(facing, c) { const s = this.spec(c, facing); return s && s.frameW ? [s.frameW, s.frameH] : null; }
  draw(ctx, x, y, w, h, facing, c) {
    const s = this.spec(c, facing); if (!s || !s.img || !s.img.complete || !s.img.naturalWidth) return false;
    const cols = s.cols || s.count, i = this.frameIndex(c);
    const sx = (i % cols) * s.frameW, sy = Math.floor(i / cols) * s.frameH;
    ctx.drawImage(s.img, sx, sy, s.frameW, s.frameH, x, y, w, h);
    c.drawn = s.name; c.drawnFrame = i;
    return true;
  }
}

// spine: lazy-loads the spine-canvas runtime the first time a spine character is created.
// Expects web/vendor/spine-canvas.js (global `spine`, Esoteric spine-ts canvas build, 4.x) and per character
// def.skeleton (.json or .skel), def.atlas (.atlas next to its .png pages). Until the runtime is vendored the
// static fallback is drawn and a console warning (not an error) is logged once.
class SpineBackend {
  static RUNTIME = "vendor/spine-canvas.js";
  static loading = null;
  static runtime() {
    if (window.spine) return Promise.resolve(window.spine);
    if (!SpineBackend.loading) SpineBackend.loading = fetch(SpineBackend.RUNTIME, {method: "HEAD"}).then(r => {
      if (!r.ok) throw new Error("not vendored");
      return new Promise((res, rej) => { const s = document.createElement("script"); s.src = SpineBackend.RUNTIME; s.onload = () => res(window.spine); s.onerror = rej; document.head.appendChild(s); });
    }).catch(e => { console.warn("spine-canvas runtime missing (" + SpineBackend.RUNTIME + "); using static art"); return null; });
    return SpineBackend.loading;
  }
  constructor(def, fallback) {
    this.def = def; this.fallback = fallback; this.ready = false;
    SpineBackend.runtime().then(sp => sp && this.init(sp)).catch(() => {});
  }
  async init(sp) {
    const base = Character.url(this.def.atlas).replace(/[^/]*$/, "");
    const am = new sp.AssetManager(base);
    am.loadTextureAtlas(this.def.atlas.split("/").pop()); am.loadText(this.def.skeleton.split("/").pop());
    await new Promise(r => { const w = () => am.isLoadingComplete() ? r() : setTimeout(w, 50); w(); });
    const atlas = am.require(this.def.atlas.split("/").pop());
    const data = new sp.SkeletonJson(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(am.require(this.def.skeleton.split("/").pop()));
    this.skel = new sp.Skeleton(data); this.state = new sp.AnimationState(new sp.AnimationStateData(data));
    this.renderer = null; this.sp = sp; this.ready = true; this.play("idle", true);
  }
  play(action, loop) { if (!this.ready) return; const n = (this.def.animations || {})[action] || action; try { this.state.setAnimation(0, n, loop); } catch (e) {} }
  update(dt) { if (!this.ready) return; this.state.update(dt / 1000); this.state.apply(this.skel); this.skel.updateWorldTransform(); }
  size() { return this.def.size || null; }
  draw(ctx, x, y, w, h, facing) {
    if (!this.ready) return false;
    if (!this.renderer || this.renderer.ctx !== ctx) this.renderer = new this.sp.SkeletonRenderer(ctx);
    const [bw, bh] = this.def.size || [w, h];
    ctx.save(); ctx.translate(x + w / 2, y + h); ctx.scale((facing === "left" ? -1 : 1) * w / bw, -h / bh);
    this.skel.x = 0; this.skel.y = 0; this.renderer.draw(this.skel); ctx.restore(); return true;
  }
}

// Smooth grid movement: visual position eases from the previous cell to the new one over the step interval.
class Tween {
  constructor(x, y) { this.x = x; this.y = y; this.fx = x; this.fy = y; this.tx = x; this.ty = y; this.t0 = 0; this.dur = 0; }
  to(x, y, dur, now = performance.now()) {
    if (x === this.tx && y === this.ty) return;
    const far = Math.abs(x - this.x) + Math.abs(y - this.y) > 1.5;      // teleports (reset, off-grid) snap
    this.fx = far ? x : this.x; this.fy = far ? y : this.y; this.tx = x; this.ty = y; this.t0 = now; this.dur = far ? 0 : dur;
  }
  step(now = performance.now()) {
    const k = this.dur ? Math.min(1, (now - this.t0) / this.dur) : 1, e = k < 1 ? k * (2 - k) : 1;
    this.x = this.fx + (this.tx - this.fx) * e; this.y = this.fy + (this.ty - this.fy) * e;
    return this;
  }
  get moving() { return this.x !== this.tx || this.y !== this.ty; }
}

// Per-canvas cast: one Character + Tween per kitchen slot (0 = Wendy, 1 = Kai). Who is talking comes from Voice.
class Cast {
  static NAMES = ["wendy", "kai"];
  static of(ctx) { return ctx._cast || (ctx._cast = new Cast()); }
  constructor() { this.chars = Cast.NAMES.map(n => Character.create(n)); this.tw = [null, null]; this.last = performance.now(); this.stepMs = [170, 750]; }
  sync(players, now = performance.now()) {
    const dt = now - this.last; this.last = now;
    players.forEach((p, i) => {
      const tw = this.tw[i] || (this.tw[i] = new Tween(p.x, p.y));
      tw.to(p.x, p.y, this.stepMs[i] || 170, now); tw.step(now);
      const c = this.chars[i];
      c.facing = p.f || c.facing;
      c.auto({moving: tw.moving, talking: Voice.speaking === Cast.NAMES[i], carrying: p.h}); c.update(dt);
    });
  }
  react(i, action) { this.chars[i] && this.chars[i].react(action); }
}
