/**
 * Docket web server.
 *
 * Serves the built app (dist/) so it can be installed as a PWA, and the
 * single-file download. Docket keeps all data in the visitor's browser, so
 * there is no database, no accounts and no API here — just static files with
 * tight security headers. Made for Railway, but runs on any Node 20+ host.
 *
 * Environment:
 *   PORT  port to listen on (Railway sets this; default 3000)
 *   HOST  interface to bind (default 0.0.0.0)
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DIST = path.join(__dirname, "dist");
const PAGE = path.join(DIST, "index.html");
const { version } = require("./package.json");

if (!fs.existsSync(PAGE)) {
  console.error("dist/index.html is missing — run `npm run build` first.");
  process.exit(1);
}

/**
 * Content-Security-Policy for the page. Docket is one self-contained file with
 * a single inline <script>, so instead of allowing inline script wholesale we
 * allow exactly that script by its hash. Recomputed when the file changes, so
 * `npm run dev` rebuilds don't get blocked.
 */
let cspCache = { mtime: 0, value: "" };
function pageCsp() {
  const mtime = fs.statSync(PAGE).mtimeMs;
  if (mtime !== cspCache.mtime) {
    const html = fs.readFileSync(PAGE, "utf8");
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map((m) => `'sha256-${crypto.createHash("sha256").update(m[1]).digest("base64")}'`);
    const value = [
      "default-src 'self'",
      `script-src 'self' ${hashes.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'"
    ].join("; ");
    cspCache = { mtime, value };
  }
  return cspCache.value;
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Railway terminates TLS in front of us

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"
  });
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

/**
 * Caching and type headers for a file in dist/, shared by the precompressed
 * route and the plain static one so both send exactly the same headers.
 */
function applyHeaders(res, file) {
  const name = path.basename(file);
  if (name.endsWith(".html")) {
    res.set({ "Content-Security-Policy": pageCsp(), "Cache-Control": "no-cache" });
  } else if (name === "sw.js" || name === "manifest.webmanifest") {
    // the browser must always check these, or updates never land
    res.set("Cache-Control", "no-cache");
  } else {
    res.set("Cache-Control", "public, max-age=604800");
  }
  if (name === "manifest.webmanifest") res.type("application/manifest+json");
}

/**
 * The build writes .br and .gz copies of the text files (scripts/build.js).
 * Send one of those when the browser accepts it: the page is several times
 * smaller over the wire, and nothing is compressed per request.
 */
const ENCODINGS = [["br", ".br"], ["gzip", ".gz"]];
function servePrecompressed(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const rel = req.path === "/" ? "index.html" : req.path.slice(1);
  let file;
  try {
    file = path.join(DIST, decodeURIComponent(rel));
  } catch {
    return next();
  }
  if (!file.startsWith(DIST + path.sep)) return next(); // never leave dist/
  if (!fs.existsSync(file + ".br")) return next(); // not a compressible file
  res.vary("Accept-Encoding");
  // our order, not the header's: browsers list gzip first but accept br too
  const pick = ENCODINGS.find(([enc]) => req.acceptsEncodings(enc) === enc);
  if (!pick || !fs.existsSync(file + pick[1])) return next();
  applyHeaders(res, file);
  if (!res.get("Content-Type")) res.type(path.extname(file));
  res.set("Content-Encoding", pick[0]);
  res.sendFile(file + pick[1], (err) => { if (err && !res.headersSent) next(err); });
}

app.get("/healthz", (req, res) => {
  res.set("Cache-Control", "no-store").json({ status: "ok", version });
});

// The standalone single-file version: save it, double-click it, no install.
app.get("/download", (req, res) => {
  res.set({ "Content-Security-Policy": pageCsp(), "Cache-Control": "no-cache" });
  res.download(path.join(DIST, "Docket.html"), "Docket.html");
});

app.use(servePrecompressed);
app.use(express.static(DIST, { index: "index.html", setHeaders: applyHeaders }));

app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Docket ${version} listening on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});

// Railway sends SIGTERM on redeploy: finish in-flight requests, then exit.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

module.exports = app;
