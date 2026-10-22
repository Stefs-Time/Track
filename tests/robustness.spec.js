// Stability under the conditions that used to break Docket: blocked storage,
// damaged saved data, two open tabs, and undo after later changes.
"use strict";

const { test } = require("@playwright/test");
const { check, iso, seed, state } = require("./helpers");

const T = iso(0);

test("starts and works when the browser blocks storage", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const blocked = () => { throw new DOMException("The operation is insecure.", "SecurityError"); };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
    Storage.prototype.removeItem = blocked;
  });
  await page.goto("/");
  check(await page.isVisible("#newItem"), "the app renders");
  check((await page.textContent("#savedPill")).includes("Not saved"), "the saved pill says nothing is being saved");
  check((await page.textContent("#toast")).includes("blocking storage"), "a message explains why");
  check(!(await page.isVisible("#helpOverlay .modal")), "the first-run guide doesn't pile on top");
  await page.fill("#newItem", "Still works");
  await page.press("#newItem", "Enter");
  check(await page.locator("#itemList li.entry").count() === 1, "logging still works for the session");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("damaged saved data is repaired, with the original kept", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const damaged = {
    [T]: [null, { text: 5 }, { id: "noText" }, "plain string", { text: "no id" }, { id: "dup", text: "first" }, { id: "dup", text: "second" }],
    "not-a-date": [{ id: "z", text: "x" }],
    "2026-01-01": "not a list"
  };
  await seed(page, {
    "track.tasks.v1": damaged,
    "track.jobs.v1": [{ text: "Job without id" }, null, { id: "j1", text: "Real", color: 99 }],
    "track.wishlist.v1": [{ text: "wish without id" }, 42]
  });
  await page.goto("/");
  const texts = await page.locator("#itemList li.entry .txt").allTextContents();
  check(JSON.stringify(texts) === JSON.stringify(["5", "plain string", "no id", "first", "second"]), "every readable entry is kept: " + JSON.stringify(texts));
  const s = await state(page);
  const ids = s.tasks[T].map((e) => e.id);
  check(new Set(ids).size === ids.length && ids.every((id) => typeof id === "string" && id), "every entry has its own id");
  check(s.jobs.length === 2 && s.jobs.every((j) => j.id && Number.isInteger(j.color) && j.color >= 0 && j.color < 8), "jobs get ids and valid colours");
  check(s.wish.length === 1 && s.wish[0].id, "the wishlist keeps its readable item, with an id");
  const backup = await page.evaluate(() => localStorage.getItem("track.tasks.v1.before-repair"));
  check(backup && JSON.parse(backup)["not-a-date"], "the original data is kept as a backup before repair");
  check((await page.textContent("#toast")).includes("repaired"), "the repair is reported");

  // the repaired entries behave normally
  const second = page.locator("#itemList li.entry", { hasText: "second" });
  await second.hover();
  await second.locator(".icon.del").click();
  check(!(await state(page)).tasks[T].some((e) => e.text === "second"), "deleting the second of two duplicate-id entries removes the right one");
  check((await state(page)).tasks[T].some((e) => e.text === "first"), "…and leaves the first alone");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("unreadable JSON is backed up rather than overwritten", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("test.seeded")) return;
    localStorage.setItem("test.seeded", "1");
    localStorage.setItem("track.helpseen.v1", "1");
    localStorage.setItem("track.tasks.v1", "{not json");
  });
  await page.goto("/");
  check(await page.isVisible("#newItem"), "the app starts with an empty log");
  check(await page.evaluate(() => localStorage.getItem("track.tasks.v1.before-repair")) === "{not json", "the unreadable text is kept");
});

test("two open tabs see each other's changes instead of overwriting them", async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem("track.helpseen.v1", "1"));
  const a = await context.newPage();
  const b = await context.newPage();
  await a.goto("/");
  await b.goto("/");
  await a.fill("#newItem", "From tab A");
  await a.press("#newItem", "Enter");
  await b.waitForFunction(() => document.querySelectorAll("#itemList li.entry").length === 1);
  check(await b.locator("#itemList li.entry", { hasText: "From tab A" }).count() === 1, "tab B shows tab A's entry without reloading");
  await b.fill("#newItem", "From tab B");
  await b.press("#newItem", "Enter");
  await a.waitForFunction(() => document.querySelectorAll("#itemList li.entry").length === 2);
  const s = await state(a);
  check(JSON.stringify(s.tasks[T].map((e) => e.text)) === JSON.stringify(["From tab A", "From tab B"]), "both entries are saved: " + JSON.stringify(s.tasks[T]));

  // a theme change in one tab reaches the other
  await a.click("#themeBtn");
  await a.click("#themeBtn"); // auto → light → dark
  await b.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  check(true, "the theme follows across tabs");
});

test("undo never throws away work done after the action", async ({ page }) => {
  await seed(page, { "track.tasks.v1": { [T]: [{ id: "a", text: "Old entry" }] } });
  await page.goto("/");
  await page.click("#clearAllBtn");
  await page.click("#clearGo");
  await page.fill("#newItem", "Logged after the clear");
  await page.press("#newItem", "Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  const s = await state(page);
  check(JSON.stringify((s.tasks[T] || []).map((e) => e.text)) === JSON.stringify(["Logged after the clear"]), "the new entry survives Ctrl+Z");
  check((await page.textContent("#toast")).includes("Nothing to undo"), "it explains why it didn't undo");

  // while nothing has changed, undo still works
  const row = page.locator("#itemList li.entry").first();
  await row.hover();
  await row.locator(".icon.del").click();
  await page.locator("body").click({ position: { x: 700, y: 820 } });
  await page.keyboard.press("Control+z");
  check((await state(page)).tasks[T].length === 1, "an undo with nothing changed since still works");
});

test("a toast never blocks the button underneath it", async ({ page }) => {
  await seed(page, {});
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto("/");
  await page.click("#helpBtn");
  await page.evaluate(() => {
    const t = document.getElementById("toast");
    t.textContent = "A long message that sits over the bottom of the screen for a while";
    t.classList.add("show");
  });
  await page.click("#helpDone", { timeout: 3000 });
  check(!(await page.isVisible("#helpOverlay .modal")), "the guide's button is clickable through the toast");
});
