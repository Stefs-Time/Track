// Accessibility: every view and dialog, in both themes, against WCAG 2.1 A/AA
// with axe-core. A regression in contrast, labelling or roles fails the build.
"use strict";

const { test, expect } = require("@playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const { iso, seed, settle } = require("./helpers");

const STATES = [
  ["Day view", async () => {}],
  ["Week view", async (p) => p.click('#viewTabs button[data-view="week"]')],
  ["Month view", async (p) => p.click('#viewTabs button[data-view="month"]')],
  ["Job view", async (p) => p.locator('#jobList li[data-job="j1"] .jobrow').click()],
  ["archived job", async (p) => { await p.click("#archToggle"); await p.locator('#jobList li[data-job="j3"] .jobrow').click(); }],
  ["recurring editor", async (p) => p.locator('#recList li[data-id="r"] .wbtn.edit').evaluate((el) => el.click())],
  ["auto-backup on", async (p) => { await p.keyboard.press("Escape"); await p.click("#autoOnBtn"); await p.waitForSelector("#autoStat.on"); }],
  ["guide", async (p) => p.click("#helpBtn")],
  ["Clear data dialog", async (p) => { await p.keyboard.press("Escape"); await p.click("#clearAllBtn"); }],
  ["search", async (p) => { await p.keyboard.press("Escape"); await p.click("#searchBtn"); await p.fill("#searchInput", "smith"); }]
];

for (const scheme of ["light", "dark"]) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1360, height: 900 } });

    test("no WCAG 2.1 AA violations in any view", async ({ page }) => {
      await seed(page, {
        "track.jobs.v1": [{ id: "j1", text: "Smith House", color: 0 }, { id: "j2", text: "Office fit-out", color: 3 }, { id: "j3", text: "Garden shed", color: 2, archived: true }],
        "track.tasks.v1": { [iso(0)]: [{ id: "a", text: "Installed blinds", job: "j1" }, { id: "b", text: "Admin" }, { id: "c", text: "Quote", job: "j2" }], [iso(-3)]: [{ id: "d", text: "Shed base", job: "j3" }] },
        "track.wishlist.v1": [{ id: "w", text: "Order paint", job: "j1" }],
        // one due today (shows the Due today strip), one not
        "track.recurring.v1": [{ id: "r", text: "Timesheet", days: [new Date().getDay()] }, { id: "r2", text: "Site check", job: "j2", days: [(new Date().getDay() + 1) % 7] }]
      });
      await page.addInitScript(() => {
        window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("Backups", { create: true });
      });
      await page.goto("/");
      const found = [];
      for (const [name, go] of STATES) {
        await go(page);
        await settle(page);
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        violations.forEach((v) => found.push(`${name}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  });
}
