// Trained Kai in the browser: port of overcooked-ai featurize_state_mdp (cramped_room, 2 players, num_pots=2 -> 96 features)
// + the VDN Q-net (96->256->256->6, ReLU) exported by code/rl/export_web_net.py. Validated against Python in code/rl/validate_kai.js.
"use strict";
const KaiNet = {
  ready: false,
  load(spec) {
    const dec = s => { const b = typeof atob === "function" ? Uint8Array.from(atob(s), c => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, "base64"));
      return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    this.spec = spec; this.L = spec.layers.map(l => ({W: dec(l.W), b: dec(l.b), out: l.shape[0], inp: l.shape[1]}));
    this.ready = true; return this;
  },
  forward(x) {
    let h = Float32Array.from(x);
    this.L.forEach((l, k) => {
      const o = new Float32Array(l.out);
      for (let i = 0; i < l.out; i++) { let s = l.b[i]; const r = i * l.inp; for (let j = 0; j < l.inp; j++) s += l.W[r + j] * h[j]; o[i] = k < this.L.length - 1 && s < 0 ? 0 : s; }
      h = o;
    });
    return Array.from(h);
  },
  // state: {p:[{x,y,o(0=N,1=S,2=E,3=W),h:null|'onion'|'dish'|'soup',n?}], objects:[{name,x,y,n?,idle?,ready?,rem?}] in insertion order}
  featurize(st) {
    const S = this.spec, key = (x, y) => x + "," + y, objAt = {};
    st.objects.forEach(o => objAt[key(o.x, o.y)] = o);
    const isCounter = new Set(S.counters.map(([x, y]) => key(x, y)));
    const counterObjs = name => st.objects.filter(o => o.name === name && isCounter.has(key(o.x, o.y))).map(o => [o.x, o.y]);
    const closest = (p, locs) => {        // = mlam.motion_planner.min_cost_to_feature(..., with_argmin=True)
      const row = S.dist[key(p.x, p.y) + "," + p.o] || {}; let best = null, bd = Infinity;
      for (const [x, y] of locs) { const d = row[key(x, y)]; if (d !== undefined && d < bd) { bd = d; best = [x, y]; } }
      return best;
    };
    const per = st.p.map(p => {
      const f = [];
      f.push(...[0, 1, 2, 3].map(i => +(i === p.o)));
      f.push(...["onion", "soup", "dish", "tomato"].map(n => +(p.h === n)));
      const cf = (name, locs) => {
        let obj = null;
        if (p.h === name) { f.push(0, 0); if (name === "soup") obj = {n: p.n ?? 3}; }
        else { const l = closest(p, locs); if (l && objAt[key(...l)]) obj = objAt[key(...l)]; f.push(...(l ? [l[0] - p.x, l[1] - p.y] : [0, 0])); }
        if (name === "soup") f.push(obj ? (obj.n ?? 0) : 0, 0);
      };
      cf("onion", S.onion_disp.concat(counterObjs("onion")));
      cf("tomato", []);
      cf("dish", S.dish_disp.concat(counterObjs("dish")));
      cf("soup", counterObjs("soup"));
      cf("serving", S.serving);
      cf("empty_counter", S.counters.filter(([x, y]) => !objAt[key(x, y)]));
      let pots = S.pots.slice();
      for (let j = 0; j < 2; j++) {
        const l = closest(p, pots);
        if (!l) { f.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0); continue; }
        const s = objAt[key(...l)], empty = !s, cooking = s && !s.idle && !s.ready, ready = s && s.ready, full = s && (cooking || ready || s.n >= 3);
        f.push(1, +empty, +!!full, +!!cooking, +!!ready, s ? s.n : 0, 0, s && !s.idle ? s.rem : 0, l[0] - p.x, l[1] - p.y);
        pots = pots.filter(q => q !== l && key(...q) !== key(...l));
      }
      const D = [[0, -1], [0, 1], [1, 0], [-1, 0]];
      D.forEach(([dx, dy]) => f.push(+(((S.terrain[p.y + dy] || "")[p.x + dx] || "X") !== " ")));
      return f;
    });
    return st.p.map((p, i) => {
      const o = st.p[1 - i];
      return [...per[i], ...per[1 - i], o.x - p.x, o.y - p.y, p.x, p.y];
    });
  },
  act(st, i = 1) { const q = this.forward(this.featurize(st)[i]); let a = 0; q.forEach((v, k) => { if (v > q[a]) a = k; }); return {a, q, action: this.spec.actions[a]}; },
};
if (typeof module !== "undefined") module.exports = KaiNet;
