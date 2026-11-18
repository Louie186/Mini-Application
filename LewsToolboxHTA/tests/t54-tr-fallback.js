// Safety net: if core\lt-transmittal.js didn't load in a page, the first LT.trIssued() etc. reads it from the core folder
const fs = require('fs'), path = require('path');
module.exports = async ({ page }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const trText = fs.readFileSync(path.join(__dirname, '..', 'core', 'lt-transmittal.js'), 'utf8');
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(400);
  const f = page.frame({ url: /register\.html/ });
  ok(await f.evaluate(() => /RORD|s\.log/.test('' + LT.trIssued)), 'normal load: the real helpers are used');
  // load lt-core again on its own (as if lt-transmittal.js had failed): LT now only has the stubs
  await f.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.src = '../core/lt-core.js'; s.onload = r; document.head.appendChild(s); }));
  ok(await f.evaluate(() => !/s\.log/.test('' + LT.trIssued)), 'without the file: stubs in place');
  await f.evaluate((t) => { const p = LT.appDir() + '\\core\\lt-transmittal.js', fs = window.top.__mockFs || window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; }, trText);
  const r = await f.evaluate(() => { try { const o = LT.trIssued(); return typeof o == 'object' && /s\.log/.test('' + LT.trIssued) && LT.revCmp('C02', 'C01') > 0 && LT.trSplit('A-10100-C02').rev == 'C02'; } catch (e) { return 'ERR ' + e.message; } });
  ok(r === true, 'first call reads core\\lt-transmittal.js and works (' + r + ')');
};
