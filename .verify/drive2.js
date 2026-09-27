const { chromium } = require("playwright-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = "D:/spinwheel";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === "/" ? "index.html" : decodeURIComponent(req.url));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(8099, r));
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const fails = [];
  const check = (cond, msg) => { console.log((cond ? "PASS" : "FAIL") + ": " + msg); if (!cond) fails.push(msg); };
  let lastAlert = null;
  page.on("dialog", d => { if (d.type() === "alert") { lastAlert = d.message(); } d.accept(); });

  await page.goto("http://127.0.0.1:8099/");
  await page.waitForTimeout(300);

  // Buka pengaturan
  await page.click("#settingsBtn");
  check(await page.locator("#settingsModal").isVisible(), "modal pengaturan terbuka");
  check(await page.locator("#groupRows .list-row").count() === 11, "11 baris kelompok awal");
  check(await page.locator("#jatahRows .list-row").count() === 4, "4 baris jatah awal");
  check(await page.locator("#matrixTable tbody tr").count() === 11, "matriks 11 baris");

  // Validasi: baris semua nol harus ditolak
  const k1Inputs = page.locator("#matrixTable tbody tr").nth(0).locator("td input[type=number]");
  for (let c = 0; c < 4; c++) await k1Inputs.nth(c).fill("0");
  check((await page.locator("#matrixTable tbody tr").nth(0).locator(".pct-total").textContent()).includes("semua 0"), "indikator 'semua 0' muncul");
  await page.click("#saveSettingsBtn");
  check(lastAlert && lastAlert.includes("Kelompok 1"), "simpan ditolak: " + lastAlert);
  check(await page.locator("#settingsModal").isVisible(), "modal tetap terbuka saat validasi gagal");
  await k1Inputs.nth(0).fill("1");

  // Edit: rename Kelompok 1 -> Tim Mawar, tambah Kelompok 12, ubah weight K12 deterministik Push Up
  await page.locator("#groupRows .list-row input").nth(0).fill("Tim Mawar");
  await page.click("#addGroupBtn");
  check(await page.locator("#matrixTable tbody tr").count() === 12, "matriks jadi 12 baris setelah tambah");
  const k12Inputs = page.locator("#matrixTable tbody tr").nth(11).locator("td input[type=number]");
  await k12Inputs.nth(0).fill("0");
  await k12Inputs.nth(1).fill("0");
  await k12Inputs.nth(2).fill("0");
  await k12Inputs.nth(3).fill("5");
  const pct12 = await page.locator("#matrixTable tbody tr").nth(11).locator(".pct").nth(3).textContent();
  check(pct12 === "100%", "persentase live K12 = " + pct12);
  // Edit jatah: rename item pertama
  await page.locator("#jatahRows .list-row input").nth(0).fill("Makan roti +");
  check((await page.locator("#matrixTable thead th").nth(1).textContent()) === "Makan roti +", "header matriks ikut berubah live");

  await page.screenshot({ path: "shot-settings.png" });
  await page.click("#saveSettingsBtn");
  check(!(await page.locator("#settingsModal").isVisible()), "modal tertutup setelah simpan");
  check((await page.locator("#stSisa").textContent()) === "12/12", "status 12/12 setelah tambah kelompok");

  // Persistensi setelah reload
  await page.reload();
  await page.waitForTimeout(300);
  check((await page.locator("#stSisa").textContent()) === "12/12", "persisten setelah reload: 12/12");
  await page.click("#settingsBtn");
  check((await page.locator("#groupRows .list-row input").nth(0).inputValue()) === "Tim Mawar", "rename tersimpan");
  check((await page.locator("#jatahRows .list-row input").nth(0).inputValue()) === "Makan roti +", "rename jatah tersimpan");
  const savedK12 = page.locator("#matrixTable tbody tr").nth(11).locator("td input[type=number]");
  check((await savedK12.nth(3).inputValue()) === "5", "weight K12 tersimpan");
  await page.click("#closeSettingsBtn");

  // Spin satu putaran penuh: pastikan flow tetap jalan dengan config custom
  check(await page.locator("#spinJatah").isDisabled(), "SPIN JATAH masih terkunci sebelum Roda 1");
  await page.click("#spinKelompok");
  await page.waitForFunction(() => document.getElementById("stAktif").textContent !== "—", null, { timeout: 20000 });
  await page.click("#spinJatah");
  await page.waitForFunction(() => document.querySelectorAll("#historyBody tr:not(.empty-row)").length === 1, null, { timeout: 20000 });
  const row1 = (await page.locator("#historyBody tr").nth(0).textContent()).trim();
  check(/Tim Mawar|Makan roti \+|Kelompok|Push Up/.test(row1), "riwayat terisi: " + row1);
  await page.screenshot({ path: "shot-custom-session.png" });

  // Factory reset
  await page.click("#settingsBtn");
  await page.click("#factoryResetBtn"); // dialog accept
  check((await page.locator("#groupRows .list-row").count()) === 11, "factory reset: 11 kelompok");
  await page.click("#closeSettingsBtn");
  check((await page.locator("#stSisa").textContent()) === "11/11", "factory reset: status 11/11");

  await browser.close();
  server.close();
  console.log(fails.length ? "GAGAL: " + fails.join(" | ") : "SEMUA CEK UI LULUS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("ERROR:", e.message); server.close(); process.exit(1); });
