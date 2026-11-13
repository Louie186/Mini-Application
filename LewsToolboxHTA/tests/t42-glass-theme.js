// Glass / Glass Light themes: translucent panels over a glow; the sun / moon switch moves between them; every tab opens
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { var s = LT.settings(); s.theme = 'glass'; LT.saveSettings(s); LTMain.themeChanged(); }); await page.waitForTimeout(400);
  ok(await page.evaluate(() => { var cs = getComputedStyle(document.body); return /gradient/.test(cs.backgroundImage) && /rgba/.test(getComputedStyle(document.getElementById('nav')).borderTopColor); }), 'Glass: a glow behind the window, a light edge on the panels');
  ok(await page.evaluate(() => /Glass/.test(document.body.innerHTML) || !!LT.THEMES.glass && !!LT.THEMES.glasslight), 'both Glass and Glass Light are in the theme list');
  ok(await page.evaluate(() => document.getElementById('tsD').className == 'on'), 'dark Glass: the moon is on');
  await page.click('#tsL'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => LT.settings().theme == 'glasslight' && document.getElementById('tsL').className == 'on'), '☀ switches to Glass Light (stays in the Glass family)');
  await page.click('#tsD'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => LT.settings().theme == 'glass'), '☾ back to Glass');
  const errs = [];
  for (const th of ['glass', 'glasslight']) {
    await page.evaluate(t => { var s = LT.settings(); s.theme = t; LT.saveSettings(s); LTMain.themeChanged(); }, th); await page.waitForTimeout(300);
    for (const k of ['home', 'launcher', 'tracker', 'delegate', 'transmittal', 'register', 'check', 'files', 'folders', 'settings']) { try { await page.click('.nb[data-k="' + k + '"]', { timeout: 3000 }); await page.mouse.move(900, 680); await page.waitForTimeout(250); } catch (e) { errs.push(th + ':' + k); } }
  }
  ok(!errs.length, 'every tab opens in both Glass themes ' + errs.join());
  ok(await page.evaluate(() => { var f = document.querySelector('iframe'); var cs = f.contentWindow.getComputedStyle(f.contentDocument.body); return /gradient/.test(cs.backgroundImage); }), 'the tabs carry the same glow (no white page behind the glass)');
};
