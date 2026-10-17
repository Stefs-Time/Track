// Docket as an application: the server, the installable PWA, offline use,
// and the standalone single file that runs by double-click.
"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect } = require("@playwright/test");
const { check } = require("./helpers");

test.describe("server", () => {
  test("health check, headers and errors", async ({ request }) => {
    const health = await request.get("/healthz");
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", version: require("../package.json").version });

    const page = await request.get("/");
    const h = page.headers();
    check(page.status() === 200, "page served");
    check(/script-src 'self' 'sha256-[^']+'/.test(h["content-security-policy"]), "CSP allows only the page's own script, by hash");
    check(!/script-src[^;]*unsafe-inline/.test(h["content-security-policy"]), "CSP does not allow arbitrary inline script");
    check(h["x-content-type-options"] === "nosniff" && h["x-frame-options"] === "DENY", "hardening headers set");
    check(h["cache-control"] === "no-cache", "page is revalidated so updates land");
    check(!h["x-powered-by"], "no x-powered-by header");

    const dl = await request.get("/download");
    check(/attachment; filename="?Docket.html"?/.test(dl.headers()["content-disposition"] || ""), "/download serves the single file as an attachment");
    check((await dl.text()).includes("<title>Docket"), "…and it is the app");

    const missing = await request.get("/no-such-page");
    check(missing.status() === 404, "unknown paths 404");
    check((await missing.json()).error === "Not found", "…with a JSON body");
  });
});

test.describe("installable app", () => {
  test.use({ serviceWorkers: "allow" });

  test("installable, no CSP violations, works offline", async ({ page, context }) => {
    const problems = [];
    page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
    page.on("pageerror", (e) => problems.push(e.message));
    await page.addInitScript(() => localStorage.setItem("track.helpseen.v1", "1"));
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    check(installabilityErrors.length === 0, "Chrome considers it installable: " + JSON.stringify(installabilityErrors));
    const manifest = await cdp.send("Page.getAppManifest");
    check(manifest.errors.length === 0, "manifest parses cleanly");
    check(/Docket \d+\.\d+\.\d+/.test(await page.textContent("#appVersion")), "guide shows the version");

    await page.fill("#newItem", "Logged while online");
    await page.press("#newItem", "Enter");
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    check(await page.isVisible("#newItem"), "app opens with the network off");
    check(await page.locator("#itemList li.entry", { hasText: "Logged while online" }).count() === 1, "…and the log is all there");
    await context.setOffline(false);

    check(problems.length === 0, "no console errors (CSP or otherwise): " + JSON.stringify(problems));
  });
});

test.describe("standalone file", () => {
  test("runs by double-click, with no server and no errors", async ({ page }) => {
    const problems = [];
    page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
    page.on("pageerror", (e) => problems.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, "..", "dist", "Docket.html")).href);
    await page.click("#helpDone"); // first run opens the guide
    await page.fill("#newItem", "Works from a file");
    await page.press("#newItem", "Enter");
    check(await page.locator("#itemList li.entry").count() === 1, "logging works from file://");
    check(await page.locator('link[rel="manifest"]').count() === 0, "no manifest requested from file:// (it would error)");
    check(!(await page.isVisible("#installBtn")), "no Install button outside the web app");
    check(problems.length === 0, "no console errors: " + JSON.stringify(problems));
  });
});
