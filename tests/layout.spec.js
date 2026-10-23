// Page layout: three columns on PC, the Wishlist folded under the log on
// small laptops, and a single column on phones.
"use strict";

const { test } = require("@playwright/test");
const { check, seed } = require("./helpers");

const many = Array.from({ length: 30 }, (_, i) => ({ id: "w" + i, text: "Wishlist item " + (i + 1) }));
const box = (page, sel) => page.locator(sel).boundingBox();

test("PC: lists left, log in the middle filling the space, Wishlist right", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await seed(page, { "track.wishlist.v1": many });
  await page.goto("/");
  const left = await box(page, ".side-left");
  const main = await box(page, ".main");
  const right = await box(page, ".side-right");
  check(left.x === 0 && main.x >= left.x + left.width - 1, "lists panel on the left");
  check(right.x >= main.x + main.width - 1 && Math.round(right.x + right.width) === 1920, "Wishlist panel on the right edge");
  check(main.width > 1200, "the log fills the space between them: " + Math.round(main.width) + "px");
  check(Math.abs(right.y - main.y) < 2, "the Wishlist sits alongside the log, not under it");
  check(await page.locator(".side-left #wishList").count() === 0 && await page.locator(".side-right #wishList").count() === 1, "the Wishlist lives only in the right panel");
  // a long Wishlist scrolls inside its panel; the page itself doesn't grow
  const panelScrolls = await page.locator("#wishList").evaluate((el) => el.scrollHeight > el.clientHeight);
  check(panelScrolls, "a long Wishlist scrolls within its panel");
  check(Math.round((await box(page, ".side-right")).height) <= 1000, "…and the panel stays the height of the window");
  const fab = await box(page, "#fab");
  check(fab.x + fab.width <= right.x, "the floating + stays clear of the Wishlist panel");
});

test("small laptop: Wishlist folds under the log", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await seed(page, {});
  await page.goto("/");
  const main = await box(page, ".main");
  const right = await box(page, ".side-right");
  check(right.y >= main.y + main.height - 1 && Math.abs(right.x - main.x) < 2, "Wishlist directly under the log, same column");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll");
});

test("phone: one column — log, then Wishlist, then the other lists", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, {});
  await page.goto("/");
  const main = await box(page, ".main");
  const right = await box(page, ".side-right");
  const left = await box(page, ".side-left");
  check(main.y < right.y && right.y < left.y, "order is log, Wishlist, other lists");
  check(Math.round(right.width) === 390 && Math.round(left.width) === 390, "each takes the full width");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways scroll");
});
