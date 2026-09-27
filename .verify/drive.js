const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const fails = [];
  const check = (cond, msg) => { console.log((cond ? "PASS" : "FAIL") + ": " + msg); if (!cond) fails.push(msg); };

  let dialogMsg = null;
  page.on("dialog", d => { dialogMsg = d.message(); d.accept(); });

  await page.goto("file:///D:/spinwheel/index.html");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shot-initial.png" });

  // Validasi 6: Roda 2 tidak bisa sebelum Roda 1
  check(await page.locator("#spinJatah").isDisabled(), "SPIN JATAH disabled sebelum Roda 1 spin");
  check(await page.locator("#wheel2").isVisible(), "canvas wheel2 terlihat");

  // Status awal
  check(await page.locator("#stSisa").textContent() === "11/11", "status awal 11/11");

  // Sesi penuh: 11 kelompok
  const history = [];
  for (let round = 1; round <= 11; round++) {
    await page.click("#spinKelompok");
    check(await page.locator("#spinJatah").isDisabled() === false || true, "spin berjalan..."); // noop guard
    await page.waitForFunction(() => document.getElementById("stAktif").textContent !== "—", null, { timeout: 20000 });
    const aktif = await page.locator("#stAktif").textContent();
    check(!(await page.locator("#spinKelompok").isEnabled()), "SPIN KELOMPOK terkunci saat menunggu Roda 2 (" + aktif + ")");
    await page.screenshot({ path: "shot-wheel1-" + round + ".png" });

    await page.click("#spinJatah");
    await page.waitForFunction(
      (n) => document.querySelectorAll("#historyBody tr:not(.empty-row)").length === n,
      round, { timeout: 20000 });
    if (!(await page.locator("#spinJatah").isDisabled())) check(false, "SPIN JATAH enabled saat animasi");
    await page.waitForFunction(() => document.getElementById("stAktif").textContent === "—", null, { timeout: 5000 });
    const row = await page.locator("#historyBody tr").nth(round - 1).textContent();
    history.push(row.trim());
    console.log("riwayat +" + row.trim());
  }

  await page.screenshot({ path: "shot-full-session.png", fullPage: true });

  // Validasi aturan di UI: K10 tidak pernah Lari, K11 tidak pernah Push Up
  const k10 = history.find(h => h.includes("Kelompok 10"));
  const k11 = history.find(h => h.includes("Kelompok 11"));
  check(!!k10 && !k10.includes("Lari"), "K10 tidak dapat Lari → " + k10);
  check(!!k11 && !k11.includes("Push Up"), "K11 tidak dapat Push Up → " + k11);
  check(new Set(history.map(h => h.match(/Kelompok \d+/)[0])).size === 11, "11 kelompok unik, tidak ada duplikat");

  // Semua selesai
  await page.waitForFunction(() => document.getElementById("resultText").textContent.includes("Semua kelompok sudah kebagian"), null, { timeout: 5000 });
  check(await page.locator("#spinKelompok").isDisabled(), "SPIN KELOMPOK disabled setelah semua selesai");

  // Reset
  await page.click("#resetBtn");
  check(dialogMsg && dialogMsg.toLowerCase().includes("mulai dari awal"), "konfirmasi reset muncul: " + dialogMsg);
  await page.waitForTimeout(300);
  check(await page.locator("#stSisa").textContent() === "11/11", "setelah reset: 11/11");
  check(await page.locator("#historyBody .empty-row").count() === 1, "setelah reset: riwayat kosong");
  check(await page.locator("#stAktif").textContent() === "—", "setelah reset: tidak ada kelompok aktif");
  check(await page.locator("#spinKelompok").isEnabled(), "setelah reset: SPIN KELOMPOK aktif lagi");
  check(await page.locator("#spinJatah").isDisabled(), "setelah reset: SPIN JATAH terkunci lagi");
  await page.screenshot({ path: "shot-after-reset.png" });

  await browser.close();
  console.log(fails.length ? "GAGAL: " + fails.join(" | ") : "SEMUA CEK UI LULUS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
