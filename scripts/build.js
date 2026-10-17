#!/usr/bin/env node
/**
 * Build Docket into dist/.
 *
 * The app is authored as src/index.html + src/styles.css + src/app.js so it
 * is easy to work on, but it ships as ONE self-contained HTML file: that is
 * what makes the double-click, no-install download work. This script inlines
 * the stylesheet and script back into the page and writes:
 *
 *   dist/index.html            the page the server (and installed app) serves
 *   dist/Docket.html           the same file, named for the standalone download
 *   dist/manifest.webmanifest  PWA manifest
 *   dist/sw.js                 service worker, stamped with a build id so a
 *                              new release replaces the old offline cache
 *   dist/icons/*               app icons
 *
 * Usage: node scripts/build.js [--watch]
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function read(file) {
  return fs.readFileSync(path.join(SRC, file), "utf8");
}

/** Replace exactly one occurrence of `needle`, failing loudly otherwise. */
function replaceOnce(haystack, needle, replacement, label) {
  const first = haystack.indexOf(needle);
  if (first === -1 || haystack.indexOf(needle, first + 1) !== -1) {
    throw new Error(`build: expected exactly one ${label} in src/index.html`);
  }
  // slice rather than String.replace, so "$&" etc. in the code stay literal
  return haystack.slice(0, first) + replacement + haystack.slice(first + needle.length);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, name), path.join(to, name));
  }
}

function build() {
  const started = Date.now();
  const css = read("styles.css");
  const js = read("app.js").split("__APP_VERSION__").join(pkg.version);
  if (/<\/script/i.test(js)) throw new Error("build: app.js must not contain a closing script tag");
  if (/<\/style/i.test(css)) throw new Error("build: styles.css must not contain a closing style tag");

  let html = read("index.html");
  html = replaceOnce(html, '<link rel="stylesheet" href="styles.css">', `<style>\n${css}</style>`, "stylesheet link");
  html = replaceOnce(html, '<script src="app.js"></script>', `<script>\n${js}</script>`, "app.js script tag");

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, "index.html"), html);
  fs.writeFileSync(path.join(DIST, "Docket.html"), html);

  if (fs.existsSync(path.join(SRC, "manifest.webmanifest"))) {
    fs.copyFileSync(path.join(SRC, "manifest.webmanifest"), path.join(DIST, "manifest.webmanifest"));
  }
  copyDir(path.join(SRC, "icons"), path.join(DIST, "icons"));
  if (fs.existsSync(path.join(SRC, "sw.js"))) {
    const buildId = pkg.version + "-" + crypto.createHash("sha256").update(html).digest("hex").slice(0, 10);
    fs.writeFileSync(path.join(DIST, "sw.js"), read("sw.js").split("__BUILD_ID__").join(buildId));
  }

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`build: dist/ written (Docket ${pkg.version}, ${kb} KB page) in ${Date.now() - started} ms`);
}

build();

if (process.argv.includes("--watch")) {
  let timer = null;
  console.log("build: watching src/ for changes");
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { build(); } catch (err) { console.error(err.message); }
    }, 80);
  });
}
