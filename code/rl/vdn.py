"""Value-Decomposition Network: one shared Q-net, Q_tot = Q0 + Q1, double-DQN target."""
import json, random
from collections import deque
import numpy as np
import torch
import torch.nn as nn
from . import config as C


class QNet(nn.Module):
    def __init__(self, obs_dim, hidden=C.NET["hidden"], actions=C.NET["actions"]):
        super().__init__()
        self.body = nn.Sequential(nn.Linear(obs_dim, hidden), nn.ReLU(),
                                  nn.Linear(hidden, hidden), nn.ReLU(),
                                  nn.Linear(hidden, actions))

    def forward(self, x):
        return self.body(x)


class Replay:
    def __init__(self, cap):
        self.data = deque(maxlen=cap)

    def add(self, *t):
        self.data.append(t)

    def sample(self, n):
        cols = zip(*random.sample(self.data, n))
        return [torch.as_tensor(np.asarray(c), dtype=torch.float32) for c in cols]

    def __len__(self):
        return len(self.data)


class VDN:
    def __init__(self, obs_dim):
        self.q, self.tq = QNet(obs_dim), QNet(obs_dim)
        self.tq.load_state_dict(self.q.state_dict())
        self.opt = torch.optim.Adam(self.q.parameters(), lr=C.OPT["lr"])
        self.buf = Replay(C.OPT["buffer"])

    def act(self, obs, eps):
        if random.random() < eps:
            return random.randrange(C.NET["actions"])
        with torch.no_grad():
            return int(self.q(torch.as_tensor(obs)[None]).argmax())

    def learn(self):
        if len(self.buf) < C.OPT["batch"]:
            return None
        o0, o1, a0, a1, r, n0, n1, d = self.buf.sample(C.OPT["batch"])
        q = self.q(o0).gather(1, a0.long()[:, None]) + self.q(o1).gather(1, a1.long()[:, None])
        with torch.no_grad():
            nxt = sum(self.tq(n).gather(1, self.q(n).argmax(1, keepdim=True)) for n in (n0, n1))
            target = r[:, None] + (1 - d[:, None]) * C.OPT["gamma"] * nxt
        loss = nn.functional.smooth_l1_loss(q, target)
        self.opt.zero_grad(); loss.backward()
        nn.utils.clip_grad_norm_(self.q.parameters(), C.OPT["clip"])
        self.opt.step()
        Target.soft(self.tq, self.q, C.OPT["tau"])
        return loss.item()


class Target:
    @staticmethod
    def soft(tgt, src, tau):
        with torch.no_grad():
            for t, s in zip(tgt.parameters(), src.parameters()):
                t.mul_(1 - tau).add_(tau * s)

    @staticmethod
    def hard(tgt, src):
        tgt.load_state_dict(src.state_dict())


class Checkpoint:
    @staticmethod
    def save(net, path_pt, path_json, meta):
        torch.save(net.state_dict(), path_pt)
        layers = [m for m in net.body if isinstance(m, nn.Linear)]
        js = {"meta": meta, "layers": [{"W": m.weight.detach().numpy().round(5).tolist(),
                                         "b": m.bias.detach().numpy().round(5).tolist()} for m in layers]}
        with open(path_json, "w") as f:
            json.dump(js, f)

    @staticmethod
    def load(path_pt, obs_dim):
        net = QNet(obs_dim); net.load_state_dict(torch.load(path_pt)); net.eval()
        return net
