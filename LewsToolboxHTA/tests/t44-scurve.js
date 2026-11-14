// Drawing Register > S-curve: plan (standard S between two dates) against what the Transmittal log says was issued
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const quiet = fr => fr.evaluate(() => { window.confirm = () => true; window.alert = m => { window.__al = m; }; });
  const dmy = n => page.evaluate(n => { var d = new Date(Date.now() + n * 864e5); return LT.pad(d.getDate()) + '/' + LT.pad(d.getMonth() + 1) + '/' + d.getFullYear(); }, n);
  await page.evaluate(() => { const iso = n => LT.iso(new Date(Date.now() + n * 864e5));
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Akala' }], current: 'p1' });
    var D = {}; for (var i = 0; i < 20; i++) { var k = 'T1-ZZ-DR-A-' + (5000 + i); D[k] = { num: k, title: 'Plan ' + i, ok: true, tower: 'T1', typo: '1BRA' }; }
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', setup: {}, rules: [], models: [], history: [], changes: {}, drawings: D, sets: [] });
    var it = a => a.map(n => ({ number: 'T1-ZZ-DR-A-' + (5000 + n), rev: 'P01' }));
    LT.saveJson(LT.dataPath('transmittals.json'), { next: 5, prefix: 'TR-', log: [
      { no: 'TR-001', date: iso(-40), to: 'Client', items: it([0, 1]) }, { no: 'TR-002', date: iso(-20), to: 'Client', items: it([2, 3]) },
      { no: 'TR-003', date: iso(-3), to: 'Client', items: it([4, 5, 0]) }] });     // 0 again: counted once, at its first issue
  });
  await page.click('.nb[data-k="register"]'); await page.mouse.move(900, 690); await page.waitForTimeout(800);
  const r = page.frame({ url: /register\.html/ }); await quiet(r);
  await r.evaluate(() => { view = 'scurve'; render(); });
  ok(/S-curve/.test(await r.evaluate(() => $('views').innerText)), 'a 📈 S-curve view next to Models');
  ok(await r.evaluate(() => /Type the finish date/.test($('res').innerText) && !!document.querySelector('#res svg polyline')), 'no finish date yet: asks for it, still draws the actual progress');
  const s = await dmy(-56), f = await dmy(56);
  await r.evaluate(([s, f]) => { $('scS').value = s; $('scF').value = f; $('scF').onchange(); }, [s, f]); await page.waitForTimeout(150);
  const txt = await r.evaluate(() => $('res').innerText);
  ok(await r.evaluate(() => document.querySelectorAll('#res svg polyline').length == 2), 'with start + finish: two lines - plan (dashed) and actual');
  ok(/Issued so far\s*6 of 20/.test(txt) && /30%/.test(txt), 'issued so far: 6 of 20 (30%) - the repeat issue of one drawing counts once');
  ok(/Planned by today\s*10/.test(txt) && /50%/.test(txt), 'planned by today: 10 (50%) - half way along a standard S');
  ok(/Behind plan\s*-4/.test(txt) && /-20 pts/.test(txt), 'behind plan by 4 drawings (-20 points)');
  ok(/Pace \(last 4 weeks\)\s*1 per week/.test(txt) && /done about/.test(txt), 'pace 1 per week over the last 4 weeks, with the date it would finish at that pace');
  ok(await r.evaluate(() => P.scurve.start && P.scurve.finish && P.scurve.shape == 's'), 'the dates are saved with the project');
  await page.screenshot({ path: out + '/s_curve.png' });
  await r.evaluate(() => { $('scP').value = 'line'; $('scP').onchange(); }); await page.waitForTimeout(100);
  ok(/Planned by today\s*10/.test(await r.evaluate(() => $('res').innerText)) && await r.evaluate(() => P.scurve.shape == 'line'), 'straight-line plan: also 10 at the middle');
  await r.evaluate(() => { $('scT').value = '30'; $('scT').onchange(); }); await page.waitForTimeout(100);
  ok(/Issued so far\s*6 of 30/.test(await r.evaluate(() => $('res').innerText)), 'a different total (30 drawings) is used for the plan');
  await r.click('#scX'); await page.waitForTimeout(150);
  const csv = await page.evaluate(() => { var k = Object.keys(window.__mockFs.files).filter(p => /S-curve_.*\.csv$/i.test(p))[0]; return k ? window.__mockFs.files[k].text : ''; });
  ok(/Week ending.*Planned.*Issued/.test(csv) && csv.split('\n').length > 10, 'Export (CSV): week by week, planned and issued (to make your own chart in Excel)');
};
