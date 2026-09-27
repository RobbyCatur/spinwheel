"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8001;
const ROOT = __dirname;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bat": "text/plain; charset=utf-8",
};

const BLOCKED = /^\/(\.|server\.js$|package(-lock)?\.json$|test\.js$|.*\.bat$)/i;

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (urlPath === "/") urlPath = "/index.html";
  if (BLOCKED.test(urlPath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 — tidak ditemukan");
    return;
  }

  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 — tidak ditemukan");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log("Roda Jatah berjalan di:");
  console.log("  http://localhost:" + PORT);
  console.log("Tekan Ctrl+C untuk berhenti.");
});
