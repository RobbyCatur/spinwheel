const { chromium } = require("playwright-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = "D:/spinwheel";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === "/" ? "index.html" : decodeURIComponent(req.url));
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(8099, r));
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const fails = [];
  const check = (c, msg) => { console.log((c ? "PASS" : "FAIL") + ": " + msg); if (!c) fails.push(msg); };
  let lastAlert = null;
  page.on("dialog", d => { if (d.type() === "alert") lastAlert = d.message(); d.accept(); });

  await page.goto("http://127.0.0.1:8099/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);

  // 1. Nama duplikat diterima
  await page.click("#settingsBtn");
  await page.click("#addGroupBtn");
  await page.locator("#groupRows .list-row input").nth(11).fill("Kelompok 1");
  await page.click("#saveSettingsBtn");
  check(lastAlert === null, "nama duplikat diterima tanpa alert (alert=" + lastAlert + ")");
  check(!(await page.locator("#settingsModal").isVisible()), "modal tertutup setelah simpan");
  check((await page.locator("#stSisa").textContent()) === "12/12", "status 12/12 dengan dua 'Kelompok 1'");

  // 2. Persisten setelah reload
  await page.reload(); await page.waitForTimeout(300);
  check((await page.locator("#stSisa").textContent()) === "12/12", "persisten setelah reload: 12/12");

  // 3. Toggle Roda 1 OFF → kelompok tidak dihapus setelah spin
  await page.click("#settingsBtn");
  await page.locator(".switch-row").nth(0).click();
  await page.click("#saveSettingsBtn");
  await page.click("#spinKelompok");
  await page.waitForFunction(() => document.getElementById("stAktif").textContent !== "—", null, { timeout: 20000 });
  await page.click("#spinJatah");
  await page.waitForFunction(() => document.querySelectorAll("#historyBody tr:not(.empty-row)").length === 1, null, { timeout: 20000 });
  check((await page.locator("#stSisa").textContent()) === "12/12", "roda1 OFF: sisa tetap 12/12 setelah menang");
  check((await page.locator("#hint2").textContent()).includes("Sisa jatah: 3/4"), "roda2 ON default: hint 'Sisa jatah: 3/4'");

  // 4. Toggle Roda 1 ON lagi → terhapus seperti biasa
  await page.click("#settingsBtn");
  await page.locator(".switch-row").nth(0).click();
  await page.click("#saveSettingsBtn");
  await page.click("#spinKelompok");
  await page.waitForFunction(() => document.getElementById("stAktif").textContent !== "—", null, { timeout: 20000 });
  check((await page.locator("#stSisa").textContent()) === "11/12", "roda1 ON: sisa berkurang jadi 11/12");
  await page.click("#spinJatah");
  await page.waitForFunction(() => document.querySelectorAll("#historyBody tr:not(.empty-row)").length === 2, null, { timeout: 20000 });
  check((await page.locator("#hint2").textContent()).includes("Sisa jatah: 2/4"), "pool jatah menyusut: 'Sisa jatah: 2/4'");

  // 5. Roda 2 OFF → label selalu 4, tidak menyusut
  await page.click("#settingsBtn");
  await page.locator(".switch-row").nth(1).click();
  await page.click("#saveSettingsBtn");
  await page.click("#spinKelompok");
  await page.waitForFunction(() => document.getElementById("stAktif").textContent !== "—", null, { timeout: 20000 });
  await page.click("#spinJatah");
  await page.waitForFunction(() => document.querySelectorAll("#historyBody tr:not(.empty-row)").length === 3, null, { timeout: 20000 });
  check(!(await page.locator("#hint2").textContent()).includes("Sisa jatah"), "roda2 OFF: tidak ada catatan sisa jatah");

  // 6. Migrasi config legacy v1 (array string, weights by nama)
  await page.evaluate(() => {
    localStorage.clear();
    const legacy = {
      groups: ["Kelompok 1", "Kelompok 2", "Kelompok 10"],
      jatah: ["Makan roti", "Minum susu", "Lari", "Push Up"],
      weights: { "Kelompok 10": [1, 1, 0, 1] },
    };
    localStorage.setItem("spinwheel.config.v1", JSON.stringify(legacy));
  });
  await page.reload(); await page.waitForTimeout(300);
  check((await page.locator("#stSisa").textContent()) === "3/3", "legacy v1 dimigrasi: 3 kelompok");
  await page.click("#settingsBtn");
  const k10row = await page.locator("#matrixTable tbody tr").nth(2).locator("td input[type=number]").nth(2).inputValue();
  check(k10row === "0", "legacy weights 'Kelompok 10' terpetakan (Lari=0)");
  await page.click("#closeSettingsBtn");

  await page.screenshot({ path: "shot-dup-toggle.png" });
  await browser.close();
  server.close();
  console.log(fails.length ? "GAGAL: " + fails.join(" | ") : "SEMUA CEK UI LULUS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("ERROR:", e.message); server.close(); process.exit(1); });
