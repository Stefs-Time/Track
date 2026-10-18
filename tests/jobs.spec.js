// Ported from the user-acceptance runs done while building this feature.
"use strict";

const { test } = require("@playwright/test");
const fs = require("node:fs");
const { check, iso, importFile } = require("./helpers");

test.use({ viewport: { width: 1360, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });

test('Jobs: log against a job, see all its work, rename, delete, copy, export', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Legacy data (pre-jobs) must keep loading untouched
  await page.addInitScript(([y2, y1]) => {
    if (localStorage.getItem('test.seeded')) return;
    localStorage.setItem('test.seeded', '1');
    localStorage.setItem('track.helpseen.v1', '1');
    localStorage.setItem('track.tasks.v1', JSON.stringify({ [y2]: [{id:'a1', text:'Old entry from before jobs'}], [y1]: [{id:'a2', text:'Site visit'}] }));
  }, [iso(-2), iso(-1)]);
  await page.goto('/');
  check(errors.length === 0, 'no console errors on load');
  check(await page.locator('#jobList .nothing').textContent() === 'No jobs yet — type one in the Job box', 'empty jobs list message');

  // Log a run of entries against one job
  await page.fill('#newJob', 'Smith House');
  await page.press('#newJob', 'Enter');
  check(await page.evaluate(() => document.activeElement.id) === 'newItem', 'Enter in job box moves to entry box');
  await page.fill('#newItem', 'Installed blinds, lounge');
  await page.press('#newItem', 'Enter');
  await page.fill('#newItem', 'Measured kitchen windows');
  await page.press('#newItem', 'Enter');
  check(await page.inputValue('#newJob') === 'Smith House', 'job stays set after adding');
  check(await page.locator('#jobWrap').evaluate(e => e.classList.contains('set')), 'job box shows set state');
  // case-insensitive reuse
  await page.fill('#newJob', 'smith house');
  await page.fill('#newItem', 'Collected deposit');
  await page.press('#newItem', 'Enter');
  check(await page.inputValue('#newJob') === 'Smith House', 'job name normalised to canonical spelling');
  // second job, then no job
  await page.fill('#newJob', 'Office fit-out');
  await page.fill('#newItem', 'Quoted new office fit-out');
  await page.press('#newItem', 'Enter');
  await page.click('#jobClear');
  check(await page.inputValue('#newJob') === '', 'clear button empties job box');
  await page.fill('#newItem', 'Admin and emails');
  await page.press('#newItem', 'Enter');
  const stored = await page.evaluate(() => ({ jobs: JSON.parse(localStorage.getItem('track.jobs.v1')), tasks: JSON.parse(localStorage.getItem('track.tasks.v1')) }));
  check(stored.jobs.length === 2, 'exactly 2 jobs stored (no duplicate from case)');
  const today = Object.keys(stored.tasks).sort().pop();
  const tl = stored.tasks[today];
  check(tl.length === 5 && tl.filter(t => t.job === stored.jobs[0].id).length === 3 && !tl[4].job, 'entries carry the right job ids');
  check(await page.locator('#itemList .jobpill').count() === 4, '4 job pills on the day');
  check(await page.locator('#jobList li.row').count() === 2, 'sidebar lists 2 jobs');
  await page.locator('#itemList li').first().hover();

  // Edit an entry: move the old one onto a job
  await page.click('#prevDay'); await page.click('#prevDay');
  await page.locator('#itemList li').first().hover();
  await page.click('#itemList .icon.edit');
  await page.fill('#itemList li.editing .jobwrap input', 'Smith House');
  await page.click('#itemList .editrow .save');
  check(await page.locator('#itemList .jobpill').count() === 1, 'edited legacy entry now has job pill');

  // Copy day includes job
  await page.click('#todayBtn');
  await page.click('#copyDay');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.includes('- Installed blinds, lounge (Smith House)') && clip.includes('- Admin and emails\n') || clip.endsWith('- Admin and emails'), 'day copy tags job in brackets');

  // Open job via pill
  await page.locator('#itemList .jobpill').first().click();
  check(await page.textContent('#dayTitle') === 'Job', 'pill opens Job view');
  check(await page.textContent('#navDate') === 'Smith House', 'job name as title');
  check(await page.locator('#jobView .wday').count() === 2, 'job view shows 2 days');
  check((await page.locator('#jobView .stat .sn').first().textContent()) === '4', 'job view counts 4 entries');
  check(await page.isHidden('#todayBtn') && await page.isVisible('#logJobBtn'), 'Log Work on This Job replaces Jump to Today');
  check(!(await page.isVisible('#prevDay')) && !(await page.isVisible('#nextDay')), 'date arrows hidden in job view');
  check(await page.locator('#jobList li.current').count() === 1, 'sidebar highlights current job');
  await page.keyboard.press('ArrowLeft');
  check(await page.textContent('#dayTitle') === 'Job', 'arrow keys do nothing in job view');
  await page.mouse.move(5, 5);
  await page.click('#copyDay');
  const jclip = await page.evaluate(() => navigator.clipboard.readText());
  check(jclip.startsWith('Smith House\n\n') && jclip.includes('- Old entry from before jobs') && !jclip.includes('(Smith House)'), 'job copy: heading + days, no bracket tags');
  console.log('--- job copy ---\n' + jclip + '\n---');
  await page.click('#copyPlain');
  const jplain = await page.evaluate(() => navigator.clipboard.readText());
  check(jplain.split('\n').length === 4, 'job items-only copy is 4 lines');

  // Log Work on This Job sets the job and goes to day view
  await page.click('#logJobBtn');
  check(await page.textContent('#dayTitle') === 'Daily Log' && await page.inputValue('#newJob') === 'Smith House', 'Log Work sets job + focuses day');
  check(await page.evaluate(() => document.activeElement.id) === 'newItem', 'entry box focused');

  // Rename job from sidebar
  const smithRow = page.locator('#jobList li.row', { hasText: 'Smith House' });
  await smithRow.hover();
  await smithRow.locator('.wbtn.ren').click();
  await page.fill('#jobList .jobedit', 'Smith Residence');
  await page.press('#jobList .jobedit', 'Enter');
  check(await page.locator('#itemList .jobpill', { hasText: 'Smith Residence' }).count() === 3, 'rename updates pills');
  check(await page.inputValue('#newJob') === 'Smith Residence', 'rename updates active job box');
  // rename collision
  const offRow = page.locator('#jobList li.row', { hasText: 'Office' });
  await offRow.hover(); await offRow.locator('.wbtn.ren').click();
  await page.fill('#jobList .jobedit', 'smith residence');
  await page.press('#jobList .jobedit', 'Enter');
  check((await page.textContent('#toast')).includes('already a job'), 'rename collision refused');

  // Sidebar add job duplicate + new
  await page.fill('#newJobSide', 'Smith Residence'); await page.press('#newJobSide', 'Enter');
  check((await page.textContent('#toast')).includes('already a job'), 'side add duplicate refused');
  await page.fill('#newJobSide', 'Garden shed'); await page.press('#newJobSide', 'Enter');
  check(await page.locator('#jobList li.row').count() === 3, 'side add creates job');
  await page.locator('#jobList li.row', { hasText: 'Garden shed' }).locator('.jobrow').click();
  check(await page.isVisible('#jobView .empty'), 'empty job shows empty state');
  await page.mouse.move(5, 5);

  // Delete job keeps entries, undo restores
  await page.keyboard.press('d');
  const off = page.locator('#jobList li.row', { hasText: 'Office' });
  await off.hover(); await off.locator('.wbtn.kill').click();
  check(await page.locator('#itemList li.entry').count() === 5 && await page.locator('#itemList .jobpill').count() === 3, 'delete job keeps entries, drops pill');
  await page.click('#toast .undo');
  check(await page.locator('#itemList .jobpill').count() === 4, 'undo restores job on entries');

  // Delete the job being viewed -> falls back to day view
  await page.locator('#jobList li.row', { hasText: 'Garden' }).locator('.jobrow').click();
  const g = page.locator('#jobList li.row', { hasText: 'Garden' });
  await g.hover(); await g.locator('.wbtn.kill').click();
  check(await page.textContent('#dayTitle') === 'Daily Log', 'deleting viewed job returns to day view');

  // Week view pills
  await page.keyboard.press('w');
  check(await page.locator('#weekView .jobpill').count() >= 4, 'week view shows job pills');
  await page.mouse.move(5, 5);
  await page.keyboard.press('j');
  check(await page.evaluate(() => document.activeElement.id) === 'newJob' && await page.textContent('#dayTitle') === 'Daily Log', 'J focuses job box in day view');

  // CSV export round-trip
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csvExportBtn')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check(csv.includes('Date,Task,Job') && csv.includes('"Installed blinds, lounge",Smith Residence'), 'CSV export has Job column');
  // JSON export, wipe, import
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const json = fs.readFileSync(await dj.path(), 'utf8');
  check(JSON.parse(json)._jobs.length === 2, 'JSON backup includes jobs');
  await page.evaluate(() => { localStorage.removeItem('track.tasks.v1'); localStorage.removeItem('track.jobs.v1'); });
  await page.reload();
  check(await page.locator('#itemList li.entry').count() === 0, 'wiped');
  await importFile(page, '#importFile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  check(await page.locator('#itemList .jobpill').count() === 4 && await page.locator('#jobList li.row').count() === 2, 'JSON import restores jobs on entries');
  // CSV import with jobs into empty store
  await page.evaluate(() => { localStorage.removeItem('track.tasks.v1'); localStorage.removeItem('track.jobs.v1'); });
  await page.reload();
  await importFile(page, '#csvFile', { name: 'c.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  check(await page.locator('#itemList .jobpill').count() === 4 && await page.locator('#jobList li.row').count() === 2, 'CSV import restores jobs');
  // legacy CSV (no Job header) still joins extra columns
  await importFile(page, '#csvFile', { name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Task\n2026-01-05,Legacy,extra bit\n') });
  const leg = await page.evaluate(() => JSON.parse(localStorage.getItem('track.tasks.v1'))['2026-01-05']);
  check(leg && leg[0].text === 'Legacy, extra bit' && !leg[0].job, 'legacy CSV behaviour unchanged');

  // Tab order + accessibility basics
  const noName = await page.evaluate(() => [...document.querySelectorAll('button, input')].filter(e => e.offsetParent && !(e.getAttribute('aria-label') || e.textContent.trim() || e.placeholder)).map(e => e.outerHTML.slice(0,80)));
  check(noName.length === 0, 'every visible control has an accessible name ' + JSON.stringify(noName));

  // Mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('d');
  await page.fill('#newJob', 'Smith Residence'); await page.dispatchEvent('#newJob', 'input');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal scroll at 390px');
  await page.locator('#itemList .jobpill').first().click();
  await page.evaluate(() => document.querySelector('#jobList').scrollIntoView());

  check(errors.length === 0, 'no console errors during run ' + JSON.stringify(errors));
});
