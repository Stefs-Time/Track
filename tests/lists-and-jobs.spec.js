// Ported from the user-acceptance runs done while building this feature.
"use strict";

const { test } = require("@playwright/test");
const fs = require("node:fs");
const { check, iso, importFile } = require("./helpers");

test.use({ viewport: { width: 1360, height: 900 } });

test('Wishlist and Recurring items carry jobs end to end', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const T = iso();
  await page.addInitScript(() => {
    if (localStorage.getItem('test.seeded')) return; localStorage.setItem('test.seeded','1');
    localStorage.setItem('track.helpseen.v1','1');
    localStorage.setItem('track.jobs.v1', JSON.stringify([{id:'j1',text:'Smith House'}]));
    // a legacy wishlist item with no job must keep working
    localStorage.setItem('track.wishlist.v1', JSON.stringify([{id:'w0',text:'Legacy wish'}]));
  });
  await page.goto('/');
  const st = () => page.evaluate(() => ({ tasks: JSON.parse(localStorage.getItem('track.tasks.v1')||'{}'), jobs: JSON.parse(localStorage.getItem('track.jobs.v1')||'[]'), wish: JSON.parse(localStorage.getItem('track.wishlist.v1')||'[]'), rec: JSON.parse(localStorage.getItem('track.recurring.v1')||'[]') }));
  const jobOf = (s, it) => (s.jobs.find(j => j.id === it.job) || {}).text || '';

  // 1. Adding a wishlist item with a job
  check(!(await page.isVisible('#wishJob')), 'list job box hidden until you click in');
  await page.click('#newWish');
  check(await page.isVisible('#wishJob'), 'job box appears on focus');
  await page.fill('#newWish', 'Order paint');
  await page.fill('#wishJob', 'smith house');
  await page.press('#wishJob', 'Enter');
  let s = await st();
  check(s.wish.length === 2 && jobOf(s, s.wish[1]) === 'Smith House' && s.jobs.length === 1, 'wishlist item linked to existing job (case-insensitive)');
  check(await page.inputValue('#wishJob') === 'Smith House', 'list job box sticky + canonical spelling');
  await page.fill('#newWish', 'Buy screws'); await page.press('#newWish', 'Enter');
  s = await st();
  check(jobOf(s, s.wish[2]) === 'Smith House', 'second item gets sticky job');
  await page.click('#wishJobClear');
  await page.fill('#newWish', 'Personal errand'); await page.press('#newWish', 'Enter');
  s = await st(); check(!s.wish[3].job, 'cleared box → no job');
  check(await page.locator('#wishList .jobpill').count() === 2, 'wishlist pills shown');

  // 2. Recurring with a NEW job
  await page.click('#newRec');
  await page.fill('#recJob', 'Office fit-out');
  await page.fill('#newRec', 'Site check'); await page.press('#newRec', 'Enter');
  s = await st();
  check(s.jobs.length === 2 && jobOf(s, s.rec[0]) === 'Office fit-out', 'recurring item creates + links new job');
  check(await page.locator('#jobList li.row').count() === 2, 'new job appears in Jobs list');
  await page.click('#newItem'); await page.mouse.move(1,1); await page.waitForTimeout(300);

  // 3. Editing a legacy wishlist item → set job
  const legacy = page.locator('#wishList li', { hasText: 'Legacy wish' });
  await legacy.hover(); await legacy.locator('.wbtn.edit').click();
  check(await page.isVisible('#wishList li.qediting'), 'pencil opens editor');
  check(await page.evaluate(() => document.activeElement.closest('li.qediting') !== null), 'editor focused');
  await page.fill('#wishList li.qediting .jobwrap input', 'Smith House');
  await page.fill('#wishList li.qediting > input', 'Legacy wish (edited)');
  await page.press('#wishList li.qediting > input', 'Enter');
  s = await st();
  check(s.wish[0].text === 'Legacy wish (edited)' && jobOf(s, s.wish[0]) === 'Smith House', 'editor saves text + job');
  // clicking the text also edits; Esc cancels
  await page.locator('#wishList li', { hasText: 'Buy screws' }).locator('.wtxt').click();
  await page.fill('#wishList li.qediting > input', 'SHOULD NOT SAVE');
  await page.press('#wishList li.qediting > input', 'Escape');
  s = await st(); check(s.wish[2].text === 'Buy screws', 'Esc cancels edit');

  // 4. Logging carries the job onto the entry, with Undo
  await page.locator('#wishList li', { hasText: 'Order paint' }).hover();
  await page.locator('#wishList li', { hasText: 'Order paint' }).locator('.wbtn.send').click();
  s = await st();
  const e1 = s.tasks[T].find(e => e.text === 'Order paint');
  check(e1 && jobOf(s, e1) === 'Smith House' && !s.wish.some(w => w.text === 'Order paint'), 'wishlist → day carries job, leaves list');
  await page.click('#toast .undo');
  s = await st();
  check(!(s.tasks[T]||[]).some(e => e.text === 'Order paint') && s.wish.some(w => w.text === 'Order paint' && jobOf(s, w) === 'Smith House'), 'Undo puts the wish back with its job');
  // recurring send + dup rule respects job
  await page.locator('#recList li').first().hover();
  await page.locator('#recList li').first().locator('.wbtn.send').click();
  await page.locator('#recList li').first().locator('.wbtn.send').click();
  s = await st();
  check(s.tasks[T].filter(e => e.text === 'Site check').length === 1 && (await page.textContent('#toast')).includes('Already logged'), 'recurring dup blocked (same job)');
  await page.fill('#newJob', ''); await page.fill('#newItem', 'Site check'); await page.press('#newItem', 'Enter');
  s = await st();
  check(s.tasks[T].filter(e => e.text === 'Site check').length === 2, 'same text, no job → separate entry');
  // drag & drop still works and carries job
  await page.locator('#wishList li', { hasText: 'Buy screws' }).dragTo(page.locator('#logPanel'));
  s = await st();
  check(jobOf(s, s.tasks[T].find(e => e.text === 'Buy screws') || {}) === 'Smith House', 'drag wishlist → log carries job');

  // 5. Job view shows to-dos, ↳ logs from there
  await page.locator('#jobList li.row', { hasText: 'Smith House' }).locator('.jobrow').click();
  check(await page.locator('#jobView .jobq-col').count() === 1 && await page.locator('#jobView .jobq li').count() === 2, 'Job view lists the job’s 2 wishlist items');
  await page.mouse.move(1,1); await page.waitForTimeout(300);
  await page.locator('#jobView .jobq li', { hasText: 'Order paint' }).locator('button').click();
  check(await page.locator('#jobView .jobq li').count() === 1 && await page.locator('#jobView .wday li', { hasText: 'Order paint' }).count() === 1, '↳ in Job view logs it and it moves to the logged list');
  await page.locator('#jobList li.row', { hasText: 'Office' }).locator('.jobrow').click();
  check(await page.locator('#jobView .jobq h3', { hasText: 'Recurring' }).count() === 1, 'Job view lists recurring items too');

  // 6. Rename/delete jobs reach lists + boxes
  await page.click('#newRec');
  const off = page.locator('#jobList li.row', { hasText: 'Office' });
  await off.hover(); await off.locator('.wbtn.ren').click();
  await page.fill('#jobList .jobedit', 'Office refit'); await page.press('#jobList .jobedit', 'Enter');
  check(await page.inputValue('#recJob') === 'Office refit' && await page.locator('#recList .jobpill', { hasText: 'Office refit' }).count() === 1, 'rename updates list pill + sticky list box');
  const off2 = page.locator('#jobList li.row', { hasText: 'Office' });
  await off2.hover(); await off2.locator('.wbtn.kill').click();
  s = await st();
  check(!s.rec[0].job && await page.inputValue('#recJob') === '', 'delete job strips recurring item + clears its box');
  await page.click('#toast .undo');
  s = await st(); check(jobOf(s, s.rec[0]) === 'Office refit', 'Undo restores job on recurring item');

  // 7. Exports carry everything; clear + re-import restores identically
  const sum = x => JSON.stringify({ e: Object.values(x.tasks).flat().map(e => e.text + '|' + jobOf(x, e)).sort(), j: x.jobs.map(j => j.text).sort(), w: x.wish.map(e => e.text + '|' + jobOf(x, e)), r: x.rec.map(e => e.text + '|' + jobOf(x, e)) });
  const before = sum(await st());
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const json = fs.readFileSync(await dj.path(), 'utf8');
  check(JSON.parse(json)._wishlist.some(w => w.job), 'JSON wishlist items carry job');
  const [dc] = await Promise.all([page.waitForEvent('download'), page.click('#csvExportBtn')]);
  const csv = fs.readFileSync(await dc.path(), 'utf8');
  console.log(csv);
  check(/\r\nWishlist,Buy screws|Wishlist,Legacy wish \(edited\),Smith House/.test(csv) && /Recurring,Site check,Office refit/.test(csv), 'CSV has Wishlist/Recurring rows with jobs');
  for (const [name, file, sel, mime] of [['JSON', json, '#importFile', 'application/json'], ['CSV', csv, '#csvFile', 'text/csv']]) {
    await page.click('#clearAllBtn'); await page.click('#clearGo');
    check(sum(await st()) !== before, name + ': cleared');
    await importFile(page, sel, { name: 'x', mimeType: mime, buffer: Buffer.from(file) });
    check(sum(await st()) === before, name + ': clear → re-import restores log, jobs, wishlist, recurring + all job links');
  }

  // 8. Duplicate rule: same text, different job is NOT a duplicate on import
  await page.click('#clearAllBtn'); await page.click('#clearGo');
  await importFile(page, '#csvFile', { name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Task,Job\n2026-02-02,Measured windows,Smith House\n2026-02-02,Measured windows,Office refit\n2026-02-02,Measured windows,Office refit\n') });
  s = await st();
  check(s.tasks['2026-02-02'].length === 2, 'same text on 2 jobs = 2 entries; exact repeat skipped');
  // old job-less entry gets its job filled in by a newer import
  await importFile(page, '#csvFile', { name: 'e.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Task\n2026-02-03,Admin\n') });
  await importFile(page, '#csvFile', { name: 'f.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Task,Job\n2026-02-03,Admin,Smith House\n') });
  s = await st();
  check(s.tasks['2026-02-03'].length === 1 && jobOf(s, s.tasks['2026-02-03'][0]) === 'Smith House', 're-import fills in a missing job instead of duplicating');
  // CSV with no header starting with a Wishlist row is not eaten as a header
  await importFile(page, '#csvFile', { name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from('Wishlist,Fresh idea\n') });
  s = await st(); check(s.wish.some(w => w.text === 'Fresh idea'), 'headerless list row imported');

  // 9. Phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('d');
  await page.click('#newWish'); await page.fill('#wishJob', 'Smith House'); await page.dispatchEvent('#wishJob', 'input');
  await page.evaluate(() => document.getElementById('wishList').scrollIntoView({ block: 'center' }));
  await page.mouse.move(1,1); await page.waitForTimeout(300);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no horizontal scroll on phone');

  check(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
});
