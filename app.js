"use strict";

const DEFAULT_JATAH = ["Makan roti", "Minum susu", "Lari", "Push Up"];
const DEFAULT_GROUPS = Array.from({ length: 11 }, (_, i) => "Kelompok " + (i + 1));

function uid(prefix, taken) {
  let n = 1;
  while (taken.has(prefix + n)) n++;
  return prefix + n;
}

function buildDefaultConfig() {
  const groups = DEFAULT_GROUPS.map((name, i) => ({ id: "g" + (i + 1), name }));
  const jatah = DEFAULT_JATAH.map((name, i) => ({ id: "j" + (i + 1), name }));
  const weights = {};
  groups.forEach(g => { weights[g.id] = [1, 1, 1, 1]; });
  weights["g10"] = [1, 1, 0, 1];
  weights["g11"] = [1, 1, 1, 0];
  return { groups, jatah, weights, autoDelete: { wheel1: true, wheel2: true } };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") return buildDefaultConfig();

  const cleanItems = (list, prefix, fallbackName) => {
    const out = [];
    const taken = new Set();
    (Array.isArray(list) ? list : []).forEach(item => {
      let id = null, name = "";
      if (typeof item === "string") { name = item.trim(); }
      else if (item && typeof item === "object") {
        name = String(item.name == null ? "" : item.name).trim();
        id = item.id != null ? String(item.id) : null;
      }
      if (!name) name = fallbackName + (out.length + 1);
      if (!id || out.some(x => x.id === id)) id = uid(prefix, taken);
      taken.add(id);
      out.push({ id, name });
    });
    return out;
  };

  const groups = cleanItems(raw.groups, "g", "Kelompok ");
  const jatah = cleanItems(raw.jatah, "j", "Jatah ");
  if (groups.length === 0 || jatah.length === 0) return buildDefaultConfig();

  const rawWeights = raw.weights && typeof raw.weights === "object" ? raw.weights : {};
  const weights = {};
  for (const g of groups) {
    let row = rawWeights[g.id];
    if (!Array.isArray(row) && rawWeights[g.name] !== undefined) row = rawWeights[g.name];
    row = Array.isArray(row)
      ? row.map(v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; })
      : [];
    while (row.length < jatah.length) row.push(1);
    row = row.slice(0, jatah.length);
    if (row.every(v => v === 0)) row = jatah.map(() => 1);
    weights[g.id] = row;
  }

  const ad = raw.autoDelete && typeof raw.autoDelete === "object" ? raw.autoDelete : {};
  return {
    groups, jatah, weights,
    autoDelete: {
      wheel1: ad.wheel1 !== false,
      wheel2: ad.wheel2 !== false,
    },
  };
}

function weightsFor(config, groupId) {
  return config.weights[groupId] || config.jatah.map(() => 1);
}

function weightedPick(weights, rng) {
  const random = rng || Math.random;
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error("Semua weight nol. Tidak ada hasil yang mungkin.");
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildDefaultConfig, normalizeConfig, weightsFor, weightedPick, DEFAULT_GROUPS, DEFAULT_JATAH };
}

if (typeof document !== "undefined") {
  init();
}

function init() {
  const STORAGE_KEY = "spinwheel.config.v2";
  const LEGACY_KEY = "spinwheel.config.v1";
  const COLORS1 = ["#0e8b7a", "#17a88f", "#0a6e60", "#2a9d8f", "#12b0a0", "#3cb8a0"];
  const COLORS2 = ["#e4572e", "#f4a52a", "#d1495b", "#e76f51", "#c23f17", "#f9a03f"];

  let config = loadConfig();
  const state = {
    remainingGroups: config.groups.map(g => g.id),
    remainingJatah: config.jatah.map(j => j.id),
    activeGroupId: null,
    history: [],
    spinning: false,
  };

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      return normalizeConfig(JSON.parse(raw));
    } catch (e) {
      return buildDefaultConfig();
    }
  }

  function persistConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  const groupById = id => config.groups.find(g => g.id === id) || null;
  const jatahById = id => config.jatah.find(j => j.id === id) || null;
  const groupName = id => (groupById(id) || { name: "?" }).name;
  const jatahName = id => (jatahById(id) || { name: "?" }).name;

  const wheels = {
    wheel1: makeWheel(document.getElementById("wheel1"), COLORS1),
    wheel2: makeWheel(document.getElementById("wheel2"), COLORS2),
  };

  const spinKelompok = document.getElementById("spinKelompok");
  const spinJatah = document.getElementById("spinJatah");
  const hint1 = document.getElementById("hint1");
  const hint2 = document.getElementById("hint2");
  const resultBanner = document.getElementById("resultBanner");
  const resultText = document.getElementById("resultText");
  const resultPopup = document.getElementById("resultPopup");
  const resultPopupText = document.getElementById("resultPopupText");

  function makeWheel(canvas, palette) {
    const SIZE = 800;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    let rotation = 0;
    let labels = [];

    function draw() {
      const n = Math.max(labels.length, 1);
      const cx = SIZE / 2, cy = SIZE / 2, R = SIZE / 2 - 12;
      const sector = (Math.PI * 2) / n;
      ctx.clearRect(0, 0, SIZE, SIZE);

      if (labels.length === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = "#efe3cd";
        ctx.fill();
      }
      for (let i = 0; i < labels.length; i++) {
        const a0 = rotation + i * sector;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a0 + sector);
        ctx.closePath();
        ctx.fillStyle = palette[i % palette.length];
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.35)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 8;
      ctx.stroke();

      if (labels.length === 0) return;
      const maxLen = Math.max(...labels.map(l => l.length), 1);
      const fontSize = Math.max(14, Math.min(40, sector * R * 0.62, (R * 0.78) / maxLen * 1.75));
      ctx.fillStyle = "#fff";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = "700 " + fontSize + "px 'Segoe UI', sans-serif";
      for (let i = 0; i < labels.length; i++) {
        const mid = rotation + (i + 0.5) * sector;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(mid);
        ctx.fillText(labels[i], R * 0.9, 0);
        ctx.restore();
      }
    }

    const IDLE_SPEED = 0.22; // rad/detik, rotasi pelan tanpa batas
    let busy = false;
    let lastT = performance.now();
    function idleFrame(now) {
      if (!busy) {
        rotation += IDLE_SPEED * Math.min(now - lastT, 100) / 1000;
        draw();
      }
      lastT = now;
      requestAnimationFrame(idleFrame);
    }
    requestAnimationFrame(idleFrame);

    return {
      setLabels(next) { labels = next; draw(); },
      spinTo(winnerIndex, turns, onDone) {
        busy = true;
        const n = labels.length;
        const sector = (Math.PI * 2) / n;
        const pointer = -Math.PI / 2;
        const jitter = (Math.random() - 0.5) * sector * 0.7;
        const targetMod = ((pointer - (winnerIndex + 0.5) * sector - jitter) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const current = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let delta = targetMod - current;
        if (delta < 0) delta += Math.PI * 2;
        const start = rotation;
        const total = turns * Math.PI * 2 + delta;
        const duration = 4200 + Math.random() * 800;
        const t0 = performance.now();
        function frame(now) {
          const t = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          rotation = start + total * eased;
          draw();
          if (t < 1) requestAnimationFrame(frame);
          else { busy = false; onDone(); }
        }
        requestAnimationFrame(frame);
      },
    };
  }

  function visibleJatahIds() {
    return config.autoDelete.wheel2 ? state.remainingJatah.slice() : config.jatah.map(j => j.id);
  }

  function setLabelsForWheel1() {
    wheels.wheel1.setLabels(state.remainingGroups.map(groupName));
  }

  function setLabelsForWheel2() {
    wheels.wheel2.setLabels(visibleJatahIds().map(jatahName));
  }

  function resetSession() {
    state.remainingGroups = config.groups.map(g => g.id);
    state.remainingJatah = config.jatah.map(j => j.id);
    state.activeGroupId = null;
    state.history = [];
    state.spinning = false;
  }

  function refreshUI() {
    document.getElementById("stSisa").textContent = state.remainingGroups.length + "/" + config.groups.length;
    document.getElementById("stSelesai").textContent = String(state.history.length);
    document.getElementById("stAktif").textContent = state.activeGroupId ? groupName(state.activeGroupId) : "-";
    document.getElementById("stJatah").textContent = state.history.length ? state.history[state.history.length - 1].jatah : "-";

    const finished = state.remainingGroups.length === 0 && !state.activeGroupId;
    const phase = finished ? "done" : state.activeGroupId ? "jatah" : "kelompok";
    document.getElementById("step1").className = "step" + (phase === "kelompok" ? " is-current" : " is-done");
    document.getElementById("step2").className = "step" + (phase === "jatah" ? " is-current" : finished ? " is-done" : "");
    document.getElementById("step3").className = "step" + (finished ? " is-current" : "");
    document.getElementById("card1").classList.toggle("is-live", phase === "kelompok" && !state.spinning);
    document.getElementById("card2").classList.toggle("is-live", phase === "jatah" && !state.spinning);

    spinKelompok.disabled = state.spinning || state.remainingGroups.length === 0 || state.activeGroupId !== null;
    spinJatah.disabled = state.spinning || state.activeGroupId === null || visibleJatahIds().length === 0;

    const jatahLeftNote = config.autoDelete.wheel2 ? " Sisa jatah: " + state.remainingJatah.length + "/" + config.jatah.length + "." : "";
    if (finished) {
      hint1.textContent = "Semua kelompok sudah kebagian.";
      hint2.textContent = "Mau sesi lagi? Tekan MULAI DARI AWAL.";
      resultBanner.hidden = false;
      resultText.textContent = "Semua kelompok sudah kebagian jatah!";
    } else if (state.spinning) {
      hint1.textContent = "Rodanya masih berputar...";
      hint2.textContent = "Rodanya masih berputar...";
    } else if (state.activeGroupId === null) {
      hint1.textContent = "Tekan tombolnya. Roda putar, hasilnya jujur.";
      hint2.textContent = "Tunggu Roda 1 menentukan kelompok." + jatahLeftNote;
    } else {
      hint1.textContent = "Sudah terpilih. Sekarang giliran Roda 2.";
      hint2.textContent = groupName(state.activeGroupId) + " siap. Mau dapat apa hari ini?" + jatahLeftNote;
    }

    const body = document.getElementById("historyBody");
    if (state.history.length === 0) {
      body.innerHTML = '<tr class="empty-row"><td colspan="3">Belum ada yang diputar. Mulai dari Roda 1!</td></tr>';
    } else {
      body.innerHTML = state.history.map((h, i) =>
        "<tr><td>" + (i + 1) + "</td><td>" + escapeHtml(h.group) + "</td><td>" + escapeHtml(h.jatah) + "</td></tr>"
      ).join("");
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showResultPopup(text) {
    resultPopupText.textContent = text;
    resultPopup.hidden = false;
  }

  function closeResultPopup() {
    if (resultPopup.hidden) return;
    resultPopup.hidden = true;
    refreshUI();
    if (state.activeGroupId === null && state.remainingGroups.length > 0 && !state.spinning) {
      resultBanner.hidden = true;
    }
  }

  resultPopup.addEventListener("click", e => { if (e.target === resultPopup) closeResultPopup(); });
  document.getElementById("resultCloseBtn").addEventListener("click", closeResultPopup);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeResultPopup(); });

  spinKelompok.addEventListener("click", () => {
    if (state.spinning || state.remainingGroups.length === 0 || state.activeGroupId !== null) return;
    state.spinning = true;
    resultBanner.hidden = true;
    refreshUI();
    const winnerIdx = weightedPick(state.remainingGroups.map(() => 1));
    wheels.wheel1.spinTo(winnerIdx, 5 + Math.floor(Math.random() * 3), () => {
      state.activeGroupId = state.remainingGroups[winnerIdx];
      if (config.autoDelete.wheel1) state.remainingGroups.splice(winnerIdx, 1);
      state.spinning = false;
      setLabelsForWheel1();
      setLabelsForWheel2();
      refreshUI();
      showResultPopup(groupName(state.activeGroupId) + " terpilih!");
    });
  });

  spinJatah.addEventListener("click", () => {
    if (state.spinning || state.activeGroupId === null) return;
    const row = weightsFor(config, state.activeGroupId);
    let pool = visibleJatahIds();
    let poolWeights = pool.map(id => row[config.jatah.findIndex(j => j.id === id)]);
    if (poolWeights.reduce((a, b) => a + b, 0) <= 0) {
      state.remainingJatah = config.jatah.map(j => j.id);
      pool = visibleJatahIds();
      poolWeights = pool.map(id => row[config.jatah.findIndex(j => j.id === id)]);
    }
    state.spinning = true;
    refreshUI();
    const winnerIdx = weightedPick(poolWeights);
    const winnerId = pool[winnerIdx];
    wheels.wheel2.spinTo(winnerIdx, 6 + Math.floor(Math.random() * 3), () => {
      if (config.autoDelete.wheel2) {
        const at = state.remainingJatah.indexOf(winnerId);
        if (at >= 0) state.remainingJatah.splice(at, 1);
      }
      state.history.push({ group: groupName(state.activeGroupId), jatah: jatahName(winnerId) });
      state.activeGroupId = null;
      state.spinning = false;
      setLabelsForWheel2();
      refreshUI();
      showResultPopup(state.history[state.history.length - 1].group + " dapat: " + jatahName(winnerId));
      launchConfetti();
    });
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Yakin mau mulai dari awal? Riwayat sesi ini terhapus, daftar dan peluang tetap tersimpan.")) return;
    resetSession();
    resultBanner.hidden = true;
    resultPopup.hidden = true;
    setLabelsForWheel1();
    setLabelsForWheel2();
    refreshUI();
  });

  /* ---------------- Modal pengaturan ---------------- */

  const modal = document.getElementById("settingsModal");
  const groupRowsEl = document.getElementById("groupRows");
  const jatahRowsEl = document.getElementById("jatahRows");
  const matrixEl = document.getElementById("matrixTable");
  const ad1El = document.getElementById("autoDelete1");
  const ad2El = document.getElementById("autoDelete2");
  let draft = null;

  document.getElementById("settingsBtn").addEventListener("click", () => {
    if (state.spinning) { alert("Tunggu roda sampai berhenti."); return; }
    openDraft();
    renderSettings();
    modal.hidden = false;
  });
  document.getElementById("closeSettingsBtn").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });

  function openDraft() {
    draft = {
      groups: config.groups.map(g => ({ id: g.id, name: g.name })),
      jatah: config.jatah.map(j => ({ id: j.id, name: j.name })),
      weights: config.groups.map(g => weightsFor(config, g.id).slice()),
      autoDelete: { wheel1: config.autoDelete.wheel1, wheel2: config.autoDelete.wheel2 },
    };
  }

  function renderSettings() {
    groupRowsEl.innerHTML = "";
    draft.groups.forEach((row, i) => {
      const div = document.createElement("div");
      div.className = "list-row";
      const input = document.createElement("input");
      input.type = "text";
      input.value = row.name;
      input.placeholder = "Nama kelompok";
      input.addEventListener("input", () => { row.name = input.value; renderMatrixNames(); });
      const del = document.createElement("button");
      del.className = "row-remove";
      del.textContent = "x";
      del.title = "Hapus";
      del.addEventListener("click", () => {
        draft.groups.splice(i, 1);
        draft.weights.splice(i, 1);
        renderSettings();
      });
      div.append(input, del);
      groupRowsEl.appendChild(div);
    });

    jatahRowsEl.innerHTML = "";
    draft.jatah.forEach((row, i) => {
      const div = document.createElement("div");
      div.className = "list-row";
      const input = document.createElement("input");
      input.type = "text";
      input.value = row.name;
      input.placeholder = "Nama jatah";
      input.addEventListener("input", () => { row.name = input.value; renderMatrixHeaders(); });
      const del = document.createElement("button");
      del.className = "row-remove";
      del.textContent = "x";
      del.title = "Hapus";
      del.addEventListener("click", () => {
        draft.jatah.splice(i, 1);
        draft.weights.forEach(w => w.splice(i, 1));
        renderSettings();
      });
      div.append(input, del);
      jatahRowsEl.appendChild(div);
    });

    ad1El.checked = draft.autoDelete.wheel1;
    ad2El.checked = draft.autoDelete.wheel2;
    renderMatrix();
  }

  ad1El.addEventListener("change", () => { draft.autoDelete.wheel1 = ad1El.checked; });
  ad2El.addEventListener("change", () => { draft.autoDelete.wheel2 = ad2El.checked; });

  document.getElementById("addGroupBtn").addEventListener("click", () => {
    const taken = new Set(draft.groups.map(g => g.id));
    draft.groups.push({ id: uid("g", taken), name: "Kelompok " + (draft.groups.length + 1) });
    draft.weights.push(draft.jatah.map(() => 1));
    renderSettings();
  });

  document.getElementById("addJatahBtn").addEventListener("click", () => {
    const taken = new Set(draft.jatah.map(j => j.id));
    draft.jatah.push({ id: uid("j", taken), name: "Jatah baru" });
    draft.weights.forEach(w => w.push(1));
    renderSettings();
  });

  function renderMatrixHeaders() {
    const ths = matrixEl.querySelectorAll("thead th[data-col]");
    ths.forEach(th => { th.textContent = draft.jatah[Number(th.dataset.col)].name || "-"; });
  }

  function renderMatrixNames() {
    const cells = matrixEl.querySelectorAll("tbody td.row-name");
    cells.forEach((td, i) => { if (draft.groups[i]) td.textContent = draft.groups[i].name || "-"; });
  }

  function renderMatrix() {
    matrixEl.innerHTML = "";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "Kelompok";
    headRow.appendChild(corner);
    draft.jatah.forEach((j, ci) => {
      const th = document.createElement("th");
      th.dataset.col = ci;
      th.textContent = j.name || "-";
      headRow.appendChild(th);
    });
    const totalTh = document.createElement("th");
    totalTh.textContent = "Total";
    headRow.appendChild(totalTh);
    thead.appendChild(headRow);
    matrixEl.appendChild(thead);

    const tbody = document.createElement("tbody");
    draft.groups.forEach((g, ri) => {
      const tr = document.createElement("tr");
      const nameTd = document.createElement("td");
      nameTd.className = "row-name";
      nameTd.textContent = g.name || "-";
      tr.appendChild(nameTd);
      draft.jatah.forEach((j, ci) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "any";
        input.value = draft.weights[ri][ci];
        const pct = document.createElement("span");
        pct.className = "pct";
        input.addEventListener("input", () => {
          const v = Number(input.value);
          draft.weights[ri][ci] = Number.isFinite(v) && v >= 0 ? v : 0;
          updateRowPct(ri);
        });
        td.append(input, pct);
        tr.appendChild(td);
      });
      const totalTd = document.createElement("td");
      totalTd.className = "pct-total";
      tr.appendChild(totalTd);
      tbody.appendChild(tr);
    });
    matrixEl.appendChild(tbody);
    draft.groups.forEach((_, ri) => updateRowPct(ri));
  }

  function updateRowPct(ri) {
    const row = draft.weights[ri];
    const sum = row.reduce((a, b) => a + b, 0);
    const tr = matrixEl.querySelectorAll("tbody tr")[ri];
    if (!tr) return;
    tr.querySelectorAll("td .pct").forEach((span, ci) => {
      span.textContent = sum > 0 ? (row[ci] / sum * 100).toFixed(1).replace(/\.0$/, "") + "%" : "-";
    });
    const totalTd = tr.querySelector(".pct-total");
    if (totalTd) totalTd.textContent = sum > 0 ? "OK" : "Perhatian: semua 0";
  }

  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    const names = draft.groups.map(g => g.name.trim());
    const jnames = draft.jatah.map(j => j.name.trim());
    if (names.length === 0) return alert("Daftar kelompok tidak boleh kosong.");
    if (jnames.length === 0) return alert("Daftar jatah tidak boleh kosong.");
    if (names.some(n => !n)) return alert("Ada nama kelompok yang kosong.");
    if (jnames.some(n => !n)) return alert("Ada nama jatah yang kosong.");
    const zeroRows = draft.weights
      .map((row, i) => ({ row, i }))
      .filter(x => x.row.reduce((a, b) => a + b, 0) <= 0)
      .map(x => names[x.i]);
    if (zeroRows.length > 0) return alert("Peluang tidak valid untuk: " + zeroRows.join(", ") + ". Minimal satu weight harus > 0.");

    const newGroups = draft.groups.map((g, i) => ({ id: g.id, name: names[i] }));
    const newJatah = draft.jatah.map((j, i) => ({ id: j.id, name: jnames[i] }));
    const prevG = new Set(config.groups.map(g => g.id));
    const prevJ = new Set(config.jatah.map(j => j.id));
    const newWeights = {};
    newGroups.forEach((g, i) => { newWeights[g.id] = draft.weights[i].slice(); });
    config = normalizeConfig({
      groups: newGroups, jatah: newJatah, weights: newWeights,
      autoDelete: { wheel1: draft.autoDelete.wheel1, wheel2: draft.autoDelete.wheel2 },
    });
    persistConfig();

    const validG = new Set(config.groups.map(g => g.id));
    const validJ = new Set(config.jatah.map(j => j.id));
    state.remainingGroups = state.remainingGroups.filter(id => validG.has(id));
    state.remainingJatah = state.remainingJatah.filter(id => validJ.has(id));
    config.groups.forEach(g => { if (!prevG.has(g.id)) state.remainingGroups.push(g.id); });
    config.jatah.forEach(j => { if (!prevJ.has(j.id)) state.remainingJatah.push(j.id); });
    if (state.activeGroupId && !validG.has(state.activeGroupId)) state.activeGroupId = null;

    setLabelsForWheel1();
    setLabelsForWheel2();
    refreshUI();
    modal.hidden = true;
  });

  document.getElementById("factoryResetBtn").addEventListener("click", () => {
    if (!confirm("Kembalikan daftar kelompok, jatah, dan peluang ke bawaan? Riwayat sesi ikut terhapus.")) return;
    config = buildDefaultConfig();
    persistConfig();
    resetSession();
    resultBanner.hidden = true;
    openDraft();
    renderSettings();
    setLabelsForWheel1();
    setLabelsForWheel2();
    refreshUI();
  });

  setLabelsForWheel2();
  setLabelsForWheel1();
  refreshUI();

  function launchConfetti() {
    const canvas = document.getElementById("confetti");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ["#e4572e", "#f4a52a", "#0e8b7a", "#d1495b", "#17a88f", "#c23f17", "#fffdf8"];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 3,
      vy: 2.5 + Math.random() * 3.5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    function frame(now) {
      const t = now - t0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < 3200) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }
}

