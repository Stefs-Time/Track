// "Docket at a glance": every feature and the roadmap, in the app and as a
// downloadable PDF. The PDF is made from the same pages by `npm run overview`;
// one check here makes sure it was re-made after the pages last changed.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("@playwright/test");
const { check, seed } = require("./helpers");
const { overviewHash, recordedHash } = require("../scripts/overview-source");

const { version } = require("../package.json");
const FILE_APP = pathToFileURL(path.join(__dirname, "..", "dist", "Docket.html")).href;
test.use({ viewport: { width: 1360, height: 900 } });

test("the downloadable PDF is up to date with the pages in the app", () => {
  check(recordedHash() === overviewHash(),
    "src/overview/Docket-Overview.pdf was made from the current overview — if not, run `npm run overview`");
  const pdf = fs.readFileSync(path.join(__dirname, "..", "src", "overview", "Docket-Overview.pdf"));
  check(pdf.subarray(0, 5).toString() === "%PDF-", "it is a PDF");
  check((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length === 4, "of four pages");
});

test("open it from the header or the guide, read it, and download the PDF", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, {});
  await page.goto("/");
  await page.click("#overviewBtn");
  check(await page.isVisible("#overviewOverlay .modal"), "the ✦ button opens Docket at a glance");
  check(await page.evaluate(() => document.activeElement.id) === "ovDownload", "…with Download PDF ready");
  const ov = page.locator("#overview");
  check(await ov.locator(".ov-page").count() === 4, "four pages: cover, two of features, roadmap");
  check(await ov.locator(".ov-kicker .ov-ver").textContent() === "v" + version, "the cover shows this version");
  check(await ov.locator(".ov-feats li").count() === 20, "twenty features");
  check(JSON.stringify(await ov.locator(".ov-stage").allTextContents()) === JSON.stringify(["Now", "Next", "Later"]), "a Now / Next / Later roadmap");
  check(await ov.locator(".ov-col li").count() === 11, "with its eleven plans");

  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#ovDownload")]);
  check(dl.suggestedFilename() === "Docket-Overview.pdf", "Download PDF saves Docket-Overview.pdf");
  const got = fs.readFileSync(await dl.path());
  check(got.subarray(0, 5).toString() === "%PDF-" && got.length > 100000, "a real PDF (" + got.length + " bytes)");
  check((await page.textContent("#toast")).includes("downloaded"), "a message says it's done");

  await page.keyboard.press("Escape");
  check(!(await page.isVisible("#overviewOverlay .modal")), "Esc closes it");
  check(await page.evaluate(() => document.activeElement.id) === "overviewBtn", "…focus back on the ✦ button");

  await page.click("#helpBtn");
  await page.click("#helpOverview");
  check(!(await page.isVisible("#helpOverlay .modal")) && await page.isVisible("#overviewOverlay .modal"), "the guide's Features & roadmap opens it too");
  await page.click("#ovClose");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("the server sends the PDF fresh on every release", async ({ request }) => {
  const res = await request.get("/Docket-Overview.pdf");
  check(res.status() === 200 && res.headers()["content-type"] === "application/pdf", "served as a PDF");
  check(res.headers()["cache-control"] === "no-cache", "and always re-checked, since its name never changes");
});

test("with no PDF to fetch, it prints the same pages instead", async ({ page }) => {
  await seed(page, {});
  await page.route("**/Docket-Overview.pdf", (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await page.evaluate(() => { window.printed = 0; window.print = () => { window.printed++; }; });
  await page.click("#overviewBtn");
  await page.click("#ovDownload");
  await page.waitForFunction(() => window.printed === 1);
  check(await page.evaluate(() => document.body.classList.contains("print-overview")), "unreachable PDF: the print dialog opens on the overview");
  check((await page.textContent("#toast")).includes("Save as PDF"), "…saying how to keep it as a PDF");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  check(!(await page.evaluate(() => document.body.classList.contains("print-overview"))), "afterwards the page is back to normal");
});

test("the single file prints it, one A4 page per section, nothing cut off", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("track.helpseen.v1", "1"));
  await page.goto(FILE_APP);
  await page.evaluate(() => { window.printed = 0; window.print = () => { window.printed++; }; });
  await page.click("#overviewBtn");
  await page.click("#ovDownload");
  check(await page.evaluate(() => window.printed) === 1, "opened as a file, Download PDF prints (there's no server to fetch from)");

  await page.emulateMedia({ media: "print" });
  check(!(await page.isVisible(".app")) && !(await page.isVisible(".mast")) && !(await page.isVisible(".ovhead")), "on paper: only the pages, no app and no dialog bar");
  const pages = await page.$$eval(".ov-page", (els) => els.map((e) => [Math.round(e.getBoundingClientRect().height), e.scrollHeight - e.clientHeight]));
  check(pages.length === 4 && pages.every(([h]) => Math.abs(h - 1123) <= 1), "each section is one A4 page: " + JSON.stringify(pages));
  check(pages.every(([, extra]) => extra <= 1), "nothing runs off the bottom of a page");
  check(await page.evaluate(() => getComputedStyle(document.querySelector(".ovmodal")).animationName) === "none", "no fade-in to print half-transparent");

  // Ctrl+P with the overview open prints the overview, not a report
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  check(await page.evaluate(() => document.body.classList.contains("print-overview") && !document.body.classList.contains("print-report")), "Ctrl+P prints the overview while it's open");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
});
