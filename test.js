"use strict";
const { buildDefaultConfig, normalizeConfig, weightsFor, weightedPick, DEFAULT_GROUPS, DEFAULT_JATAH } = require("./app.js");

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
}

// Config bawaan
const cfg = buildDefaultConfig();
assert(cfg.groups.length === 11 && cfg.jatah.length === 4, "default: 11 kelompok, 4 jatah");
assert(weightsFor(cfg, "Kelompok 10").join() === "1,1,0,1", "default K10: Lari weight 0");
assert(weightsFor(cfg, "Kelompok 11").join() === "1,1,1,0", "default K11: Push Up weight 0");
assert(weightsFor(cfg, "Kelompok 3").join() === "1,1,1,1", "default K3: semua boleh");
assert(weightsFor(cfg, "tidak ada").join() === "1,1,1,1", "kelompok tanpa row → semua 1");

// normalizeConfig memperbaiki config rusak
assert(normalizeConfig(null).groups.length === 11, "null → default");
assert(normalizeConfig({}).groups.length === 11, "{} → default");
assert(normalizeConfig({ groups: ["A", "A", "", "B"], jatah: ["X"], weights: { A: [0] } }).groups.join() === "A,B", "duplikat & kosong dibuang");
{
  const n = normalizeConfig({ groups: ["A"], jatah: ["X", "Y", "Z"], weights: { A: [1] } });
  assert(n.weights.A.join() === "1,1,1", "row pendek di-pad dengan 1");
}
{
  const n = normalizeConfig({ groups: ["A"], jatah: ["X", "Y"], weights: { A: [5, -3, 9] } });
  assert(n.weights.A.join() === "5,0", "negatif → 0, kolom berlebih dibuang");
}
{
  const n = normalizeConfig({ groups: ["A"], jatah: ["X", "Y"], weights: { A: [0, 0] } });
  assert(n.weights.A.join() === "1,1", "row semua nol → dipulihkan ke 1");
}

// weightedPick dengan matriks custom
{
  const custom = normalizeConfig({ groups: ["Tim Alpha", "Tim Beta"], jatah: ["A", "B", "C"], weights: { "Tim Alpha": [0, 0, 10], "Tim Beta": [1, 0, 0] } });
  for (let i = 0; i < 10000; i++) {
    assert(weightedPick(weightsFor(custom, "Tim Alpha")) === 2, "Tim Alpha harus selalu C");
    assert(weightedPick(weightsFor(custom, "Tim Beta")) === 0, "Tim Beta harus selalu A");
  }
}

// Distribusi probabilitas
function dist(weights, n) {
  const c = weights.map(() => 0);
  for (let i = 0; i < n; i++) c[weightedPick(weights)]++;
  return c.map(x => x / n);
}
const d = dist(weightsFor(cfg, "Kelompok 10"), 100000);
assert(d[2] === 0 && Math.abs(d[0] - 1/3) < 0.01 && Math.abs(d[3] - 1/3) < 0.01, "distribusi K10 ~33/33/0/33: " + d);
const d2 = dist([2, 1, 1, 0], 100000);
assert(Math.abs(d2[0] - 0.5) < 0.01 && Math.abs(d2[1] - 0.25) < 0.01 && d2[3] === 0, "weight 2:1:1:0 → 50/25/25/0: " + d2);

// Sesi penuh dengan config kustom: 5 kelompok, salah satu deterministik
for (let trial = 0; trial < 200; trial++) {
  const c = normalizeConfig({ groups: ["K1", "K2", "K3", "K4", "K5"], jatah: DEFAULT_JATAH, weights: { K5: [0, 0, 0, 1] } });
  let remaining = c.groups.slice();
  const history = [];
  while (remaining.length > 0) {
    const gi = weightedPick(remaining.map(() => 1));
    const group = remaining[gi];
    remaining.splice(gi, 1);
    history.push({ group, jatah: c.jatah[weightedPick(weightsFor(c, group))] });
  }
  assert(history.length === 5 && new Set(history.map(h => h.group)).size === 5, "sesi kustom: 5 unik");
  assert(history.find(h => h.group === "K5").jatah === "Push Up", "K5 deterministik Push Up");
}

// weightedPick menolak semua-zero
let threw = false;
try { weightedPick([0, 0, 0, 0]); } catch (e) { threw = true; }
assert(threw, "weightedPick([0,0,0,0]) harus error");

console.log(process.exitCode ? "ADA TEST GAGAL" : "SEMUA TEST LULUS");
