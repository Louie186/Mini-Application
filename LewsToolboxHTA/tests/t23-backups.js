// Keeping your data safe: daily backup, Back up now, Restore, the warning while the data is inside the program folder
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const files = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  // the warning (data folder still next to the program)
  await page.waitForTimeout(1800);
  ok(await page.evaluate(() => LT.$('dataWarn').style.display == 'block' && /inside the program folder/.test(LT.$('dataWarn').innerText) && !!LT.$('wMove') && LT.$('warn').style.display != 'block'), 'start: a small box in the side menu says the data is inside the program folder, with "Move it" (nothing covers the tabs)');
  await page.screenshot({ path: out + '/t_warning.png' });
  // some data, then the daily backup
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(400); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.fill('#quick', 'Check RFI drawings fri'); await t.press('#quick', 'Enter');
  const day = await page.evaluate(() => { var s = LT.settings(); delete s.lastBackup; LT.saveSettings(s); var r = LT.dailyBackup(); return r && r.name; });
  const today = await page.evaluate(() => LT.today());
  let f = await files();
  ok(day == today && f.some(p => new RegExp('Backups\\\\' + today + '\\\\tracker\\.json$').test(p)), 'daily backup: Backups\\' + today + ' has tracker.json');
  ok(await page.evaluate(() => LT.dailyBackup() === null), 'only once a day');
  // Back up now + Restore (Settings)
  await page.click('.nb[data-k="settings"]'); await page.waitForTimeout(400); await page.mouse.move(900, 600);
  const st = page.frame({ url: /settings\.html/ });
  ok(await st.evaluate(() => /inside the program folder/.test(LT.$('dataPath').innerText) && /Newest: /.test(LT.$('bkLast').innerText)), 'Settings: data folder warning + newest backup shown');
  await st.click('#bBackup'); await page.waitForTimeout(150);
  ok(await st.evaluate(() => LT.backups().some(b => /\(manual\)$/.test(b.name))), 'Back up now: a "(manual)" backup');
  await page.screenshot({ path: out + '/t_settings_backups.png' });
  // a mistake: the tasks get wiped, then restored
  await page.evaluate(() => { const fs = window.__mockFs, k = Object.keys(fs.files).find(x => /lewstoolbox-data\\tracker\.json$/.test(x)); fs.files[k].text = JSON.stringify({ tasks: [], view: 'today' }); });
  await st.evaluate(() => { var o = LT.$('bkList').options; for (var i = 0; i < o.length; i++) if (/\(manual\)/.test(o[i].text)) LT.$('bkList').selectedIndex = i; window.confirm = () => true; });
  await st.click('#bRestore'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => { var k = Object.keys(window.__mockFs.files).find(x => /lewstoolbox-data\\tracker\.json$/.test(x)); return JSON.parse(window.__mockFs.files[k].text).tasks.length == 1; }), 'Restore: the task is back');
  ok(await st.evaluate(() => LT.backups().some(b => /\(before restore\)$/.test(b.name))), 'what was there before the restore is kept as "(before restore)"');
  f = await files();
  ok(!f.some(p => /Backups\\[^\\]+\\Backups\\/.test(p)) && !f.some(p => /Backups\\[^\\]+\\exports\\/.test(p)), 'no backups inside backups, exports left out');
  // only the newest 14 daily backups are kept
  const kept = await page.evaluate(() => { const fs = window.__mockFs, b = LT.backupDir(); for (let i = 1; i <= 20; i++) { const n = b + '\\2025-01-' + String(i).padStart(2, '0'); fs.dirs[n.toLowerCase()] = n; fs.files[(n + '\\tracker.json').toLowerCase()] = { path: n + '\\tracker.json', text: '{}', time: 0 }; } LT.pruneBackups(); return LT.backups().filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.name)).length; });
  ok(kept == 14, 'old daily backups cleared: 14 kept');
  // moving the data out of the program folder: no more warning
  await st.evaluate(() => { top.__nextFolder = 'D:\\OneDrive'; window.confirm = () => true; }); await page.evaluate(() => { window.__mockFs.dirs['d:\\onedrive'] = 'D:\\OneDrive'; });
  await st.click('#bData'); await page.waitForTimeout(200);
  ok(await st.evaluate(() => LT.dataDir() == 'D:\\OneDrive\\LewsToolbox-data' && /safe when you update/.test(LT.$('dataPath').innerText)), 'Change folder: data in D:\\OneDrive\\LewsToolbox-data, "safe when you update the Toolbox"');
  ok(await page.evaluate(() => LT.$('dataWarn').style.display == 'none'), 'the box goes away once the data is outside the program folder');
};
