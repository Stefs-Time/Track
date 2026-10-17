// Ported from the user-acceptance runs done while building this feature.
"use strict";

const { test } = require("@playwright/test");
const fs = require("node:fs");
const { check, iso, importFile } = require("./helpers");

test.use({ viewport: { width: 1360, height: 900 } });

test('Clear data, Undo, and clear → re-import round trips', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const t = iso();
  await page.addInitScript((t) => {
    if (localStorage.getItem('test.seeded')) return; localStorage.setItem('test.seeded','1');
    localStorage.setItem('track.helpseen.v1','1');
    localStorage.setItem('track.jobs.v1', JSON.stringify([{id:'j1',text:'Smith House'},{id:'j2',text:'Office fit-out'},{id:'j3',text:'Garden shed'}]));
    localStorage.setItem('track.tasks.v1', JSON.stringify({[t]:[{id:'1',text:'Installed blinds, lounge',job:'j1'},{id:'2',text:'Measured windows',job:'j1'},{id:'3',text:'Quoted fit-out',job:'j2'},{id:'4',text:'Admin'}], '2026-09-01':[{id:'5',text:'Site visit; "urgent"',job:'j2'}]}));
    localStorage.setItem('track.wishlist.v1', JSON.stringify([{id:'w1',text:'Order paint'}]));
    localStorage.setItem('track.recurring.v1', JSON.stringify([{id:'r1',text:'Timesheet'},{id:'r2',text:'Invoices'}]));
  }, t);
  await page.goto('/');
  const state = () => page.evaluate(() => ({
    tasks: JSON.parse(localStorage.getItem('track.tasks.v1')||'{}'), jobs: JSON.parse(localStorage.getItem('track.jobs.v1')||'[]'),
    wish: JSON.parse(localStorage.getItem('track.wishlist.v1')||'[]'), rec: JSON.parse(localStorage.getItem('track.recurring.v1')||'[]') }));
  const summary = s => ({ entries: Object.values(s.tasks).flat().map(e => e.text + '|' + ((s.jobs.find(j => j.id === e.job)||{}).text||'')).sort(), jobs: s.jobs.map(j=>j.text).sort(), wish: s.wish.map(w=>w.text), rec: s.rec.map(r=>r.text) });
  const before = summary(await state());

  // Exports
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const json = fs.readFileSync(await dj.path(), 'utf8');
  const J = JSON.parse(json);
  check(J._jobs.length === 3 && J._wishlist.length === 1 && J._recurring.length === 2 && J._docket.version === 2, 'JSON has jobs, wishlist, recurring, format tag');
  const [dc] = await Promise.all([page.waitForEvent('download'), page.click('#csvExportBtn')]);
  const csv = fs.readFileSync(await dc.path(), 'utf8');
  console.log(csv);
  check(/\r\n,,Garden shed$/.test(csv), 'CSV keeps job with no entries as job-only row');

  // Dialog
  await page.click('#clearAllBtn');
  check(await page.isVisible('#clearOverlay .modal'), 'clear dialog opens');
  check(await page.textContent('#clrLogN') === '5 entries over 2 days' && await page.textContent('#clrJobsN') === '3 jobs', 'dialog shows counts');
  check(await page.textContent('#clearGo') === 'Clear everything', 'all ticked → Clear everything');
  check(await page.evaluate(() => document.activeElement.id) === 'clearCancel', 'focus starts on Cancel (safe default)');
  await page.mouse.move(1,1); await page.waitForTimeout(300);
  await page.keyboard.press('d'); await page.keyboard.press('ArrowLeft');
  check(await page.isVisible('#clearOverlay .modal'), 'shortcuts blocked behind dialog');
  // focus trap
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  check(await page.evaluate(() => !!document.activeElement.closest('#clearOverlay')), 'focus trapped in dialog');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#clearOverlay .modal')) && await page.evaluate(() => document.activeElement.id) === 'clearAllBtn', 'Esc closes, focus back to button');

  // Partial: jobs only
  await page.click('#clearAllBtn');
  await page.uncheck('#clrLog'); await page.uncheck('#clrWish'); await page.uncheck('#clrRec');
  check((await page.textContent('#clearWarn')).includes('lose its job'), 'warns entries lose their job');
  await page.uncheck('#clrJobs');
  check(await page.isDisabled('#clearGo'), 'nothing selected → button disabled');
  await page.check('#clrJobs');
  await page.click('#clearGo');
  let s = await state();
  check(s.jobs.length === 0 && Object.values(s.tasks).flat().length === 5 && Object.values(s.tasks).flat().every(e => !e.job) && s.wish.length === 1, 'jobs-only clear keeps entries, strips job');
  check(await page.locator('#itemList .jobpill').count() === 0, 'pills gone');
  await page.click('#toast .undo');
  check(JSON.stringify(summary(await state())) === JSON.stringify(before), 'Undo restores exactly');

  // Clear everything, from Job view, with backup button
  await page.locator('#itemList .jobpill').first().click();
  await page.click('#clearAllBtn');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#clearBackup')]);
  check((await page.textContent('#clearBackup')).includes('Backup saved'), 'backup button confirms');
  const json2 = fs.readFileSync(await d2.path(), 'utf8');
  await page.click('#clearGo');
  s = await state();
  check(Object.keys(s.tasks).length === 0 && s.jobs.length === 0 && s.wish.length === 0 && s.rec.length === 0, 'everything cleared');
  check(await page.textContent('#dayTitle') === 'Daily Log', 'Job view falls back to Day view');
  check((await page.textContent('#toast')).includes('Cleared 5 entries, 3 jobs, 1 wishlist item, 2 recurring tasks'), 'toast summarises');
  await page.waitForTimeout(300);
  await page.reload();
  check(await page.locator('#itemList li.entry').count() === 0, 'clear persisted across reload');

  // Re-upload JSON → identical
  await importFile(page, '#importFile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json2) });
  check(JSON.stringify(summary(await state())) === JSON.stringify(before), 'JSON re-import restores log, jobs, wishlist, recurring exactly');

  // Clear log+jobs, re-upload CSV → log + all 3 jobs back
  await page.click('#clearAllBtn'); await page.uncheck('#clrWish'); await page.uncheck('#clrRec'); await page.click('#clearGo');
  await importFile(page, '#csvFile', { name: 'c.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  const after = summary(await state());
  check(JSON.stringify(after.entries) === JSON.stringify(before.entries) && JSON.stringify(after.jobs) === JSON.stringify(before.jobs), 'CSV re-import restores entries, jobs (incl. empty job), quotes');
  console.log('toast:', await page.textContent('#toast'));
  check((await page.textContent('#toast')).includes('3 new jobs'), 'CSV import reports new jobs');

  // Mobile dialog
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#clearAllBtn');
  await page.waitForTimeout(300);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no horizontal scroll on phone');
  check(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
});
