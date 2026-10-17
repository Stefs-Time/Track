// Entries can be moved between days, edited from every view that lists them,
// linked to a job by dragging, and the Month view shows the jobs per day.
"use strict";

const { test, devices } = require("@playwright/test");
const { check, iso, seed, state } = require("./helpers");

// Dates relative to this week, so the suite passes whatever day it runs.
const T = iso(0);
const dow = (new Date().getDay() + 6) % 7; // 0 = Monday
const WS = iso(-dow);
const W = T === WS ? iso(-dow + 1) : WS; // another day in this week
const P = new Date().getDate() > 1 ? iso(-1) : iso(1); // another day in this month
const F = iso(3);

function seedData() {
  const tasks = {};
  const add = (day, e) => { (tasks[day] = tasks[day] || []).push(e); };
  add(T, { id: "A", text: "Installed blinds", job: "j1" });
  add(T, { id: "B", text: "Admin and emails" });
  add(W, { id: "C", text: "Quoted fit-out", job: "j2" });
  add(W, { id: "D", text: "Measured windows", job: "j1" });
  add(P, { id: "E", text: "Site visit" });
  return {
    "track.jobs.v1": [{ id: "j1", text: "Smith House" }, { id: "j2", text: "Office fit-out" }],
    "track.tasks.v1": tasks,
    "track.wishlist.v1": [{ id: "w1", text: "Order paint" }],
    "track.recurring.v1": [{ id: "r1", text: "Timesheet" }]
  };
}
const dayOf = (s, id) => Object.keys(s.tasks).find((d) => s.tasks[d].some((e) => e.id === id));
const entry = (s, id) => Object.values(s.tasks).flat().find((e) => e.id === id);

test.use({ viewport: { width: 1360, height: 900 } });

test("move, edit anywhere, drag to a job, jobs in the month", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, seedData());
  await page.goto("/");

  // 1. Drag an entry onto another day in Recent days, then Undo
  await page.locator("#itemList li.entry", { hasText: "Installed blinds" })
    .dragTo(page.locator(`#dayList button.dayrow[data-day="${P}"]`));
  let s = await state(page);
  check(dayOf(s, "A") === P, "drag onto a Recent day moves the entry there");
  check((await page.textContent("#toast")).includes("Moved to"), "move says where it went");
  await page.click("#toast .undo");
  s = await state(page);
  check(dayOf(s, "A") === T && s.tasks[T][0].id === "A", "Undo puts it back in its old place");

  // 2. Move with the editor's date field; a blank date keeps the day
  const rowB = page.locator("#itemList li.entry", { hasText: "Admin and emails" });
  await rowB.hover();
  await rowB.locator(".icon.edit").click();
  check(await page.inputValue("li.editing input.edate") === T, "editor shows the entry's date");
  await page.fill("li.editing input.edate", F);
  await page.click("li.editing .save");
  s = await state(page);
  check(dayOf(s, "B") === F, "changing the date moves the entry");
  check(await page.locator("#itemList li.entry", { hasText: "Admin and emails" }).count() === 0, "it leaves the open day");
  const rowA = page.locator("#itemList li.entry", { hasText: "Installed blinds" });
  await rowA.hover();
  await rowA.locator(".icon.edit").click();
  await page.fill("li.editing input.edate", "");
  await page.click("li.editing .save");
  s = await state(page);
  check(dayOf(s, "A") === T, "a cleared date doesn't move or lose the entry");

  // 3. Week view: edit, delete + Undo, drag between days
  await page.keyboard.press("w");
  const wCard = page.locator(`.wday[data-day="${W}"]`);
  const rowD = wCard.locator("li.mini", { hasText: "Measured windows" });
  await rowD.hover();
  await rowD.locator(".icon.edit").click();
  check(await wCard.locator("li.editing").count() === 1, "editor opens inside the Week card");
  await wCard.locator("li.editing > input").first().fill("Measured all windows");
  await wCard.locator("li.editing > input").first().press("Enter");
  s = await state(page);
  check(entry(s, "D").text === "Measured all windows", "Week view edit saves");
  const rowC = wCard.locator("li.mini", { hasText: "Quoted fit-out" });
  await rowC.hover();
  await rowC.locator(".icon.del").click();
  s = await state(page);
  check(!entry(s, "C"), "Week view delete removes it");
  await page.click("#toast .undo");
  s = await state(page);
  check(entry(s, "C") && dayOf(s, "C") === W, "Undo restores it");
  await wCard.locator("li.mini", { hasText: "Measured all windows" })
    .dragTo(page.locator(`.wday[data-day="${T}"]`));
  s = await state(page);
  check(dayOf(s, "D") === T, "drag between Week cards moves the entry");

  // 4. Job view: edit an entry's job (it leaves the view), delete + Undo
  await page.locator('#jobList li[data-job="j1"] .jobrow').click();
  check(await page.locator("#jobView li.mini").count() === 2, "Job view lists both Smith House entries");
  const jA = page.locator("#jobView li.mini", { hasText: "Installed blinds" });
  await jA.hover();
  await jA.locator(".icon.edit").click();
  await page.fill("#jobView li.editing .jobwrap input", "Office fit-out");
  await page.click("#jobView li.editing .save");
  s = await state(page);
  check(entry(s, "A").job === "j2", "Job view edit changes the job");
  check(await page.locator("#jobView li.mini", { hasText: "Installed blinds" }).count() === 0, "…and it leaves this job's view");
  const jD = page.locator("#jobView li.mini", { hasText: "Measured all windows" });
  await jD.hover();
  await jD.locator(".icon.del").click();
  check(!entry(await state(page), "D"), "Job view delete removes it");
  await page.click("#toast .undo");
  check(entry(await state(page), "D"), "Undo restores it");

  // 5. Drag onto a job links it: wishlist, recurring (onto the Job view), entry
  await page.locator("#wishList li", { hasText: "Order paint" })
    .dragTo(page.locator('#jobList li[data-job="j2"]'));
  s = await state(page);
  check(s.wish[0].job === "j2", "wishlist item dropped on a job is linked");
  check((await page.textContent("#toast")).includes("Linked to"), "link is confirmed");
  await page.click("#toast .undo");
  check(!(await state(page)).wish[0].job, "Undo unlinks it");
  await page.locator("#recList li", { hasText: "Timesheet" }).dragTo(page.locator("#jobView"));
  check((await state(page)).rec[0].job === "j1", "recurring item dropped on the open Job view joins that job");
  await page.keyboard.press("d");
  await page.locator("#itemList li.entry", { hasText: "Installed blinds" })
    .dragTo(page.locator('#jobList li[data-job="j1"]'));
  check(entry(await state(page), "A").job === "j1", "entry dropped on a job is relinked");
  await page.locator("#itemList li.entry", { hasText: "Installed blinds" })
    .dragTo(page.locator('#jobList li[data-job="j1"]'));
  check((await page.textContent("#toast")).includes("Already on"), "dropping on its own job says so");

  // 6. Month view shows the day's jobs, busiest first
  await page.fill("#newJob", "Office fit-out");
  await page.fill("#newItem", "Quick call");
  await page.press("#newItem", "Enter");
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("m");
  const cell = page.locator(`.mcell[data-day="${T}"]`);
  check((await cell.locator(".mjobs .jn").textContent()) === "Smith House", "busiest job named first");
  check((await cell.locator(".mjobs .jm").textContent()) === "+1", "other jobs counted");
  const tip = await cell.getAttribute("data-tip");
  check(tip.includes("Smith House 2") && tip.includes("Office fit-out 1"), "tooltip breaks the day down by job: " + tip);

  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

// a touch phone; the preset's browser choice is dropped (it can't change per group)
const { defaultBrowserType, ...phone } = devices["Pixel 7"]; // eslint-disable-line no-unused-vars

test.describe("on a phone", () => {
  test.use(phone);

  test("editor and list actions fit and stay reachable without hover", async ({ page }) => {
    await seed(page, seedData());
    await page.goto("/");
    const rowB = page.locator("#itemList li.entry", { hasText: "Admin and emails" });
    await rowB.locator(".icon.edit").click();
    const cols = await page.locator("li.editing .editrow").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    check(cols === 2, "editor controls wrap to two columns");
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll with the editor open");
    await page.click("li.editing .cancel");
    await page.click('#viewTabs button[data-view="week"]');
    const icon = page.locator(`.wday[data-day="${T}"] li.mini .icon.edit`).first();
    check(await icon.isVisible(), "Week view edit button shows without hover on touch");
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll in Week view");
  });
});
