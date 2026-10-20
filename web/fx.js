// Feedback layer: SFX, voice lines + subtitles, concept theatre videos, frame-sequence animations.
"use strict";
const Sfx = {
  names: ["pickup", "plop", "bubble", "ding", "clink", "serve", "wrong", "tick"],
  buf: {}, ctx: null, muted: localStorage.getItem("muted") === "1", loop: null,
  async load() {
    // fetch raw bytes now (no gesture needed); decode once the AudioContext is unlocked
    this.raw = {};
    await Promise.all(this.names.map(async n => { const r = await fetch("assets/sfx/" + n + ".wav"); this.raw[n] = await r.arrayBuffer(); }));
    const unlock = () => { this.unlock(); };
    ["pointerdown", "keydown", "touchstart"].forEach(e => window.addEventListener(e, unlock, {once: true, capture: true}));
  },
  async unlock() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain(); this.gain.connect(this.ctx.destination); this.gain.gain.value = this.muted ? 0 : 1;
    for (const n of this.names) this.buf[n] = await this.ctx.decodeAudioData(this.raw[n].slice(0));
    await Music.init(this.ctx, this.gain);
  },
  play(n, vol = 1) {
    if (!this.ctx || !this.buf[n]) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = vol;
    s.buffer = this.buf[n]; s.connect(g); g.connect(this.gain); s.start(); return s;
  },
  setLoop(on) {
    if (on && !this.loop && this.ctx && this.buf.bubble) { this.loop = this.play("bubble", .5); this.loop.loop = true; }
    if (!on && this.loop) { this.loop.stop(); this.loop = null; }
  },
  toggle() {
    this.muted = !this.muted; localStorage.setItem("muted", this.muted ? "1" : "0");
    if (this.gain) this.gain.gain.value = this.muted ? 0 : 1;
    Voice.audio.muted = this.muted; if (Theatre.video && !Theatre.overlay) Theatre.video.muted = this.muted;
    document.getElementById("muteBtn").textContent = this.muted ? "🔇" : "🔊";
  },
};

// Background music (bgm loops + jingles from the art director). Own gain node under the master mute;
// ducked to 25% while a voice line plays; separate music on/off toggle.
const Music = {
  FILES: ["bgm_story_loop", "bgm_kitchen_loop", "jingle_success", "jingle_fail"],
  buf: {}, src: null, want: null, on: localStorage.getItem("music") !== "0", ducked: false,
  async init(ctx, master) {
    this.ctx = ctx; this.g = ctx.createGain(); this.g.connect(master); this.g.gain.value = 0;
    await Promise.all(this.FILES.map(async f => { const r = await fetch("assets/music/" + f + ".mp3"); this.buf[f] = await ctx.decodeAudioData(await r.arrayBuffer()); }));
    if (this.want) { const w = this.want; this.want = null; this.play(w.name, w.vol); }
  },
  level() { return !this.on || !this.want ? 0 : this.want.vol * (this.ducked ? .25 : 1); },
  ramp() { if (this.g) this.g.gain.setTargetAtTime(this.level(), this.ctx.currentTime, .15); },
  play(name, vol = .35) {
    if (this.want && this.want.name === name && this.src) { this.want.vol = vol; return this.ramp(); }
    this.stopSrc(); this.want = {name, vol};
    if (!this.ctx || !this.buf[name]) return;
    this.src = this.ctx.createBufferSource(); this.src.buffer = this.buf[name]; this.src.loop = true; this.src.connect(this.g); this.src.start();
    this.g.gain.value = 0; this.ramp();
  },
  stopSrc() { if (this.src) { try { this.src.stop(); } catch (e) {} this.src = null; } },
  stop() { this.stopSrc(); this.want = null; this.ramp(); },
  current() { return this.want ? {...this.want} : null; },
  jingle(name) {
    if (!this.ctx || !this.buf[name] || !this.on) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = .8; s.buffer = this.buf[name]; s.connect(g); g.connect(Sfx.gain); s.start();
  },
  duck(on) { this.ducked = on; this.ramp(); },
  toggle() { this.on = !this.on; localStorage.setItem("music", this.on ? "1" : "0"); this.ramp(); this.paint(); },
  paint() { const b = document.getElementById("musicBtn"); b.textContent = "♪"; b.classList.toggle("off", !this.on); },
};

// Voice lines from assets/voice/manifest.json (file, character, level, text). Plays a queue with subtitles.
const Voice = {
  audio: new Audio(), lines: {}, queue: [], token: 0,
  NAMES: {dingo: "Dingo", wendy: "Wendy", kai: "Kai"},
  async load() {
    const m = await (await fetch("assets/voice/manifest.json")).json();
    m.forEach(l => this.lines[l.file.replace(".mp3", "")] = l);
    // recorded numbers 0..5 and the singular "bowl." ending; their captions continue the previous cue
    for (let n = 0; n <= 5; n++) this.lines["num_" + n] = {file: `dingo_num_${n}.mp3`, character: "dingo", level: "num", text: String(n), cont: true};
    this.lines.single_b = {file: "dingo_L4_04_b_singular.mp3", character: "dingo", level: "num", text: "bowl. Great teamwork!", cont: true};
    // captions come from subtitles/<level>.vtt ("Speaker: text" cues, in manifest order); manifest text is the fallback
    await Promise.all([...new Set(m.map(l => l.level))].map(async lv => {
      const r = await fetch("assets/voice/subtitles/" + lv + ".vtt"); if (!r.ok) return;
      const cues = (await r.text()).split(/\r?\n\r?\n/).filter(b => b.includes("-->")).map(b => b.split(/\r?\n/).slice(b.split(/\r?\n/).findIndex(x => x.includes("-->")) + 1).join(" "));
      m.filter(l => l.level === lv).forEach((l, i) => { const c = cues[i], mm = c && c.match(/^([^:]{1,12}):\s*(.*)$/); if (mm) Object.assign(l, {speaker: mm[1], caption: mm[2]}); });
    }));
  },
  ids(level) { return Object.keys(this.lines).filter(k => this.lines[k].level === level); },
  sub(line) {
    const el = document.getElementById("subtitle");
    if (!line) { el.classList.add("hidden"); return; }
    if (line.cont && !el.classList.contains("hidden")) { el.lastChild.textContent += " " + (line.caption || line.text); return; }
    el.innerHTML = ""; const b = document.createElement("b"); b.textContent = (line.speaker || this.NAMES[line.character] || line.character) + ": ";
    el.append(b, document.createTextNode(line.caption || line.text)); el.className = "sub-" + line.character;
  },
  stop() { this.token++; Music.duck(false); this.audio.pause(); speechSynthesis && speechSynthesis.cancel(); this.sub(null); },
  // items: voice ids, or {say: "text"} for spoken text without a recording (e.g. the number in dingo_L4_04)
  async play(items) {
    this.stop(); const tok = this.token; Music.duck(true);
    for (const it of items) {
      if (tok !== this.token) return false;
      if (typeof it === "object") { await this.speak(it.say, tok); continue; }
      const line = this.lines[it]; if (!line) continue;
      this.sub(line);
      await new Promise(res => { this.audio.src = "assets/voice/" + line.file; this.audio.muted = Sfx.muted; this.audio.onended = res; this.audio.onerror = res;
        this.audio.play().catch(() => setTimeout(res, 1500 + line.text.length * 45)); });
      await new Promise(r => setTimeout(r, 250));
    }
    if (tok === this.token) { this.sub(null); Music.duck(false); }
    return tok === this.token;
  },
  speak(text, tok) {
    const el = document.getElementById("subtitle"); el.lastChild && (el.lastChild.textContent += " " + text);
    return new Promise(res => {
      if (!window.speechSynthesis || Sfx.muted) return setTimeout(res, 600);
      const u = new SpeechSynthesisUtterance(text); u.rate = .9; u.onend = res; u.onerror = res;
      speechSynthesis.speak(u); setTimeout(res, 2500);
    });
  },
};

// Concept theatre: *_sub.mp4 already carry voice, burned-in subtitles and a held last frame -> play as-is.
// Opening (silent video): overlay Wendy/Kai/Dingo arrival lines with captions; video holds last frame until voice ends.
const Theatre = {
  MAP: {l1: "concept_reward_sub", l2: "concept_explore_sub", l3: "concept_strategy_sub", intro: "opening_arrival"},
  VOICE: {intro: ["wendy_L0_08", "kai_L0_09"]},
  seen: {},
  show(level, then) {
    this.seen[level] = true; Voice.stop(); const prevMusic = Music.current();
    Music.play("bgm_story_loop", level === "intro" ? .35 : .12);       // low under the voiced concept videos
    const ov = document.getElementById("theatre"), v = this.video = document.getElementById("theatreVideo");
    ov.classList.remove("hidden"); v.src = "assets/video/" + this.MAP[level] + ".mp4";
    const lines = this.VOICE[level]; this.overlay = !!lines;
    v.muted = !!lines || Sfx.muted; v.currentTime = 0;
    let videoDone = false, voiceDone = !lines, closed = false;
    const close = () => { if (closed) return; closed = true; Voice.stop(); v.pause(); v.removeAttribute("src"); v.load(); ov.classList.add("hidden");
      prevMusic ? Music.play(prevMusic.name, prevMusic.vol) : Music.stop(); then && then(); };
    const check = () => { if (videoDone && voiceDone) setTimeout(close, 400); };
    v.onended = v.onerror = () => { videoDone = true; check(); };          // ended video stays on its last frame
    v.play().catch(() => { v.muted = true; v.play().catch(() => { videoDone = true; check(); }); });
    if (lines) Voice.play(lines).then(ok => { if (ok) { voiceDone = true; check(); } });
    document.getElementById("theatreSkip").onclick = close;
  },
};

// Frame-sequence animations (transparent PNG folders under assets/anim/<name>/NN.png)
const Fx = {
  N: {hud_pickup_onion: 12, hud_pickup_dish: 12, hud_splash: 16, hud_cook_ring: 40, star_coin_fly: 30, kai_confused: 24, wendy_confused: 24},
  frames: {}, live: [], timer: [], wrongX: null,
  load() {
    const jobs = [];
    const img = src => { const i = new Image(); jobs.push(new Promise(r => { i.onload = i.onerror = r; })); i.src = src; return i; };
    for (const [k, n] of Object.entries(this.N)) this.frames[k] = Array.from({length: n}, (_, i) => img(`assets/anim/${k}/${String(i).padStart(2, "0")}.png`));
    for (let s = 0; s <= 60; s++) this.timer[s] = img(`assets/hud/timer/${String(s).padStart(2, "0")}.png`);
    this.wrongX = img("assets/hud/wrong_x.png");
    return Promise.all(jobs);
  },
  // cx,cy = centre in kitchen pixel coords; w = draw width
  spawn(key, cx, cy, w, fps = 24, extra = {}) { this.live.push({key, cx, cy, w, fps, t0: performance.now(), ...extra}); },
  draw(ctx) {
    const now = performance.now();
    this.live = this.live.filter(f => {
      const age = (now - f.t0) / 1000;
      if (f.key === "wrong_x") {
        if (age > .7) return false;
        ctx.globalAlpha = Math.min(1, (0.7 - age) * 4); const s = f.w * (1 + .3 * Math.max(0, .15 - age) / .15);
        ctx.drawImage(this.wrongX, f.cx - s / 2, f.cy - s / 2, s, s); ctx.globalAlpha = 1; return true;
      }
      const fr = this.frames[f.key], i = Math.floor(age * f.fps);
      if (i >= fr.length) return false;
      const im = fr[i], h = (im.naturalHeight || 1) * f.w / (im.naturalWidth || 1);
      ctx.drawImage(im, f.cx - f.w / 2, f.cy - h / 2 - (f.rise || 0) * age, f.w, h);
      return true;
    });
  },
};
