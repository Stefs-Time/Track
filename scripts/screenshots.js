#!/usr/bin/env node
/**
 * Regenerate the README screenshots in docs/screenshots/ from the built app,
 * using realistic sample data dated around today. Run after `npm run build`:
 *
 *   npm run screenshots
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const APP = pathToFileURL(path.join(ROOT, "dist", "Docket.html")).href;

function iso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function sampleData() {
  const jobs = [
    { id: "j1", text: "Smith House" },
    { id: "j2", text: "Office fit-out" },
    { id: "j3", text: "Garden shed" }
  ];
  const plan = [
    [0, "Installed blinds, lounge", "j1"], [0, "Measured kitchen windows", "j1"], [0, "Quoted new office fit-out", "j2"], [0, "Admin and emails"],
    [-1, "Site visit and photos", "j2"], [-1, "Ordered fabric samples", "j1"], [-1, "Invoices"],
    [-2, "Fitted shutters, main bedroom", "j1"], [-2, "Collected deposit", "j1"],
    [-3, "Base frame and floor", "j3"], [-3, "Timesheet"],
    [-6, "Survey and measure", "j2"], [-7, "Initial consultation", "j1"], [-9, "Cleared the site", "j3"],
    [-10, "Supplier meeting", "j2"], [-13, "Quote approved", "j1"]
  ];
  const tasks = {};
  plan.forEach(([d, text, job], i) => {
    const day = iso(d);
    (tasks[day] = tasks[day] || []).push(Object.assign({ id: "e" + i, text }, job ? { job } : {}));
  });
  return {
    "track.helpseen.v1": "1",
    "track.jobs.v1": JSON.stringify(jobs),
    "track.tasks.v1": JSON.stringify(tasks),
    "track.wishlist.v1": JSON.stringify([{ id: "w1", text: "Order paint", job: "j1" }, { id: "w2", text: "Book electrician", job: "j2" }, { id: "w3", text: "Renew insurance" }]),
    "track.recurring.v1": JSON.stringify([{ id: "r1", text: "Timesheet" }, { id: "r2", text: "Site safety check", job: "j2" }])
  };
}

async function shoot(browser, name, viewport, steps, colorScheme = "light") {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme });
  await page.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, sampleData());
  await page.goto(APP);
  if (steps) await steps(page);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(600); // let entrance animations settle
  await page.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 85 });
  await page.close();
  console.log("screenshots: " + name);
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist", "Docket.html"))) {
    console.error("Run `npm run build` first.");
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const desk = { width: 1600, height: 900 };
  await shoot(browser, "day.jpg", desk, async (p) => {
    await p.fill("#newJob", "Smith House");
    await p.locator("#newJob").blur();
  });
  await shoot(browser, "job.jpg", desk, (p) => p.locator("#jobList li", { hasText: "Smith House" }).locator(".jobrow").click());
  await shoot(browser, "month.jpg", desk, (p) => p.click('#viewTabs button[data-view="month"]'));
  await shoot(browser, "phone-dark.jpg", { width: 390, height: 844 }, null, "dark");
  await browser.close();
})();
