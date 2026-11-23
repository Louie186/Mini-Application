// Drawing Register: edit window with drop-downs that only offer aligned Tower / Typology / Model; conflicts blocked and flagged; "+ set" opens it; Search doesn't redraw
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    LT.saveJson(LT.dataPath('register.json'), { current: 'p1', projects: [{ id: 'p1', name: 'Akala' }] });
    const D = {}, mk = (n, tw, ty, t, m) => { const k = '5013-KEO-' + (tw || 'XX') + '-ZZ-PLN-INT-' + n; D[k] = { num: k, title: t, rev: 'T1', inMidp: true, tower: tw, typo: ty, ok: !!ty, cat: 'APARTMENTS', model: m || '' }; return k; };
    mk('10100', 'T1', '1BRA', 'UNIT 1BR TYPE A - PLAN'); mk('10101', 'T1', '', 'UNIT 1BR TYPE A - ELEVATIONS'); mk('10102', '', '', 'TYPICAL DETAILS'); mk('10103', '', '', 'MORE DETAILS');
    mk('10104', 'T2', '9XX', 'ODD TYPE PLAN', 'INT-21000');   // fine: one model can hold several typologies
    mk('10105', 'T1', '1BRA', 'UNIT 1BR TYPE A - ODD', 'INT-29999');   // a conflict: T1 · 1BRA already has INT-21000
    mk('00000', '-', '-', 'COVER SHEET');
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', drawings: D, sets: [], filters: [], changes: {}, history: [], last: { file: 'MIDP.xlsx', date: LT.today(), count: 6 },
      models: [{ tower: 'T1', typo: '1BRA', model: 'INT-21000' }, { tower: 'T1', typo: '1BRB', model: 'INT-21001' }, { tower: 'T2', typo: '2BRC', model: 'INT-22000' }] });
  });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500);
  const r = page.frame({ url: /register\.html/ }); await r.evaluate(() => { if (window.loadAll) loadAll(); view = 'midp'; render(); });
  await page.waitForTimeout(200);
  const row = n => r.evaluate(n => { const tr = [...document.querySelectorAll('#tbl tr[data-k]')].find(t => t.getAttribute('data-k').indexOf(n) >= 0); return [...tr.cells].map(c => c.innerText.trim()).join(' | '); }, n);
  const opts = id => r.evaluate(id => [...$(id).options].map(o => o.text), id);
  // conflicts already in the list are flagged
  ok(/CONFLICT/.test(await row('10105')) && /CONFLICT/.test(await row('10100')) && !/CONFLICT/.test(await row('10104')) && /2 conflict/.test(await r.evaluate(() => $('sum').innerText)), 'a Tower + Typology with two models: flagged CONFLICT (a model on two typologies is fine)');
  // "+ set" opens the edit window (no editing in the list)
  await r.click('#tbl tr[data-k*="10101"] [data-as="typo"]'); await page.waitForTimeout(80);
  ok(await r.evaluate(() => $('ovEdit').style.display == 'block' && $('edTowerS').value == 'T1'), '"+ set" opens the edit window with drop-downs');
  let ty = await opts('edTypoS');
  ok(ty.some(t => /^1BRA · INT-21000/.test(t)) && ty.some(t => /^1BRB · INT-21001/.test(t)) && ty.includes('2BRC') && /New typology/.test(ty.join()), 'Typology: Tower T1 ones (with their model) first, other towers after, New...: ' + ty.join(' / '));
  await r.selectOption('#edTypoS', '1BRA');
  let md = await opts('edModelS');
  ok(md[1] == 'INT-21000' && md.some(t => /from the list: INT-21000/.test(t)) && md.some(t => /^INT-22000 — T2 · 2BRC/.test(t)), 'Model: the one that goes with T1 · 1BRA first, then all models with their Tower · Typology: ' + md.join(' / '));
  // a model of another pair for T1 · 1BRA -> blocked
  await r.selectOption('#edModelS', 'INT-22000'); await page.waitForTimeout(50);
  ok(await r.evaluate(() => $('edTowerS').value == 'T2' && $('edTypoS').value == '2BRC'), 'picking a model fills its Tower + Typology (T2 · 2BRC)');
  await r.selectOption('#edTowerS', 'T1'); await r.selectOption('#edTypoS', '1BRA'); await r.selectOption('#edModelS', '\u0001new'); await r.fill('#edModel', 'INT-22000'); await r.dispatchEvent('#edModel', 'keyup');
  ok(await r.evaluate(() => $('edOk').disabled && /already has model INT-21000/.test($('edHint').innerText)), 'a second model for T1 · 1BRA: flagged, Save is off');
  await r.selectOption('#edModelS', ''); 
  ok(await r.evaluate(() => !$('edOk').disabled && /Model from the list: INT-21000/.test($('edHint').innerText)), 'back to the table model: fine');
  await r.click('#edOk'); await page.waitForTimeout(100);
  ok(/T1 \| 1BRA \| INT-21000/.test(await row('10101')), 'saved: T1 | 1BRA | INT-21000');
  // model first on an empty drawing: one pair -> filled in
  await r.dblclick('#tbl tr[data-k*="10102"] td:nth-child(5)'); await page.waitForTimeout(80);
  await r.selectOption('#edModelS', 'INT-21001');
  ok(await r.evaluate(() => $('edTowerS').value == 'T1' && $('edTypoS').value == '1BRB' && $('edPairBox').style.display == 'none' && !$('edOk').disabled), 'model first: INT-21001 -> Tower T1, Typology 1BRB filled in');
  await r.click('#edOk'); await page.waitForTimeout(100);
  ok(/T1 \| 1BRB \| INT-21001/.test(await row('10102')), 'saved: ' + await row('10102'));
  // a model with several typologies -> pick which
  await r.dblclick('#tbl tr[data-k*="10103"] td:nth-child(5)'); await page.waitForTimeout(80);
  await r.selectOption('#edModelS', 'INT-21000');
  const pairs = await opts('edPair');
  ok(await r.evaluate(() => $('edPairBox').style.display == 'block') && pairs.join() == 'Pick the Tower + Typology…,T1 · 1BRA,T2 · 9XX', 'INT-21000 has 2 typologies: "which one?" with T1 · 1BRA / T2 · 9XX');
  await page.screenshot({ path: out + '/reg_edit.png' });
  await r.selectOption('#edPair', '1');
  ok(await r.evaluate(() => $('edTowerS').value == 'T2' && $('edTypoS').value == '9XX' && $('edPairBox').style.display == 'none'), 'picked T2 · 9XX: filled in');
  await r.click('#edOk'); await page.waitForTimeout(100);
  ok(/T2 \| 9XX \| INT-21000/.test(await row('10103')), 'saved: ' + await row('10103'));
  await r.dblclick('#tbl tr[data-k*="10101"] td:nth-child(5)'); await page.waitForTimeout(80);
  await r.click('#edCancel');
  // bulk with "leave as it is"
  await r.evaluate(() => { ticked = {}; Object.keys(P.drawings).forEach(k => { if (/1010[01]/.test(k)) ticked[k] = 1; }); render(); });
  await r.click('#tickBar button'); await page.waitForTimeout(80);
  ok(await r.evaluate(() => $('edTowerS').value == '\u0001keep' && $('edTypoS').value == '\u0001keep' && $('edModelS').value == '\u0001keep'), 'several drawings: every box starts on "(leave as it is)"');
  await r.click('#edCancel');
  // search: no redraw while typing
  await r.evaluate(() => { window.__t = $('tbl'); });
  await r.type('#search', 'detail', { delay: 20 }); await page.waitForTimeout(100);
  const vis = await r.evaluate(() => [...document.querySelectorAll('#tbl tr[data-k]')].filter(t => t.style.display != 'none').length);
  ok(vis == 2 && await r.evaluate(() => $('tbl') === window.__t && /filtered: 2 shown/.test($('sum').innerText)), 'Search hides / shows rows in place (same table, 2 shown)');
  await r.fill('#search', ''); await r.press('#search', 'Backspace'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => [...document.querySelectorAll('#tbl tr[data-k]')].filter(t => t.style.display != 'none').length == 7 && $('tbl') === window.__t), 'cleared: all back, still no redraw');
};
