// Smooth mode: no animations, glass without a fixed background, menu not rebuilt on every click, Home skips re-reading unchanged data,
// the folder check waits while you are working, graphics-acceleration switch (user setting) on / off
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const quiet = fr => fr.evaluate(() => { window.confirm = () => true; window.alert = m => { window.__al = m; }; });
  ok(await page.evaluate(() => LT.smooth() === true && LT.themeVars().smooth == 1), 'Smooth mode is on by default');
  for (const th of ['ember', 'glass', 'studio']) {
    await page.evaluate(t => { var s = LT.settings(); s.theme = t; LT.saveSettings(s); LTMain.themeChanged(); }, th); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { var b = document.querySelector('.tb') || document.getElementById('newB'), cs = getComputedStyle(document.getElementById('newB')), n = getComputedStyle(document.getElementById('nav')); return [cs.transitionDuration, getComputedStyle(document.body).backgroundAttachment]; });
    ok(/^0s(, 0s)*$/.test(r[0]) && r[1] != 'fixed', th + ': no transitions, no fixed background (' + r.join(' / ') + ')');
  }
  // menu not rebuilt when you switch tabs
  await page.evaluate(() => { document.querySelector('.nb[data-k="home"]').__keep = 1; });
  await page.click('.nb[data-k="tracker"]'); await page.mouse.move(900, 680); await page.waitForTimeout(300); await page.click('.nb[data-k="home"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.nb[data-k="home"]').__keep == 1 && document.querySelector('.nb.on').getAttribute('data-k') == 'home'), 'switching tabs only moves the highlight (the menu is not rebuilt)');
  // Home: unchanged data = no re-draw
  const h = page.frame({ url: /home\.html/ }); await quiet(h);
  await h.evaluate(() => { render(true); window.__l = links; render(); window.__same = (window.__l === links); LT.saveJson(LT.dataPath('tracker.json'), { seq: 1, tasks: [{ id: 'z', code: 'TL-001', title: 'New thing', status: 'To do', log: [], subs: [] }] }); });
  ok(await h.evaluate(() => window.__same === true), 'Home: nothing changed = it does not read all the files again');
  await h.evaluate(() => { window.__l2 = links; render(); });
  ok(await h.evaluate(() => links !== window.__l2 && /New thing|1/.test($('kpis').innerText)), 'Home: a data file changed = it draws again');
  ok(await h.evaluate(() => { var s = document.querySelectorAll('#stand .seg i'); for (var i = 0; i < s.length; i++) if (!s[i].style.width) return false; return true; }), 'Home (smooth): the bars are at full width at once (no growing / counting)');
  // the folder check waits while you work
  await page.evaluate(() => { window.__mockFs.dirs['c:\\inbox'] = 'C:\\Inbox'; LT.watchAdd('C:\\Inbox'); window.__mockFs.files['c:\\inbox\\a-1.pdf'] = { path: 'C:\\Inbox\\a-1.pdf', text: 'X', time: Date.now() }; top.__act = new Date().getTime(); background(0); });
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => LT.watchPending() == 0), 'you are working: the folder check waits');
  await page.evaluate(() => { top.__act = 0; });
  await page.waitForTimeout(4600);
  ok(await page.evaluate(() => LT.watchPending() == 1), 'you stopped for a moment: it checks (a folder at a time) and finds the new file');
  await page.evaluate(() => LTMain.background()); await page.waitForTimeout(300);
  ok(await page.evaluate(() => LT.watchLoad().folders[0].at > 0), 'Home > Refresh checks right away');
  // Settings: the switch + graphics acceleration
  await page.click('.nb[data-k="settings"]'); await page.mouse.move(900, 680); await page.waitForTimeout(600);
  const st = page.frame({ url: /settings\.html/ }); await quiet(st);
  await st.evaluate(() => { window.__reg = {}; LT.wsh.RegRead = function (k) { if (window.__reg[k] == null) throw new Error('none'); return window.__reg[k]; }; LT.wsh.RegWrite = function (k, v) { window.__reg[k] = v; }; LT.wsh.RegDelete = function (k) { delete window.__reg[k]; }; gpuShow(); });
  ok(await st.evaluate(() => LT.$('smooth').checked && /off/.test(LT.$('gpuInfo').innerText)), 'Settings > Speed: Smooth mode ticked, graphics acceleration off');
  await st.click('#bGpu'); await page.waitForTimeout(100);
  ok(await st.evaluate(() => /FEATURE_GPU_RENDERING\\mshta\.exe/.test(Object.keys(window.__reg).join()) && window.__reg[Object.keys(window.__reg)[0]] == 1 && /on/.test(LT.$('gpuInfo').innerText)), 'Turn on graphics acceleration: one user setting for mshta.exe (HKCU), shown as on');
  await st.click('#bGpuOff'); await page.waitForTimeout(100);
  ok(await st.evaluate(() => Object.keys(window.__reg).length == 0 && /off/.test(LT.$('gpuInfo').innerText)), 'Turn it off again: the setting is removed');
  await st.click('#smooth'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => LT.settings().smooth === false && !LT.themeVars().smooth), 'Smooth mode off: animations come back');
  await st.click('#smooth'); await page.waitForTimeout(300);
};
