// node code/rl/validate_kai.js : JS featurizer + MLP vs Python on recorded states
const fs = require("fs"), path = require("path"), R = path.join(__dirname, "..", "..");
const K = require(path.join(R, "web/kai.js")).load(JSON.parse(fs.readFileSync(path.join(R, "web/data/kai_net.json"))));
const recs = JSON.parse(fs.readFileSync(path.join(R, "code/results/kai_validate.json")));
let fMax = 0, fBad = 0, qMax = 0, qmaxMax = 0, argOk = 0, n = 0;
for (const r of recs) {
  const F = K.featurize(r.state);
  for (const i of [0, 1]) {
    const d = Math.max(...F[i].map((v, k) => Math.abs(v - r.feats[i][k]))); fMax = Math.max(fMax, d); if (d > 0) fBad++;
    const q = K.forward(r.feats[i]), qj = K.forward(F[i]);
    qMax = Math.max(qMax, ...qj.map((v, k) => Math.abs(v - r.q[i][k])));
    const am = a => a.indexOf(Math.max(...a)); if (am(qj) === am(r.q[i])) argOk++;
    qmaxMax = Math.max(qmaxMax, Math.abs(Math.max(...qj) - Math.max(...r.q[i]))); n++;
  }
}
const out = {states: recs.length, agent_evals: n, feature_max_abs_diff: fMax, feature_mismatched_vectors: fBad, q_max_abs_diff: qMax, qmax_max_abs_diff: qmaxMax, argmax_agree: `${argOk}/${n}`};
console.log(JSON.stringify(out));
fs.writeFileSync(path.join(R, "code/results/kai_validate_report.json"), JSON.stringify(out, null, 1));
