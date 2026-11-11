// Every tab and every view opens without a script error (light and Slate)
module.exports = async ({ page, errors, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const real = () => errors.filter(e => !/^DIALOG/.test(e));
  for (const theme of ['light', 'slate']) {
    await page.evaluate(th => { var s = LT.settings(); s.theme = th; LT.saveSettings(s); LTMain.themeChanged(); }, theme);
    const keys = await page.evaluate(() => [].map.call(document.querySelectorAll('.nb'), b => b.getAttribute('data-k')));
    for (const k of keys) {
      await page.click('.nb[data-k="' + k + '"]'); await page.waitForTimeout(350); await page.mouse.move(900, 600);
      const f = page.frame({ url: new RegExp(k + '\\.html') });
      const views = await f.evaluate(() => [].map.call(document.querySelectorAll('#views [data-v], #fcv [data-fv]'), b => b.getAttribute('data-v') ? '[data-v="' + b.getAttribute('data-v') + '"]' : '[data-fv="' + b.getAttribute('data-fv') + '"]'));
      for (const v of views) { await f.click(v); await page.waitForTimeout(250); }
      if (views.length) await f.click(views[0]);
    }
    ok(real().length == 0, theme + ': every tab and view opens without a script error' + (real().length ? ': ' + real().join(' | ') : ''));
  }
};
