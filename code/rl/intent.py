"""Intent bubble derived from the learned policy.

icon:   which sub-goal the bear's greedy action moves it toward (BFS distance on the grid),
        restricted to sub-goals that make sense for what it holds / the pot state.
conf:   softmax probability of the greedy action over Q-values (temperature T).
style:  'solid' if conf >= threshold else 'dashed' (+ '?' in the UI).
"""
from collections import deque
import numpy as np

MOVES = [(0, -1), (0, 1), (1, 0), (-1, 0), (0, 0), "interact"]
TILE_FOR = {"onion": "O", "pot": "P", "dish": "D", "serve": "S"}


class Grid:
    @staticmethod
    def dist_map(terrain, targets):
        """BFS distance from every walkable cell to a cell adjacent to any target tile."""
        H, W = len(terrain), len(terrain[0]); dist = {}
        q = deque()
        for y in range(H):
            for x in range(W):
                if terrain[y][x] == " " and any((x + dx, y + dy) in targets for dx, dy in MOVES[:4]):
                    dist[(x, y)] = 0; q.append((x, y))
        while q:
            x, y = q.popleft()
            for dx, dy in MOVES[:4]:
                n = (x + dx, y + dy)
                if 0 <= n[1] < H and 0 <= n[0] < W and terrain[n[1]][n[0]] == " " and n not in dist:
                    dist[n] = dist[(x, y)] + 1; q.append(n)
        return dist


class PotInfo:
    @staticmethod
    def summary(state, pots):
        out = []
        for p in pots:
            s = state.objects.get(p)
            if s is None:
                out.append(dict(n=0, cooking=False, ready=False))
            else:
                out.append(dict(n=len(s.ingredients), cooking=bool(s.is_cooking), ready=bool(s.is_ready)))
        return out

    @staticmethod
    def needs_onion(ps):
        return any(p["n"] < 3 and not p["cooking"] and not p["ready"] for p in ps)

    @staticmethod
    def soup_coming(ps):  # full / cooking / ready  -> time to fetch a dish
        return any(p["n"] >= 3 or p["cooking"] or p["ready"] for p in ps)


class Intent:
    @staticmethod
    def candidates(held, pots):
        """Sub-goals that are sensible given held object (this is also the rule-agent fix:
        a full/cooking pot means 'get dish/soup', not 'get onion')."""
        if held == "onion":
            return ["pot"] if PotInfo.needs_onion(pots) else ["serve"]  # nothing to do -> drop it
        if held == "dish":
            return ["soup"]
        if held == "soup":
            return ["serve"]
        c = []
        if PotInfo.soup_coming(pots): c.append("dish")
        if PotInfo.needs_onion(pots): c.append("onion")
        return c or ["onion"]

    @staticmethod
    def rule(held, pots):
        return Intent.candidates(held, pots)[0]

    @staticmethod
    def confidence(q, temp=0.5):
        q = np.asarray(q, dtype=np.float64); z = np.exp((q - q.max()) / temp)
        p = z / z.sum(); s = np.sort(q)
        return float(p.max()), float(s[-1] - s[-2])

    @staticmethod
    def from_policy(q, pos, held, pots, terrain, tiles_by_kind, threshold=0.5):
        a = int(np.argmax(q)); conf, gap = Intent.confidence(q)
        cands = Intent.candidates(held, pots)
        if MOVES[a] in ("interact",) or MOVES[a] == (0, 0):
            icon = cands[0]
        else:
            nxt = (pos[0] + MOVES[a][0], pos[1] + MOVES[a][1])
            best, icon = None, None
            for c in cands:
                tile = "P" if c in ("pot", "soup") else TILE_FOR[c]
                d = Grid.dist_map(terrain, tiles_by_kind[tile])
                d0, d1 = d.get(pos, 99), d.get(nxt, d.get(pos, 99))
                delta = d0 - d1
                if best is None or delta > best: best, icon = delta, c
            if best is not None and best < 0: icon = "unsure"
        return dict(icon=icon, conf=round(conf, 3), gap=round(gap, 3), qmax=round(float(np.max(q)), 2),
                    style="solid" if conf >= threshold else "dashed", action=a)
