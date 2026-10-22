// Proportional stage scale: the whole game (home, roadmap, levels, bridges, recap) is laid out on a logical
// stage of at least BASE css px and zoomed uniformly to fill the viewport (aspect kept, centred, small margins).
// Phones (<= 900px wide) stay at 1:1 with their own responsive layout.
const Stage = {
  BASE: [1152, 648], PHONE: 900, k: 1,
  fit() {
    const W = innerWidth, H = innerHeight;
    const k = W <= Stage.PHONE ? 1 : Math.max(1, Math.floor(Math.min(W / Stage.BASE[0], H / Stage.BASE[1]) * 100) / 100);
    Stage.k = k; const r = document.documentElement;
    r.style.zoom = k === 1 ? "" : k; r.style.setProperty("--z", k); r.style.setProperty("--unz", 1 / k);
  },
};
Stage.fit(); addEventListener("resize", () => Stage.fit());
