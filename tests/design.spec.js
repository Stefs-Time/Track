// The "Graphite" design's behaviour: a colour per job, and one look everywhere.
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

// One look everywhere: no light/dark switch, and the system setting changes nothing.
for (const scheme of ["light", "dark"]) {
  test.describe("one graphite look, on a " + scheme + " system", () => {
    test.use({ colorScheme: scheme });

    test("the same grey, with no theme switch and no leftover setting", async ({ page }) => {
      // someone who had pinned the old light theme
      await seed(page, { "track.theme.v1": "light" });
      await page.goto("/");
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check(bg === rgb("#1e2024"), "the page is graphite grey (" + bg + ")");
      check(await page.locator("#themeBtn").count() === 0, "there is no theme button");
      check(await page.evaluate(() => !document.documentElement.hasAttribute("data-theme")), "no theme is pinned on the page");
      check(await page.evaluate(() => localStorage.getItem("track.theme.v1")) === null, "the old theme setting is tidied away");
      check(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme) === "dark", "native controls (date picker, scrollbars) match");
    });
  });
}

test("the refined look: job-shaded calendar, slim empty days, doors on the totals, a greeting", async ({ page }) => {
  const T = iso(0);
  await seed(page, {
    "track.jobs.v1": [{ id: "j1", text: "Smith House", color: 0 }, { id: "j2", text: "Office fit-out", color: 1 }],
    "track.tasks.v1": { [T]: [{ id: "a", text: "One", job: "j2" }, { id: "b", text: "Two", job: "j2" }, { id: "c", text: "Three", job: "j1" }, { id: "d", text: "Four" }] }
  });
  await page.goto("/");

  // the Jobs list shows each job's share of the work
  const share = (id) => page.locator(`#jobList li[data-job="${id}"]`).evaluate((el) => el.style.getPropertyValue("--share"));
  check(await share("j2") === "100%" && await share("j1") === "50%", "job bars: the busiest is full, the others in proportion");

  // the week and month totals open those views
  await page.click("#statWeekBtn");
  check(await page.textContent("#dayTitle") === "Weekly Overview", "the This week tile opens the Week view");
  // empty days fold to a slim row; days with work keep their card
  const busy = await page.locator(`.wday[data-day="${T}"]`).boundingBox();
  const vacant = page.locator(".wday.vacant").first();
  check(await vacant.count() === 1 || await page.locator(".wday.vacant").count() > 1, "this week has empty days");
  check((await vacant.boundingBox()).height < 50 && busy.height > 100, "an empty day is one slim row; a day with work keeps its card");
  check(!(await vacant.locator(".none").isVisible()) && await vacant.locator(".wadd").isVisible(), "…with its + still there");
  await page.click('#viewTabs button[data-view="day"]');
  await page.click("#statMonthBtn");
  check(await page.textContent("#dayTitle") === "Monthly Calendar", "the This month tile opens the Month view");

  // the calendar shades a day in its busiest job's colour
  const cell = page.locator(`.mcell[data-day="${T}"]`);
  check(await cell.evaluate((el) => el.style.getPropertyValue("--job")) === "#12a37f", "today's cell takes Office fit-out's green (2 of its 4 entries)");
  const [r, g, b] = (await cell.evaluate((el) => getComputedStyle(el).backgroundColor)).match(/[\d.]+/g).map(Number);
  check(g > r && g > b, `…so it's shaded green, not the accent: rgb(${r}, ${g}, ${b})`);

  // an empty today greets you; another empty day just says so
  await page.click('#viewTabs button[data-view="day"]');
  await page.click("#clearDay");
  check(/^Good (morning|afternoon|evening) — /.test(await page.textContent("#emptyTitle")), "an empty today has a greeting: " + await page.textContent("#emptyTitle"));
  await page.click("#nextDay");
  check(await page.textContent("#emptyTitle") === "Nothing logged for this day yet", "other empty days keep the plain message");
});

test.describe("surfaces stay grey", () => {
  test.use({ colorScheme: "light" });

  test("soft surfaces are neutral, never brown", async ({ page }) => {
    const T = iso(0);
    await seed(page, {
      "track.tasks.v1": { [T]: [{ id: "a", text: "No job" }], [iso(-1)]: [{ id: "b", text: "Yesterday" }] },
      "track.recurring.v1": [{ id: "r", text: "Timesheet", days: [new Date().getDay()] }]
    });
    await page.goto("/");
    // neutral = not warm: red no stronger than blue (brown is red well above blue)
    const neutral = async (sel) => {
      const css = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);
      const n = css.match(/[\d.]+/g).map(Number);
      const [r, g, b] = css.startsWith("color(") ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n;
      return { ok: r - b <= 6 && Math.max(r, g, b) - Math.min(r, g, b) <= 20, rgb: `rgb(${r}, ${g}, ${b})` };
    };
    let c = await neutral("#dueBar");
    check(c.ok, "the Due today box is grey: " + c.rgb);
    c = await neutral("#actStrip button.hit:not(.cur)");
    check(c.ok, "activity bars are grey (only the open day is orange): " + c.rgb);
    await page.click('#viewTabs button[data-view="month"]');
    c = await neutral(`.mcell[data-day="${T}"]`);
    check(c.ok, "a calendar day with no job is shaded grey: " + c.rgb);
  });
});
