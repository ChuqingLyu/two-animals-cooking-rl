// Feedback layer: SFX, voice lines + subtitles, concept theatre videos, frame-sequence animations.
"use strict";
// Swap-in art: replace these two paths when the art director delivers the new Dingo idle image / opening animation.
const ART = {
  // home Dingo / Wendy / Kai art now lives in data/characters.json (Character module; see docs/ANIMATION_ASSETS.md)
  OPENING_VIDEO: "assets/home/intro_opening_silent.mp4", // opening animation (no music; the page plays bgm); last frame = home screen
};

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
  cfg: {crossfade: .8, duck: .25, tracks: {}, scenes: {}},          // data/music.json (scene -> track id -> file/vol/rate)
  buf: {}, src: null, srcGain: null, want: null, on: localStorage.getItem("music") !== "0", ducked: false, sceneName: null, log: [],
  async loadConfig() { try { Object.assign(this.cfg, await (await fetch("data/music.json")).json()); } catch (e) {} },
  async init(ctx, master) {
    this.ctx = ctx; this.g = ctx.createGain(); this.g.connect(master); this.g.gain.value = 0;
    const files = new Set(this.FILES); Object.values(this.cfg.tracks).forEach(t => { files.add(t.file); t.jingle && files.add(t.jingle); });
    this.FILES = [...files];
    await Promise.all(this.FILES.map(async f => { const r = await fetch("assets/music/" + f + ".mp3"); this.buf[f] = await ctx.decodeAudioData(await r.arrayBuffer()); }));
    if (this.want) { const w = this.want; this.want = null; this.start(w); }
  },
  level() { return !this.on || !this.want ? 0 : this.ducked ? this.cfg.duck : 1; },
  ramp() { if (this.g) this.g.gain.setTargetAtTime(this.level(), this.ctx.currentTime, .15); },
  // scene switch: crossfade to the scene's track (gameplay -> bgm_kitchen_loop)
  scene(name) {
    const id = this.cfg.scenes[name], t = this.cfg.tracks[id];
    this.sceneName = name;
    if (!t) return this.play(name === "gameplay" ? "bgm_kitchen_loop" : "bgm_story_loop", .3, name);
    this.start({file: t.file, vol: t.vol, id, rate: t.rate, loop: t.loop !== false, samples: t.samples}, true);
    if (t.jingle) this.jingle(t.jingle);
  },
  // legacy entry: file name + volume (kept for callers that predate scenes)
  play(file, vol = .35, id = file, rate = 1) {
    if (this.want && this.want.id === id && this.src) return;
    this.start({file, vol, id, rate});
  },
  start(w, force) {
    if (this.want && this.want.id === w.id && this.src) return;
    this.want = w; this.log.push(w.id);
    if (!this.ctx || !this.buf[w.file]) return this.ramp();
    const xf = this.cfg.crossfade, now = this.ctx.currentTime;
    if (this.src) { const o = this.src, og = this.srcGain; og.gain.cancelScheduledValues(now); og.gain.setValueAtTime(og.gain.value, now); og.gain.linearRampToValueAtTime(0, now + xf); setTimeout(() => { try { o.stop(); } catch (e) {} }, xf * 1000 + 100); }
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buf[w.file]; s.loop = w.loop !== false;
    // seamless loop: loop exactly the master's sample count (skips mp3 encoder padding if the decoder kept any)
    if (s.loop && w.samples) { const sr = this.cfg.sample_rate || 44100, lead = Music.lead(s.buffer, w.samples, sr); s.loopStart = lead; s.loopEnd = lead + w.samples / sr; } s.playbackRate.value = w.rate || 1; s.connect(g); g.connect(this.g);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(w.vol, now + xf); s.start();
    this.src = s; this.srcGain = g; this.ramp();
  },
  // leading encoder delay still in the decoded buffer (music.json lead_samples, measured by the test; 0 = gapless header honoured)
  lead(buf, samples, sr) { return (this.cfg.lead_samples || 0) / sr; },
  stopSrc() { if (this.src) { try { this.src.stop(); } catch (e) {} this.src = null; } },
  stop() { this.stopSrc(); this.want = null; this.ramp(); },
  current() { return this.want ? {...this.want} : null; },
  playing() { return !!(this.ctx && this.ctx.state === "running" && this.src && this.want && this.on); },
  jingle(name) {
    if (!this.ctx || !this.buf[name] || !this.on) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = .8; g.gain.value = this.cfg.jingle_vol || .8; s.buffer = this.buf[name]; s.connect(g); g.connect(Sfx.gain); s.start();
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
    Object.assign(this.lines, {
      fail_a: {file: "dingo_fail_a.mp3", character: "dingo", level: "num", text: "You made"},
      word_bowl: {file: "dingo_word_bowl.mp3", character: "dingo", level: "num", text: "bowl.", cont: true},
      word_bowls: {file: "dingo_word_bowls.mp3", character: "dingo", level: "num", text: "bowls.", cont: true},
      fail_c: {file: "dingo_fail_c.mp3", character: "dingo", level: "num", text: "Two bowls wins. You're so close!", cont: true}});
    // captions come from subtitles/<level>.vtt ("Speaker: text" cues, in manifest order); manifest text is the fallback
    await Promise.all([...new Set(m.map(l => l.level))].map(async lv => {
      const r = await fetch("assets/voice/subtitles/" + lv + ".vtt"); if (!r.ok) return;
      const cues = (await r.text()).split(/\r?\n\r?\n/).filter(b => b.includes("-->")).map(b => b.split(/\r?\n/).slice(b.split(/\r?\n/).findIndex(x => x.includes("-->")) + 1).join(" "));
      m.filter(l => l.level === lv).forEach((l, i) => { const c = cues[i], mm = c && c.match(/^([^:]{1,12}):\s*(.*)$/); if (mm) Object.assign(l, {speaker: mm[1], caption: mm[2]}); });
    }));
  },
  // scene videos (assets/lines/scenes.json, built by tools/sync_scenes.py): file_id -> {scene, start, end}
  scenes: {}, sceneOf: {},
  async loadScenes() {
    try { const r = await fetch("assets/lines/scenes.json"); if (r.ok) this.scenes = await r.json(); } catch (e) {}
    if (!document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')) this.scenes = {};   // no H.264: Kokoro fallback
    for (const [sid, sc] of Object.entries(this.scenes)) sc.lines.forEach((l, i) => this.sceneOf[l.id] = {sid, i});
  },
  ids(level) { return Object.keys(this.lines).filter(k => this.lines[k].level === level); },
  name() { return localStorage.getItem("playerName") || (typeof Story !== "undefined" ? Story.defaultName() : "Friend"); },
  fill(t) { return String(t).replace(/\{name\}/g, this.name()); },
  sub(line) {
    this.speaking = line ? line.character : null;
    if (this.inVideo) {     // scene video: our own speaker-prefixed caption over the clean video
      const c = document.getElementById("sceneSub"); c.innerHTML = ""; if (!line) return;
      const b = document.createElement("b"); b.textContent = (this.NAMES[line.character] || line.character) + ": ";
      c.className = "sub-" + line.character; c.append(b, document.createTextNode(this.fill(line.caption || line.text)));
      document.getElementById("subtitle").classList.add("hidden"); return;
    }
    if (line && typeof Story !== "undefined" && Story.captures(line)) return;      // story dialogue / bridge show the line in their own box
    const el = document.getElementById("subtitle");
    const ref = document.getElementById("dingoRef"), bub = ref && ref.querySelector(".bubble");
    if (!line) { el.classList.add("hidden"); bub && bub.classList.add("hidden"); return; }
    // L4: Dingo is the referee at the kitchen's side; his lines go into his own speech bubble
    if (line.character === "dingo" && bub && ref.offsetParent) {
      el.classList.add("hidden");
      if (line.cont && !bub.classList.contains("hidden")) { bub.textContent += " " + this.fill(line.caption || line.text); return; }
      bub.textContent = this.fill(line.caption || line.text); bub.classList.remove("hidden"); return;
    }
    bub && bub.classList.add("hidden");
    if (line.cont && !el.classList.contains("hidden")) { el.lastChild.textContent += " " + this.fill(line.caption || line.text); return; }
    el.innerHTML = "";
    // anywhere else Dingo speaks, his round avatar sits in the caption box so he is always on screen
    if (line.character === "dingo") { const a = new Image(); a.src = "assets/ui/dingo_avatar.png"; a.alt = "Dingo"; a.className = "subAvatar"; el.append(a); }
    const b = document.createElement("b"); b.textContent = (line.speaker || this.NAMES[line.character] || line.character) + ": ";
    el.append(b, document.createTextNode(this.fill(line.caption || line.text))); el.className = "sub-" + line.character;
  },
  stop() { this.endVideo(); this.token++; Music.duck(false); this.audio.pause(); speechSynthesis && speechSynthesis.cancel(); this.sub(null); },
  // items: voice ids, or {say: "text"} for spoken text without a recording (e.g. the number in dingo_L4_04)
  async play(items) {
    this.stop(); const tok = this.token; Music.duck(true);
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (tok !== this.token) return false;
      if (typeof it === "object") { this.endVideo(); await this.speak(it.say, tok); continue; }
      const sc = !(this.lines[it] || {}).cont && this.sceneOf[it];   // composed lines (numbers + tail) keep their mp3 so the caption stays one sentence
      if (sc) {   // run of consecutive ids from the same scene video -> one continuous segment (voice = video audio)
        const S = this.scenes[sc.sid], run = [S.lines[sc.i]];
        while (k + 1 < items.length && typeof items[k + 1] === "string" && !(this.lines[items[k + 1]] || {}).cont && (this.sceneOf[items[k + 1]] || {}).sid === sc.sid) run.push(S.lines[this.sceneOf[items[++k]].i]);
        if (!(await this.playScene(S, sc.sid, run, tok))) { S.lines.forEach(l => delete this.sceneOf[l.id]); k -= run.length; }   // video failed -> mp3 fallback
        continue;
      }
      this.endVideo();
      const line = this.lines[it]; if (!line) continue;
      this.sub(line);
      await new Promise(res => { this.audio.src = "assets/voice/" + line.file; this.audio.muted = Sfx.muted; this.audio.onended = res; this.audio.onerror = res;
        this.audio.play().catch(() => setTimeout(res, 1500 + line.text.length * 45)); });
      await new Promise(r => setTimeout(r, 250));
    }
    if (tok === this.token) { this.endVideo(); this.sub(null); Music.duck(false); }
    return tok === this.token;
  },
  playScene(S, sid, run, tok) {
    const box = document.getElementById("sceneVideo"), v = document.getElementById("sceneVid");
    const t0 = run[0].start, last = run[run.length - 1], i1 = S.lines.indexOf(last);
    const t1 = Math.min(S.duration || 1e9, last.end + (i1 === S.lines.length - 1 ? .35 : .15));   // skip the silent held tail
    this.inVideo = true; box.classList.remove("hidden"); box.dataset.scene = sid;
    // gameplay: small panel in the speaker's corner (kitchen tiles stay visible); story / bridges / recap: full-size centred
    const hid = id => { const e = document.getElementById(id); return !e || e.classList.contains("hidden"); };
    box.classList.toggle("corner", typeof App !== "undefined" && /^l\d$/.test(App.cur) && hid("dialog") && hid("bridge") && hid("theatre"));
    box.classList.toggle("left", run[0].speaker === "wendy");
    if (!v.src.endsWith(S.video)) v.src = S.video;
    v.muted = Sfx.muted; v.currentTime = t0; this.video = v;
    return new Promise(res => {
      let cur = null; const done = (ok = true) => { if (!this._vres) return; v.ontimeupdate = v.onended = v.onerror = null; this._vres = null; v.pause(); this.sub(null); res(ok !== false); };
      this._vres = done;
      v.ontimeupdate = () => {
        if (tok !== this.token) return done();

        const t = v.currentTime, l = run.find(l => t >= l.start - .05 && t < l.end + .1) || null;
        if (l !== cur) { cur = l; if (l) box.classList.toggle("left", l.speaker === "wendy"); this.sub(l && Object.assign({}, this.lines[l.id] || {}, {character: l.speaker, text: l.text, caption: null})); }
        if (t >= t1) done();
      };
      v.onended = () => done(); v.onerror = () => done(false);
      v.play().catch(() => { v.muted = true; v.play().catch(() => done(false)); });
    });
  },
  endVideo() {
    if (this._vres) this._vres();
    this.inVideo = false; const b = document.getElementById("sceneVideo"); b && b.classList.add("hidden");
  },
  speak(text, tok) {
    const ref = document.getElementById("dingoRef"), bub = ref && ref.querySelector(".bubble");
    const el = bub && !bub.classList.contains("hidden") ? bub : document.getElementById("subtitle"); el.lastChild && (el.lastChild.textContent += " " + text);
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
    Music.scene({home: "opening", intro: "arrival", l1: "concept_l1", l2: "concept_l2", l3: "concept_l3"}[level] || "opening");   // each animated scene has its own track
    const ov = document.getElementById("theatre"), v = this.video = document.getElementById("theatreVideo");
    ov.classList.remove("hidden", "poster"); document.getElementById("theatreStart").classList.add("hidden");
    v.src = level === "home" ? ART.OPENING_VIDEO : "assets/video/" + this.MAP[level] + ".mp4"; ov.classList.toggle("home", level === "home");
    const lines = this.VOICE[level]; this.overlay = !!lines;
    // if the arrival dialogue exists as a scene video, Voice.play shows it in the centred panel over the (muted) arrival animation
    v.muted = !!lines || Sfx.muted; v.currentTime = 0;
    let videoDone = false, voiceDone = !lines, closed = false;
    const close = () => { if (closed) return; closed = true; Voice.stop(); v.pause(); v.removeAttribute("src"); v.load(); ov.classList.add("hidden");
      prevMusic ? Music.start(prevMusic) : Music.stop(); then && then(); };
    const check = () => { if (videoDone && voiceDone) setTimeout(close, level === "home" ? 0 : 400); };   // home: last frame == home screen, cut straight over
    v.onended = v.onerror = () => { videoDone = true; check(); };          // ended video stays on its last frame
    v.play().catch(() => { v.muted = true; v.play().catch(() => { videoDone = true; check(); }); });
    if (lines) Voice.play(lines).then(ok => { if (ok) { voiceDone = true; check(); } });
    document.getElementById("theatreSkip").onclick = close;
  },
  // first load: try to autoplay the opening with sound; if the browser blocks sound, show one big Start button over the first frame
  async boot(then) {
    document.body.classList.add("booting");
    const done = () => { document.body.classList.remove("booting"); then && then(); };
    const probe = new Audio("assets/voice/" + Voice.lines[this.VOICE.intro[0]].file); probe.volume = .01;
    let canSound = false;
    try { await probe.play(); canSound = true; probe.pause(); } catch (e) {}
    if (canSound) { Sfx.unlock(); return this.show("home", done); }
    const ov = document.getElementById("theatre"), v = document.getElementById("theatreVideo"), st = document.getElementById("theatreStart");
    ov.classList.remove("hidden"); ov.classList.add("home", "poster"); st.classList.remove("hidden");
    v.muted = true; v.preload = "auto"; v.src = ART.OPENING_VIDEO; v.currentTime = 0;   // paused first frame = poster
    st.onclick = () => { Sfx.unlock(); this.show("home", done); };
    document.getElementById("theatreSkip").onclick = () => { this.seen.home = true; v.removeAttribute("src"); v.load(); ov.classList.add("hidden"); ov.classList.remove("poster"); st.classList.add("hidden"); done(); };
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
