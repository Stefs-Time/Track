#!/usr/bin/env node
/**
 * Print "Docket at a glance" (features and roadmap) to a PDF:
 *
 *   npm run overview
 *
 * It opens the built app, opens the overview, and prints its pages exactly
 * as a person's print dialog would, to src/overview/Docket-Overview.pdf.
 * The build ships that file beside the page, and the app's Download PDF
 * button serves it. Run this whenever the overview's markup or styles change,
 * or the version does (the cover shows it) — a test checks.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");
const { PDF, STAMP, overviewHash } = require("./overview-source");

const APP = pathToFileURL(path.resolve(__dirname, "..", "dist", "Docket.html")).href;

(async () => {
  if (!fs.existsSync(new URL(APP))) {
    console.error("Run `npm run build` first.");
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.addInitScript(() => localStorage.setItem("track.helpseen.v1", "1"));
  await page.goto(APP);
  await page.click("#overviewBtn");
  await page.evaluate(async () => {
    document.title = "Docket at a glance — features and roadmap";
    window.dispatchEvent(new Event("beforeprint")); // as printing does: fits each page to its sheet
    await document.fonts.ready;
  });
  await page.emulateMedia({ media: "print" });
  // every page must fit on its sheet: nothing cut off at the bottom
  const over = await page.$$eval(".ov-page", (pages) => pages
    .map((p, i) => [i + 1, p.scrollHeight - p.clientHeight])
    .filter(([, extra]) => extra > 1));
  if (over.length) {
    console.error("overview: content runs off the page — " + over.map(([n, px]) => `page ${n} by ${px}px`).join(", "));
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(PDF), { recursive: true });
  await page.pdf({ path: PDF, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  fs.writeFileSync(STAMP, overviewHash() + "\n");
  await browser.close();
  console.log(`overview: ${path.relative(process.cwd(), PDF)} written (${(fs.statSync(PDF).size / 1024).toFixed(0)} KB)`);
})();
