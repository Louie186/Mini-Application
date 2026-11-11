// Folder Check: one tab, four views, the folder is picked once
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { const fs = window.__mockFs, add = (p) => { fs.files[p.toLowerCase()] = { path: p, text: 'x', time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    ['5013-KEO-T1-ZZ-PLN-INT-10100-T1.pdf', '5013-KEO-T1-ZZ-PLN-INT-10101-T1.pdf'].forEach(n => add('C:\\Sub1\\' + n)); add('C:\\Sub2\\5013-KEO-T1-ZZ-PLN-INT-10102-T1.pdf'); });
  const names = await page.evaluate(() => [].map.call(document.querySelectorAll('.nb'), b => b.getAttribute('data-k')).join(','));
  ok(!/contents|naming|compare|workload/.test(names) && /check/.test(names), 'one Folder Check tab (no separate Contents / Naming / Compare / Workload tabs): ' + names);
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const k = page.frame({ url: /check\.html/ });
  ok(await page.evaluate(() => /Folder Check/.test(document.querySelector('.nb[data-k="check"]').innerText)), 'the tab is called Folder Check');
  ok(await k.evaluate(() => document.querySelectorAll('#fcv button').length == 4 && $('fcv').innerText.indexOf('Submission') >= 0), 'four views: Submission, Contents & checklist, Names, Compare');
  await k.evaluate(() => { top.__nextFolder = 'C:\\Sub1'; }); await k.click('#bFolder');
  await k.click('[data-fv="contents"]'); await page.waitForTimeout(600);
  const c = page.frame({ url: /contents\.html/ });
  ok(await c.evaluate(() => cfg.folder == 'C:\\Sub1'), 'Contents uses the folder picked in Submission');
  await page.screenshot({ path: out + '/q_folder_check.png' });
  await c.evaluate(() => { useRef('none'); }); await page.waitForTimeout(100);
  ok(await c.evaluate(() => result && result.rows.length == 2), 'Contents reads it (2 drawings)');
  await c.evaluate(() => { top.__nextFolder = 'C:\\Sub2'; }); await c.click('#bFolder'); await page.waitForTimeout(200);
  ok(await k.evaluate(() => cfg.folder == 'C:\\Sub2'), 'a folder picked in Contents goes back to Submission');
  await k.click('[data-fv="naming"]'); await page.waitForTimeout(600);
  ok(await page.frame({ url: /naming\.html/ }).evaluate(() => folder == 'C:\\Sub2'), 'Names uses it too');
  await k.click('[data-fv="compare"]'); await page.waitForTimeout(600);
  ok(await page.frame({ url: /compare\.html/ }).evaluate(() => cfg.b && cfg.b.path == 'C:\\Sub2'), 'Compare: it becomes "Now" (this submission)');
  await k.evaluate(() => { loadCfg(); });
  ok(await k.evaluate(() => cfg.view == 'compare'), 'the last view is remembered');
  await k.click('[data-fv="sub"]'); await page.waitForTimeout(100);
  ok(await k.evaluate(() => $('vOther').style.display == 'none' && $('bRun').offsetHeight > 0), 'back to Submission check');
};
