// The "Studio" design's behaviour: a colour per job, and the theme switch.
"use strict";

const fs = require("node:fs");
const { test } = require("@playwright/test");
const { check, iso, seed, state, importFile } = require("./helpers");

test.use({ viewport: { width: 1360, height: 900 } });

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

test("every job gets its own colour, shown everywhere and kept in backups", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // jobs from before colours existed
  await seed(page, {
    "track.jobs.v1": [{ id: "j1", text: "Smith House" }, { id: "j2", text: "Office fit-out" }],
    "track.tasks.v1": { [iso(0)]: [{ id: "a", text: "Installed blinds", job: "j1" }, { id: "b", text: "Quoted", job: "j2" }] }
  });
  await page.goto("/");

  let s = await state(page);
  check(s.jobs.every((j) => Number.isInteger(j.color)), "existing jobs are given a colour on load");
  check(s.jobs[0].color !== s.jobs[1].color, "two jobs don't share a colour");

  // a new job takes the next unused colour
  await page.fill("#newJob", "Garden shed");
  await page.fill("#newItem", "Cleared the site");
  await page.press("#newItem", "Enter");
  s = await state(page);
  check(new Set(s.jobs.map((j) => j.color)).size === 3, "a new job takes an unused colour");

  // the same colour on the pill, the entry's edge and the sidebar dot
  const colourOf = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).getPropertyValue("--job").trim());
  const pill = await colourOf('#itemList li.entry:has-text("Installed blinds") .jobpill');
  const row = await colourOf('#itemList li.entry:has-text("Installed blinds")');
  const dot = await colourOf('#jobList li[data-job="j1"] .jobdot');
  check(pill && pill === row && row === dot, `pill, entry and sidebar share the job colour (${pill} ${row} ${dot})`);

  // the sidebar dot cycles the colour, and it's saved
  const before = (await state(page)).jobs.find((j) => j.id === "j1").color;
  await page.click('#jobList li[data-job="j1"] .jobdot');
  const after = (await state(page)).jobs.find((j) => j.id === "j1").color;
  check(after === (before + 1) % 8, "clicking the dot moves to the next colour");
  check((await colourOf('#itemList li.entry:has-text("Installed blinds") .jobpill')) !== pill, "the entry picks up the new colour");

  // the Job view and Month view use it too
  await page.locator('#jobList li[data-job="j1"] .jobrow').click();
  const jobc = await page.evaluate(() => document.body.style.getPropertyValue("--jobc"));
  check(jobc === (await colourOf('#jobList li[data-job="j1"] .jobdot')), "the Job view is tinted with its job's colour");
  await page.click('#viewTabs button[data-view="month"]');
  check(await page.locator(`.mcell[data-day="${iso(0)}"] .mbar span`).count() === 3, "the month cell shows a bar segment per job");

  // a JSON backup carries the colours back
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  const json = fs.readFileSync(await dl.path(), "utf8");
  const saved = (await state(page)).jobs.map((j) => j.text + ":" + j.color).sort();
  await page.click("#clearAllBtn");
  await page.click("#clearGo");
  await importFile(page, "#importFile", { name: "b.json", mimeType: "application/json", buffer: Buffer.from(json) });
  const restored = (await state(page)).jobs.map((j) => j.text + ":" + j.color).sort();
  check(JSON.stringify(restored) === JSON.stringify(saved), "colours survive clear → re-import");

  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test.describe("theme", () => {
  test.use({ colorScheme: "light" });

  test("follows the system, and the switch pins light or dark across reloads", async ({ page }) => {
    await seed(page, {});
    await page.goto("/");
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    check(light === rgb("#f6f4ef"), "light system → light theme (" + light + ")");

    await page.click("#themeBtn"); // auto → light
    check(await page.evaluate(() => document.documentElement.dataset.theme) === "light", "first click pins light");
    await page.click("#themeBtn"); // light → dark
    check(await bg() === rgb("#131210"), "second click switches to dark");
    check((await page.getAttribute("#themeBtn", "aria-label")).startsWith("Theme: dark"), "the button says which theme is on");

    await page.reload();
    check(await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "dark survives a reload");
    check(await bg() === rgb("#131210"), "…and is painted dark");

    await page.click("#themeBtn"); // dark → auto
    check(await page.evaluate(() => document.documentElement.hasAttribute("data-theme")) === false, "third click goes back to following the system");
    check(await bg() === light, "…which is light here");
  });
});
