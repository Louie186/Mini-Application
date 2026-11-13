// Drawing Register: a filter box under each heading (words; -word leaves out), saved filters, column widths (also from the heading that stays on top)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'T' }], current: 'p1' });
    var D = {}, n = 0, put = (title, cat, typo) => { n++; var k = 'T1-ZZ-DR-A-' + (1000 + n); D[k] = { num: k, title: title, cat: cat, tower: 'T1', typo: typo, ok: true }; };
    for (var i = 0; i < 12; i++) put('Residential Unit ' + i + ' - Enlarged Plan', 'RESIDENTIAL', '1BRA');
    put('Residential Unit - Enlarged Kitchen', 'RESIDENTIAL', '1BRA'); put('Residential Unit - Plan', 'RESIDENTIAL', '2BRB');
    for (var j = 0; j < 30; j++) put('Hotel room ' + j + ' - Enlarged Plan', 'HOTEL', 'K1');
    LT.saveJson(LT.registerFile('p1'), { name: 'T', setup: {}, rules: [], models: [], history: [], changes: {}, drawings: D }); });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500); await page.mouse.move(900, 650);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { loadAll(); view = 'all'; render(); });
  ok(await r.evaluate(() => $('tbl').querySelectorAll('input.cfi').length == 8), 'a filter box under every heading (Drawing, Rev, Title, Section, Tower, Typology, Model, Note)');
  await r.fill('input.cfi[data-cf="cat"]', 'residential'); await r.press('input.cfi[data-cf="cat"]', 'l'); await r.press('input.cfi[data-cf="cat"]', 'Backspace'); await page.waitForTimeout(500);
  ok(await r.evaluate(() => shown.length == 14), 'Section: "residential" → 14');
  await r.fill('input.cfi[data-cf="title"]', 'enlarged'); await r.press('input.cfi[data-cf="title"]', 'd'); await r.press('input.cfi[data-cf="title"]', 'Backspace'); await page.waitForTimeout(500);
  ok(await r.evaluate(() => shown.length == 13), '+ Title: "enlarged" → 13 (Residential Enlarged only)');
  ok(await r.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-cf') == 'title'), 'you keep typing in the same box');
  await r.fill('input.cfi[data-cf="title"]', 'enlarged -kitchen'); await r.press('input.cfi[data-cf="title"]', 'n'); await r.press('input.cfi[data-cf="title"]', 'Backspace'); await page.waitForTimeout(500);
  ok(await r.evaluate(() => shown.length == 12), '"enlarged -kitchen" leaves the kitchen out → 12');
  await page.screenshot({ path: out + '/g_filters.png' });
  // save it, clear, apply
  await r.evaluate(() => { window.prompt = () => 'Residential Enlarged'; }); await r.click('#fSaved'); await r.click('#menu .mi >> text=Save the filter');
  await r.click('#fClear'); await page.waitForTimeout(200);
  ok(await r.evaluate(() => shown.length == 44 && !cfOn()), 'Clear filters: everything (44)');
  await r.click('#fSaved'); await r.click('#menu .mi >> text=Residential Enlarged'); await page.waitForTimeout(200);
  ok(await r.evaluate(() => shown.length == 12 && $('tbl').querySelector('input.cfi[data-cf="title"]').value == 'enlarged -kitchen' && LT.readJson(LT.registerFile('p1')).filters.length == 1), 'Saved filters ▾ > Residential Enlarged: back in one click (saved with the project)');
  // resize a column from the table heading
  await r.click('#fClear'); await page.waitForTimeout(200);
  const fr = await (await r.frameElement()).boundingBox();
  let g = await r.evaluate(() => { const b = document.querySelector('#tbl .rz[data-rz="cat"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + 8]; });
  await page.mouse.move(fr.x + g[0], fr.y + g[1]); await page.mouse.down(); await page.mouse.move(fr.x + g[0] + 80, fr.y + g[1], { steps: 4 }); await page.mouse.up();
  ok(await r.evaluate(() => colW().cat == 280), 'Section made wider (200 → 280), remembered');
  // scroll down: the heading on top still resizes
  await r.evaluate(() => { $('res').scrollTop = 600; $('res').dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(300);
  const has = await r.evaluate(() => { var ov = document.querySelector('.fhc'); return ov && ov.style.display != 'none' && !!ov.querySelector('.rz[data-rz="rev"]'); });
  ok(has, 'scrolled down: the heading on top has the column edges too');
  if (has) { g = await r.evaluate(() => { const b = document.querySelector('.fhc .rz[data-rz="rev"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + 8]; });
    await page.mouse.move(fr.x + g[0], fr.y + g[1]); await page.mouse.down(); await page.mouse.move(fr.x + g[0] + 60, fr.y + g[1], { steps: 4 }); await page.mouse.up();
    ok(await r.evaluate(() => colW().rev == 120), 'dragging an edge in the heading on top works (Rev 60 → 120)'); }
  ok(await r.evaluate(() => !document.querySelector('#tbl th .rz[data-rz="num"]')), 'the Drawing number column stays as it is');
};
