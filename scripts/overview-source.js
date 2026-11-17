/**
 * The source of "Docket at a glance" (the features-and-roadmap pages): its
 * markup in src/index.html and its styles in src/styles.css, each between
 * "overview:start" and "overview:end" markers, plus the version it shows.
 *
 * `npm run overview` prints those pages to src/overview/Docket-Overview.pdf
 * and records this hash beside it. The build warns, and a test fails, when
 * the pages have changed since — so the PDF people download always matches
 * what the app shows.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const PDF = path.join(ROOT, "src", "overview", "Docket-Overview.pdf");
const STAMP = path.join(ROOT, "src", "overview", "source.sha256");

function between(file, start, end) {
  const text = fs.readFileSync(path.join(ROOT, "src", file), "utf8");
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  if (a === -1 || b === -1) throw new Error(`overview: markers ${start} … ${end} not found in src/${file}`);
  return text.slice(a, b + end.length);
}

/** Hash of everything that decides what the overview PDF looks like. */
function overviewHash() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return crypto.createHash("sha256")
    .update(version + "\n")
    .update(between("index.html", "<!-- overview:start", "<!-- overview:end -->") + "\n")
    .update(between("styles.css", "/* overview:start", "/* overview:end */"))
    .digest("hex");
}

/** The hash the current PDF was made from, or "" if there is none. */
function recordedHash() {
  return fs.existsSync(STAMP) ? fs.readFileSync(STAMP, "utf8").trim() : "";
}

module.exports = { PDF, STAMP, overviewHash, recordedHash };
