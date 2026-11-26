// Revit Background tab: reads the background status, Keep ready / Reload / Open for work / send to Pull from Revit
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const B = 'C:\\Users\\lew\\AppData\\Roaming\\BIMExport\\Background\\';
  await page.evaluate((B) => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add(B + 'heartbeat.txt', '123');
    add(B + 'bg_start.ps1', 'x');
    add(B + 'status.json', JSON.stringify({ state: 'checking', message: 'Checking 5013-KEO-ZZ-ZZ-BIM-INT-21001 (1 left)', last_check: '2026-11-26 10:41:00' }));
    add(B + 'config.json', JSON.stringify({ models: ['g1', 'g2'], times: ['08:00', '12:30'], pinned: [] }));
    add(B + 'models.json', JSON.stringify({ models: [
      { guid: 'g1', name: '5013-KEO-ZZ-ZZ-BIM-INT-21000', checked: '2026-11-26 10:41:00', to_print: 2, changed: [{ sheet: '10100', why: 'view "Level 1"' }, { sheet: '10101', why: 'never issued' }], fast: true, as_of: '2026-11-26 10:41:00', pinned: false },
      { guid: 'g2', name: '5013-KEO-ZZ-ZZ-BIM-INT-21001', checked: '', to_print: 0, changed: [], fast: false, pinned: false }] }));
  }, B);
  const go = async k => { await page.click('.nb[data-k="' + k + '"]'); await page.waitForTimeout(600); return page.frame({ url: new RegExp(k + '\\.html') }); };
  const f = await go('revitbg');
  ok(!!f, 'tab in the menu');
  const txt = await f.evaluate(() => document.body.innerText);
  ok(/CHECKING/.test(txt) && /21000/.test(txt) && /ready/.test(txt) && /2 drawing/.test(txt) && /not yet/.test(txt), 'status, checked, to print and fast print shown');
  await page.screenshot({ path: out + '/h_revitbg.png' });
  await f.evaluate(() => document.querySelectorAll('.pin')[1].click()); await page.waitForTimeout(150);
  const cfg = await page.evaluate((B) => JSON.parse(window.__mockFs.files[(B + 'config.json').toLowerCase()].text.replace(/^\uFEFF/, '')), B);
  ok(cfg.pinned.indexOf('g2') >= 0, 'Keep ready writes config.json pinned');
  await f.evaluate(() => document.querySelectorAll('.rl')[0].click()); await page.waitForTimeout(100);
  ok(await page.evaluate((B) => !!window.__mockFs.files[(B + 'reload\\g1.flag').toLowerCase()], B), 'Reload writes reload\\g1.flag');
  await f.evaluate(() => document.querySelectorAll('.ow')[0].click()); await page.waitForTimeout(100);
  ok(await page.evaluate((B) => !!window.__mockFs.files[(B + 'open_for_work\\g1.json').toLowerCase()], B), 'Open for work writes the request');
  await f.evaluate(() => document.querySelector('.tg').click()); await page.waitForTimeout(100);
  ok(await f.evaluate(() => /view "Level 1"/.test(document.body.innerText)), 'changed drawings listed');
  await f.evaluate(() => document.querySelector('.sp').click()); await page.waitForTimeout(900);
  const pf = page.frame({ url: /revitpull\.html/ });
  const rows = pf ? await pf.evaluate(() => cfg.rows.map(r => r.code + '@' + r.model)) : [];
  console.log('   pull rows: ' + rows.join(', '));
  ok(rows.indexOf('10100@5013-KEO-ZZ-ZZ-BIM-INT-21000') >= 0, 'changed drawings sent to Pull from Revit with their model');
  await f.evaluate(() => document.getElementById('bCheck').click()); await page.waitForTimeout(100);
  ok(await page.evaluate((B) => !!window.__mockFs.files[(B + 'check_now.flag').toLowerCase()], B), 'Check now writes the flag');
};
