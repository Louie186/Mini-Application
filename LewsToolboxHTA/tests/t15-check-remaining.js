// Submission Check: "Remaining on top" toggle (not yet in the folder first)
const base = require('./t5-check.js');
module.exports = async (ctx) => {
  const { page, out } = ctx; const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await base(ctx);   // same made-up folder + list, check already run
  const f = page.frame({ url: /check\.html/ });
  await f.selectOption('#show', 'all'); await page.waitForTimeout(150);
  ok(await f.evaluate(() => $('remTop').checked), 'Remaining on top is on by default');
  const order = await f.evaluate(() => shown.filter(r => r.status).map(r => r.status).join('|'));
  console.log('   ' + order);
  ok(order == 'Missing|Missing file type|Wrong revision|Found|Wrong folder|Found|Listed twice|Found', 'not yet in the folder on top: missing, missing file type, wrong revision, then list order');
  const heads = await f.evaluate(() => [].map.call(document.querySelectorAll('#res tr.grp'), x => x.innerText.replace(/\s+/g, ' ').trim()).join(' / '));
  ok(/Remaining – not yet in the folder 3/.test(heads) && /In the folder 5/.test(heads), 'two headings: Remaining 3 / In the folder 5 (' + heads + ')');
  ok(await f.evaluate(() => $('remN').innerText == '3'), 'count next to the toggle: 3');
  await page.screenshot({ path: out + '/n_check_remaining.png' });
  await f.click('#remTop'); await page.waitForTimeout(150);
  ok(await f.evaluate(() => shown.filter(r => r.status).map(r => r.no).join(',') == last.rows.map(r => r.no).join(',') && !document.querySelector('#res tr.grp')), 'toggle off: back to the list order, no headings');
  ok(await f.evaluate(() => { loadCfg(); return cfg.remTop === false; }), 'the choice is remembered');
  await f.click('#remTop');
  await f.selectOption('#show', 'bad'); await page.waitForTimeout(150);
  ok(await f.evaluate(() => shown.filter(r => r.status)[0].status == 'Missing'), 'Problems only: missing still first');
};
