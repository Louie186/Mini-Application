// Drawing Register: "+ set" on empty Tower / Typology / Model picks from the models table (one row or all ticked); typing in Search doesn't redraw
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    LT.saveJson(LT.dataPath('register.json'), { current: 'p1', projects: [{ id: 'p1', name: 'Akala' }] });
    const D = {}, mk = (n, tw, ty, t) => { const k = '5013-KEO-' + (tw || 'XX') + '-ZZ-PLN-INT-' + n; D[k] = { num: k, title: t, rev: 'T1', inMidp: true, tower: tw, typo: ty, ok: !!ty, cat: 'APARTMENTS' }; return k; };
    mk('10100', 'T1', '1BRA', 'UNIT 1BR TYPE A - PLAN'); mk('10101', 'T1', '', 'UNIT 1BR TYPE A - ELEVATIONS'); mk('10102', '', '', 'TYPICAL DETAILS'); mk('10103', '', '', 'MORE DETAILS'); mk('10104', 'T2', '9XX', 'ODD TYPE PLAN');
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', drawings: D, sets: [], filters: [], changes: {}, history: [], last: { file: 'MIDP.xlsx', date: LT.today(), count: 5 },
      models: [{ tower: 'T1', typo: '1BRA', model: 'INT-21000' }, { tower: 'T1', typo: '1BRB', model: 'INT-21001' }, { tower: 'T2', typo: '2BRC', model: 'INT-22000' }] });
  });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500);
  const r = page.frame({ url: /register\.html/ }); await r.evaluate(() => { if (window.loadAll) loadAll(); view = 'midp'; render(); });
  await page.waitForTimeout(200);
  const row = n => r.evaluate(n => { const tr = [...document.querySelectorAll('#tbl tr[data-k]')].find(t => t.getAttribute('data-k').indexOf(n) >= 0); return [...tr.cells].map(c => c.innerText.trim()).join(' | '); }, n);
  ok(await r.evaluate(() => document.querySelectorAll('#tbl [data-as]').length) >= 5 && /\+ set/.test(await row('10102')), '"+ set" in the empty Tower / Typology / Model cells: ' + await row('10102'));
  // single: model for 10101 (tower T1 known) -> T1 models first
  await r.click('#tbl tr[data-k*="10101"] [data-as="typo"]'); await page.waitForTimeout(80);
  ok(await r.evaluate(() => $('asPk').style.display == 'block' && /Set the Typology of/.test($('asH').innerText) && /^1BRA/.test(document.querySelector('#asL .asI').innerText) && document.querySelector('#asL .asI').className.indexOf('top') > 0), 'Typology list: T1 typologies first');
  await r.click('#asL .asI[data-ai="0"]'); await page.waitForTimeout(100);
  ok(/T1 \| 1BRA \| INT-21000/.test(await row('10101')), 'picked 1BRA: the model follows from the table: ' + await row('10101'));
  // bulk: tick 10102 + 10103, set Model INT-22000 -> tower + typology filled too
  await r.evaluate(() => { ticked = {}; Object.keys(P.drawings).forEach(k => { if (/1010[23]/.test(k)) ticked[k] = 1; }); render(); });
  await r.click('#tbl tr[data-k*="10102"] [data-as="model"]'); await page.waitForTimeout(80);
  ok(await r.evaluate(() => /2 ticked rows/.test($('asH').innerText)), 'ticked row: applies to the 2 ticked rows');
  await r.evaluate(() => { $('res').scrollLeft = 0; }); await page.screenshot({ path: out + '/reg_picker.png' });
  await r.fill('#asQ', '22000'); await r.press('#asQ', 'Enter'); await page.waitForTimeout(100);
  ok(/T2 \| 2BRC \| INT-22000/.test(await row('10102')) && /T2 \| 2BRC \| INT-22000/.test(await row('10103')), 'bulk: Model INT-22000 (+ its Tower and Typology) on both');
  ok(await r.evaluate(() => { const d = Object.values(LT.readJson(LT.registerFile('p1')).drawings).find(x => /10103/.test(x.num)); return d.model == 'INT-22000' && d.ok; }), 'saved');
  // a typed new value
  await r.click('#tbl tr[data-k*="10104"] [data-as="model"]'); await r.fill('#asQ', 'INT-29999'); await r.press('#asQ', 'Enter'); await page.waitForTimeout(100);
  ok(/INT-29999/.test(await row('10104')), 'a model typed that is not in the list');
  await page.screenshot({ path: out + '/reg_assign.png' });
  // search: no redraw while typing
  await r.evaluate(() => { window.__t = $('tbl'); });
  await r.type('#search', 'detail', { delay: 20 }); await page.waitForTimeout(100);
  const vis = await r.evaluate(() => [...document.querySelectorAll('#tbl tr[data-k]')].filter(t => t.style.display != 'none').length);
  ok(vis == 2 && await r.evaluate(() => $('tbl') === window.__t && /filtered: 2 shown/.test($('sum').innerText)), 'Search hides / shows rows in place (same table, 2 shown)');
  await r.fill('#search', ''); await r.press('#search', 'Backspace'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => [...document.querySelectorAll('#tbl tr[data-k]')].filter(t => t.style.display != 'none').length == 5 && $('tbl') === window.__t), 'cleared: all back, still no redraw');
};
