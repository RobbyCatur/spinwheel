"use strict";
const { buildDefaultConfig, normalizeConfig, weightsFor, weightedPick, DEFAULT_JATAH } = require("./app.js");

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
}

// Config bawaan berbasis id
const cfg = buildDefaultConfig();
assert(cfg.groups.length === 11 && cfg.jatah.length === 4, "default: 11 kelompok, 4 jatah");
assert(cfg.groups[0].id === "g1" && cfg.groups[0].name === "Kelompok 1", "grup punya id & name");
assert(weightsFor(cfg, "g10").join() === "1,1,1,1", "default g10: semua weight 1");
assert(weightsFor(cfg, "g11").join() === "1,1,1,1", "default g11: semua weight 1");
assert(cfg.groups.every(g => weightsFor(cfg, g.id).every(v => v >= 1)), "tidak ada weight 0 di default");
assert(cfg.autoDelete.wheel1 === true && cfg.autoDelete.wheel2 === true, "autoDelete default ON dua-duanya");

// Migrasi config lama (array of strings, weights by name)
{
  const legacy = {
    groups: ["Kelompok 1", "Kelompok 2"],
    jatah: ["A", "B"],
    weights: { "Kelompok 2": [0, 5] },
  };
  const n = normalizeConfig(legacy);
  assert(n.groups[0].id === "g1" && n.groups[1].id === "g2", "legacy: id dibuat berurutan");
  assert(weightsFor(n, "g2").join() === "0,5", "legacy: weights by nama terpetakan ke id");
  assert(weightsFor(n, "g1").join() === "1,1", "legacy: tanpa weights → default 1");
}

// Nama duplikat DIPERBOLEHKAN
{
  const n = normalizeConfig({
    groups: [{ id: "a", name: "Tim A" }, { id: "b", name: "Tim A" }, { id: "c", name: "Tim A" }],
    jatah: [{ id: "j1", name: "X" }, { id: "j2", name: "X" }],
    weights: { a: [1, 2], b: [3, 1], c: [1, 1] },
  });
  assert(n.groups.length === 3, "3 kelompok bernama sama dipertahankan");
  assert(n.jatah.length === 2, "2 jatah bernama sama dipertahankan");
  assert(weightsFor(n, "b").join() === "3,1", "weights per-id tetap beda meski nama sama");
}

// id duplikat / hilang → diperbaiki
{
  const n = normalizeConfig({
    groups: [{ id: "x", name: "A" }, { id: "x", name: "B" }],
    jatah: [{ id: "j", name: "Q" }],
  });
  assert(n.groups[0].id !== n.groups[1].id, "id duplikat digantikan id baru");
}

// autoDelete false dipertahankan, string bukan boolean → default true
{
  const n = normalizeConfig({ groups: ["A"], jatah: ["X"], autoDelete: { wheel1: false, wheel2: false } });
  assert(n.autoDelete.wheel1 === false && n.autoDelete.wheel2 === false, "autoDelete false tersimpan");
  const n2 = normalizeConfig({ groups: ["A"], jatah: ["X"], autoDelete: { wheel1: "abc" } });
  assert(n2.autoDelete.wheel1 === true, "nilai aneh → default true");
}

// Perbaikan umum
assert(normalizeConfig(null).groups.length === 11, "null → default");
{
  const n = normalizeConfig({ groups: ["A"], jatah: ["X", "Y", "Z"], weights: { A: [1] } });
  assert(weightsFor(n, "g1").join() === "1,1,1", "row pendek di-pad dengan 1");
  const n2 = normalizeConfig({ groups: ["A"], jatah: ["X", "Y"], weights: { g1: [5, -3, 9] } });
  assert(weightsFor(n2, "g1").join() === "5,0", "negatif → 0, kolom berlebih dibuang");
  const n3 = normalizeConfig({ groups: ["A"], jatah: ["X", "Y"], weights: { g1: [0, 0] } });
  assert(weightsFor(n3, "g1").join() === "1,1", "row semua nol → dipulihkan ke 1");
}

// weightedPick
{
  let threw = false;
  try { weightedPick([0, 0, 0, 0]); } catch (e) { threw = true; }
  assert(threw, "weightedPick([0,0,0,0]) harus error");
}

// Sesi penuh: wheel1 autoDelete ON, wheel2 autoDelete ON dengan refill pool
for (let trial = 0; trial < 300; trial++) {
  const c = buildDefaultConfig();
  let remaining = c.groups.map(g => g.id);
  let pool = c.jatah.map(j => j.id);
  const history = [];
  while (remaining.length > 0) {
    const gid = remaining[weightedPick(remaining.map(() => 1))];
    remaining = remaining.filter(x => x !== gid);
    if (pool.length === 0) pool = c.jatah.map(j => j.id);
    const row = weightsFor(c, gid);
    let poolWeights = pool.map(id => row[c.jatah.findIndex(j => j.id === id)]);
    if (poolWeights.reduce((a, b) => a + b, 0) <= 0) {
      pool = c.jatah.map(j => j.id);
      poolWeights = pool.map(id => row[c.jatah.findIndex(j => j.id === id)]);
    }
    const winId = pool[weightedPick(poolWeights)];
    pool = pool.filter(x => x !== winId);
    history.push({ group: gid, jatah: c.jatah.find(j => j.id === winId).name });
  }
  assert(history.length === 11, "sesi selesai 11 entri");
  assert(new Set(history.map(h => h.group)).size === 11, "tanpa duplikat kelompok");
}

// Default = 1 semua; namun 0 tetap boleh diisi dan tidak akan pernah terpilih
{
  const c = normalizeConfig({
    groups: ["Kelompok 1", "Kelompok 10"],
    jatah: ["Makan roti", "Minum susu", "Lari", "Push Up"],
    weights: { "Kelompok 10": [1, 1, 0, 1] },
  });
  assert(weightsFor(c, "g1").join() === "1,1,1,1", "default kelompok lain tetap 1 semua");
  assert(weightsFor(c, "g2").join() === "1,1,0,1", "weight 0 diterima dan tersimpan apa adanya");
  for (let i = 0; i < 100000; i++) assert(weightedPick(weightsFor(c, "g2")) !== 2, "Kelompok 10 dapat Lari!");
}

// Sesi dengan wheel1 autoDelete OFF: kelompok bisa terpilih berulang, riwayat tetap bertambah
{
  const c = normalizeConfig({ groups: ["A", "B"], jatah: ["X", "Y"], autoDelete: { wheel1: false, wheel2: false } });
  const history = [];
  for (let i = 0; i < 6; i++) {
    const gid = c.groups[weightedPick(c.groups.map(() => 1))].id;
    const row = weightsFor(c, gid);
    history.push({ group: gid, jatah: c.jatah[weightedPick(row)].name });
  }
  assert(history.length === 6, "mode tanpa auto delete: spin terus berjalan");
}

console.log(process.exitCode ? "ADA TEST GAGAL" : "SEMUA TEST LULUS");
