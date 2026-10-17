/**
 * Shared helpers for Docket's end-to-end tests.
 *
 * The suites read like a user-acceptance script: one long, realistic flow per
 * file, with a named `check` at every step. Checks are soft assertions, so a
 * run reports every failing step by name instead of stopping at the first.
 */
"use strict";

const { expect } = require("@playwright/test");

/** A named, non-fatal assertion. */
function check(cond, message) {
  expect.soft(Boolean(cond), message).toBe(true);
}

/** Local YYYY-MM-DD for today, offset by `days`. */
function iso(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/**
 * Seed localStorage before the app's first load only. The flag lives in
 * localStorage too (sessionStorage isn't reliably kept across reloads), so a
 * reload after the app clears its data doesn't re-seed it.
 */
async function seed(page, stores) {
  await page.addInitScript((s) => {
    if (localStorage.getItem("test.seeded")) return;
    localStorage.setItem("test.seeded", "1");
    localStorage.setItem("track.helpseen.v1", "1");
    for (const [key, value] of Object.entries(s)) localStorage.setItem(key, JSON.stringify(value));
  }, stores);
}

/** Read every Docket store back out of localStorage. */
function state(page) {
  return page.evaluate(() => {
    const get = (k, d) => JSON.parse(localStorage.getItem(k) || d);
    return {
      tasks: get("track.tasks.v1", "{}"),
      jobs: get("track.jobs.v1", "[]"),
      wish: get("track.wishlist.v1", "[]"),
      rec: get("track.recurring.v1", "[]")
    };
  });
}

/** Feed a file to one of the hidden import inputs and wait for the result. */
async function importFile(page, selector, file) {
  await page.evaluate(() => { document.getElementById("toast").textContent = ""; });
  await page.setInputFiles(selector, file);
  await page.waitForFunction(() => /Imported|Nothing|empty|failed/.test(document.getElementById("toast").textContent));
}

module.exports = { check, iso, seed, state, importFile };
