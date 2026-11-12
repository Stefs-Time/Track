// Automatic backup to a folder. The folder picker is a native dialog tests
// can't click through, so it's stubbed to hand back a real folder from the
// browser's private file system — every write, read and delete after that
// is the real File System Access API.
//
// These tests run in a normal (persistent) browser profile, as people use
// Docket. Chromium 14x crashes when a stored private-file-system folder is
// read back from IndexedDB in a throwaway incognito-like profile — the kind
// Playwright gives each test by default — which has nothing to do with the app.
"use strict";

const { test: base, expect } = require("@playwright/test");

const test = base.extend({
  page: async ({ playwright, baseURL, viewport }, use, testInfo) => {
    const ctx = await playwright.chromium.launchPersistentContext(testInfo.outputPath("profile"), { baseURL, viewport, serviceWorkers: "block" });
    const page = ctx.pages()[0] || await ctx.newPage();
    await use(page);
    await ctx.close();
  }
});
const { check, iso, seed, state } = require("./helpers");

const T = iso(0);
test.use({ viewport: { width: 1360, height: 900 } });

async function usePicker(page) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("Docket backups", { create: true });
  });
}
/** Every file in the picked folder: { name: text }. */
function folder(page) {
  return page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("Docket backups", { create: true });
    const out = {};
    const it = dir.values();
    for (let r = await it.next(); !r.done; r = await it.next()) {
      // the app may prune a file between listing and reading it
      try { out[r.value.name] = await (await r.value.getFile()).text(); } catch { /* gone */ }
    }
    return out;
  });
}
const todayFile = "docket-backup-" + T + ".json";

test("back up to a folder automatically after every change", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, { "track.tasks.v1": { [T]: [{ id: "a", text: "First entry" }] } });
  await usePicker(page);
  await page.goto("/");

  check(await page.isVisible("#autoOnBtn"), "the option shows where the browser supports it");
  await page.click("#autoOnBtn");
  await page.waitForSelector("#autoStat.on");
  check((await page.textContent("#autoStat")).startsWith("Auto-backup to “Docket backups” · saved"), "it says where and when");
  check(!(await page.isVisible("#backupStat")), "the last-backup reminder steps aside");
  let files = await folder(page);
  check(Object.keys(files).join() === todayFile, "a dated backup file is written straight away: " + Object.keys(files));
  check(JSON.parse(files[todayFile])[T][0].text === "First entry", "…holding the log");

  // a change reaches the file a moment later
  await page.fill("#newItem", "Second entry");
  await page.press("#newItem", "Enter");
  await expect.poll(async () => (await folder(page))[todayFile], { timeout: 8000 }).toContain("Second entry");
  files = await folder(page);
  const backup = JSON.parse(files[todayFile]);
  check(backup[T].length === 2 && backup._docket.version === 2, "the file is a normal JSON backup, up to date");
  check(JSON.stringify(backup[T]) === JSON.stringify((await state(page)).tasks[T]), "…exactly what's saved");

  // the folder is remembered next time
  await page.reload();
  await page.waitForSelector("#autoStat.on");
  check(true, "after a reload auto-backup is still on");

  // only the newest 30 of Docket's own files are kept
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("Docket backups");
    for (let d = 1; d <= 32; d++) {
      const f = await dir.getFileHandle("docket-backup-2020-01-" + String(d).padStart(2, "0") + ".json", { create: true });
      const w = await f.createWritable(); await w.write("{}"); await w.close();
    }
    const n = await dir.getFileHandle("my notes.txt", { create: true });
    const w = await n.createWritable(); await w.write("keep me"); await w.close();
  });
  await page.fill("#newItem", "Third entry");
  await page.press("#newItem", "Enter");
  await expect.poll(async () => Object.keys(await folder(page)).filter((n) => n.startsWith("docket-backup-")).length, { timeout: 8000 }).toBe(30);
  files = await folder(page);
  check(!files["docket-backup-2020-01-01.json"] && !files["docket-backup-2020-01-03.json"] && files["docket-backup-2020-01-04.json"], "the oldest files are removed first");
  check(files[todayFile] && files["my notes.txt"] === "keep me", "today's backup and other files are never touched");

  // Change folder: later backups go to the new one
  await page.evaluate(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("Other folder", { create: true });
  });
  await page.click("#autoChangeBtn");
  await page.waitForFunction(() => document.getElementById("autoStat").textContent.includes("Other folder"));
  const moved = await page.evaluate(async (name) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("Other folder");
    return (await (await dir.getFileHandle(name)).getFile()).text();
  }, todayFile);
  check(moved.includes("Third entry"), "Change folder writes the backup to the new folder straight away");

  // turn it off
  await page.click("#autoOffBtn");
  check(await page.isVisible("#autoOnBtn") && !(await page.isVisible("#autoStat")), "Turn off goes back to the offer");
  check((await page.textContent("#toast")).includes("stay there"), "…and says the files stay");
  await page.waitForFunction(() => new Promise((ok) => {
    const o = indexedDB.open("docket", 1);
    o.onsuccess = () => { const r = o.result.transaction("kv").objectStore("kv").get("backupDir"); r.onsuccess = () => { o.result.close(); ok(!r.result); }; };
  }));
  await page.reload();
  check(await page.isVisible("#autoOnBtn"), "…and stays off after a reload");
  check(errors.length === 0, "no page errors " + JSON.stringify(errors));
});

test("when the browser wants permission again, auto-backup pauses until you say so", async ({ page }) => {
  await seed(page, { "track.tasks.v1": { [T]: [{ id: "a", text: "An entry" }] } });
  await usePicker(page);
  await page.goto("/");
  await page.click("#autoOnBtn");
  await page.waitForSelector("#autoStat.on");

  // a new session: the browser hasn't re-granted access yet
  await page.addInitScript(() => {
    let perm = "prompt";
    FileSystemHandle.prototype.queryPermission = async () => perm;
    FileSystemHandle.prototype.requestPermission = async () => { perm = "granted"; return perm; };
  });
  await page.reload();
  await page.waitForSelector("#autoStat.paused");
  check((await page.textContent("#autoStat")).includes("paused"), "it says it's paused");
  check(await page.isVisible("#autoResumeBtn"), "…with a Resume button");
  await page.fill("#newItem", "Written while paused");
  await page.press("#newItem", "Enter");
  await page.waitForTimeout(2600);
  check(!JSON.stringify(await folder(page)).includes("Written while paused"), "nothing is written without permission");

  await page.click("#autoResumeBtn");
  await page.waitForSelector("#autoStat.on");
  check(JSON.stringify(await folder(page)).includes("Written while paused"), "Resume writes the latest straight away");
});

test("browsers without folder access don't offer it", async ({ page }) => {
  await seed(page, {});
  await page.addInitScript(() => { delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker; });
  await page.goto("/");
  check(!(await page.isVisible("#autoBackup")), "no auto-backup option");
  check(await page.isVisible("#exportBtn"), "export and import are still there");
});
