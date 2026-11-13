// Stage 3: incoming watch (Home + bell), weekly report by itself, Models view (Drawing Register), health check, safe update + go back
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  const quiet = fr => fr.evaluate(() => { window.confirm = () => true; window.alert = m => { window.__al = m; }; window.prompt = (q, d) => d; });
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add; window.__touch = p => { fs.files[p.toLowerCase()].time = Date.now() + 5000; };
    ['A-101-P01.pdf', 'A-102-P01.pdf'].forEach(n => add('C:\\Incoming\\' + n, 'X'));
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Tower 1' }], current: 'p1' });
    var D = {}; for (var i = 0; i < 9; i++) { var k = 'T1-ZZ-DR-A-' + (3000 + i); D[k] = { num: k, title: 'Plan ' + i, ok: true, tower: 'T1', typo: i < 5 ? '1BRA' : '2BRB', model: i < 5 ? 'T1-1BRA-Unit Model' : i < 8 ? 'T1-2BRB-Unit Model' : '', st: i == 1 ? 'In progress' : i == 2 ? 'Checked' : '', stAt: LT.today() }; }
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower 1', setup: {}, rules: [], models: [{ tower: 'T1', typo: '1BRA', model: 'T1-1BRA-Unit Model', link: 'https://acc.autodesk.com/1bra' }], history: [], changes: {}, drawings: D, sets: [] });
    LT.saveJson(LT.dataPath('transmittals.json'), { next: 2, prefix: 'TR-', log: [{ no: 'TR-001', date: LT.today(), to: 'Client', items: [{ number: 'T1-ZZ-DR-A-3000', rev: 'P01', files: ['C:\\Gone\\T1-ZZ-DR-A-3000-P01.pdf'] }] }] });
    LT.saveJson(LT.dataPath('tracker.json'), { seq: 1, tasks: [{ id: 'a', code: 'TL-001', title: 'Moved task', status: 'To do', folder: 'C:\\Tasks\\Moved', log: [] }] });
    LT.saveJson(LT.dataPath('bad.json'), null); window.__mockFs.files[LT.dataPath('bad.json').toLowerCase()].text = '{ broken';
  });

  // ---------- incoming watch ----------
  await page.click('.nb[data-k="home"]'); await page.mouse.move(900, 650); await page.waitForTimeout(1200);
  const h = page.frame({ url: /home\.html/ }); await quiet(h);
  ok(/Watch the folders where drawings arrive/.test(await h.evaluate(() => $('incoming').innerText)), 'Home: an Incoming card that explains itself');
  await h.evaluate(() => { LT.pickFolder = () => 'C:\\Incoming'; }); await h.click('#inAdd'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => { var w = LT.watchLoad(); return w.folders.length == 1 && w.folders[0].pending.length == 0 && Object.keys(w.folders[0].seen).length == 2; }), '+ Watch a folder: remembers what is there now (nothing "new" on day one)');
  await page.evaluate(() => { window.__add('C:\\Incoming\\A-103-P01.pdf', 'X'); window.__add('C:\\Incoming\\Sub\\A-104-P01.dwg', 'X'); window.__touch('C:\\Incoming\\A-101-P01.pdf'); });
  await page.evaluate(() => LTMain.background()); await page.waitForTimeout(200);
  const pend = await page.evaluate(() => LT.watchLoad().folders[0].pending.map(p => p.rel + ':' + p.kind).sort().join(' '));
  ok(pend == 'A-101-P01.pdf:changed A-103-P01.pdf:new Sub\\A-104-P01.dwg:new', 'the 10-minute check finds 2 new (also in a subfolder) + 1 changed (' + pend + ')');
  ok(await page.evaluate(() => LT.$('bellN').innerText == '3' && /glow/.test(LT.$('bellB').className)), 'the bell counts them and glows');
  await h.evaluate(() => render());
  ok(await h.evaluate(() => /Incoming\s*3 new/.test($('incoming').innerText) && $('incoming').querySelectorAll('[data-open]').length == 3 && $('nIn').innerText == '3'), 'Home > Incoming: the folder with "3 new" and the files (click opens)');
  await page.click('#bellB'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => /3 new \/ changed files in the folders you watch/.test(LT.$('remind').innerText) && !!LT.$('rIn')), 'the bell list: "3 new / changed files…" + See the new files');
  await page.evaluate(() => LT.$('remind').style.display = 'none');
  await page.screenshot({ path: out + '/s3_incoming.png' });
  await h.click('[data-wseen="0"]'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => LT.watchPending() == 0 && LT.$('bellN').style.display == 'none'), '"Seen": cleared, the bell too');

  // ---------- weekly report by itself ----------
  await page.evaluate(() => LTMain.autoReport()); await page.waitForTimeout(1200);
  const rep = await page.evaluate(() => LT.settings().reportReady || '');
  ok(/exports\\Weekly reports\\WeeklyReport_\d{4}-\d\d-\d\d\.html$/.test(rep) && (await F()).some(p => /Weekly reports\\WeeklyReport_.*\.txt$/.test(p)), 'the weekly report makes itself: a page + text in exports\\Weekly reports');
  ok(await page.evaluate(() => /Weekly report/.test(window.__mockFs.files[LT.settings().reportReady.toLowerCase()].text)), 'the page has the report in it');
  await h.evaluate(() => render());
  ok(await h.evaluate(() => $('repReady').style.display == '' && /Your weekly report is ready/.test($('repReady').innerText)), 'Home: "Your weekly report is ready" with Open / Copy for email');
  await page.screenshot({ path: out + '/s3_report_ready.png' });
  await h.click('#rrX'); ok(await page.evaluate(() => !LT.settings().reportReady), '✕: done with it');
  ok(await page.evaluate(() => { var s = LT.settings(); s.autoReport = true; s.autoReportDay = 1; LT.saveSettings(s); var before = s.lastAutoReport; autoReport(); return before && LT.settings().lastAutoReport == before; }), 'only once a week (already made this week = not again)');

  // ---------- Models view ----------
  await page.click('.nb[data-k="register"]'); await page.mouse.move(900, 650); await page.waitForTimeout(700);
  const r = page.frame({ url: /register\.html/ }); await quiet(r);
  await r.evaluate(() => { view = 'models'; render(); });
  const mv = await r.evaluate(() => $('res').innerText);
  ok(await r.evaluate(() => document.querySelectorAll('.mc').length == 3 && /Models 2/.test($('views').innerText)), 'Drawing Register > Models: a card per model (+ "No model yet"), Models 2 in the views');
  ok(/T1-1BRA-Unit Model/.test(mv) && /20%/.test(mv) && /1 in progress/.test(mv) && /1 checked/.test(mv) && /No model yet/.test(mv), 'each card: the model, % issued (1 of 5 via TR-001), in progress / checked');
  ok(await r.evaluate(() => { var l = document.querySelector('.mc .mlk'); return l && l.getAttribute('data-ml') == 'https://acc.autodesk.com/1bra'; }), 'the model with a link opens with a click (ACC link)');
  await r.click('[data-mo="0"]'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => document.querySelectorAll('.ml div').length == 5 && /T1-ZZ-DR-A-3000/.test($('res').innerText)), 'Show the 5 drawings: each with its status');
  await page.screenshot({ path: out + '/s3_models.png' });
  await r.click('[data-mset="0"]'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => P.sets.length == 1 && P.sets[0].name == 'T1-1BRA-Unit Model' && P.sets[0].keys.length == 5), 'Make a set: a My set with the model\'s 5 drawings');
  await r.evaluate(() => { view = 'midp'; render(); });

  // ---------- health check ----------
  await page.click('.nb[data-k="settings"]'); await page.mouse.move(900, 650); await page.waitForTimeout(700);
  const st = page.frame({ url: /settings\.html/ }); await quiet(st);
  await st.click('#bHealth'); await page.waitForTimeout(150);
  const hc = await st.evaluate(() => LT.$('hcRes').innerText);
  ok(/Data files[\s\S]*can't be read: bad\.json/.test(hc), 'health: a data file that can\'t be read is named');
  ok(/1 of 1 issued file\(s\) have moved/.test(hc) && /1 task folder\(s\) not found: TL-001 Moved task/.test(hc), 'health: issued files that moved, task folders not found');
  ok(/Data folder[\s\S]*inside the program folder/.test(hc) && /Version 20/.test(hc), 'health: the data folder inside the program folder (with a fix), the version');
  ok(/problem/.test(await st.evaluate(() => LT.$('hcSum').innerText)), 'a summary at the top');
  await page.screenshot({ path: out + '/s3_health.png' });

  // ---------- safe update + go back ----------
  const app = await st.evaluate(() => LT.appDir());
  await page.evaluate(() => { const a = window.__add; a('C:\\New\\LewsToolbox.hta', 'NEW HTA'); a('C:\\New\\core\\lt-core.js', '  L.VERSION = "2099.1.1";'); a('C:\\New\\tabs\\home.html', 'NEW HOME'); });
  await st.evaluate(() => { LT.pickFolder = () => 'C:\\New'; window.__reload = 0; top.location.reload = () => { window.__reload++; }; window.confirm = q => { window.__cq = (window.__cq || []).concat(q); return !/Restart/.test(q); }; });
  ok(await st.evaluate(() => /You have version <b>20/.test(LT.$('upInfo').innerHTML)), 'Update: shows the version you have');
  await st.click('#bUpdate'); await page.waitForTimeout(200);
  const txt = p => page.evaluate(p => (window.__mockFs.files[p.toLowerCase()] || {}).text, p);
  ok(/Update from 20\S+ to 2099\.1\.1/.test((await st.evaluate(() => window.__cq[0]))), 'asks: "Update from <yours> to 2099.1.1?"');
  ok((await txt(app + '\\LewsToolbox.hta')) == 'NEW HTA' && (await txt(app + '\\tabs\\home.html')) == 'NEW HOME', 'the new program files are copied in');
  const bks = await page.evaluate(() => LT.backups().filter(b => /^Program /.test(b.name)).map(b => b.path));
  ok(bks.length == 1 && /NEW HTA/.test('' + (await txt(app + '\\LewsToolbox.hta'))) && (await txt(bks[0] + '\\LewsToolbox.hta')) != 'NEW HTA' && !!(await txt(bks[0] + '\\core\\lt-core.js')), 'the old program was backed up first (Backups\\Program …) with core and tabs');
  ok(await page.evaluate(() => !!LT.readJson(LT.dataPath('tracker.json'), null)), 'your data is untouched');
  await st.evaluate(() => { showUpdate(); }); ok(await st.evaluate(() => LT.$('upList').options.length == 1 && !LT.$('bRollback').disabled), 'Go back: the old version is in the list');
  await page.screenshot({ path: out + '/s3_update.png' });
  await st.click('#bRollback'); await page.waitForTimeout(200);
  ok((await txt(app + '\\LewsToolbox.hta')) != 'NEW HTA' && (await txt(app + '\\tabs\\home.html')) != 'NEW HOME', 'Go back: the old program is back');
  ok(await page.evaluate(() => LT.backups().filter(b => /^Program .*before going back/.test(b.name)).length == 1), '…and the new one was kept too (before going back)');
  await st.evaluate(() => { LT.pickFolder = () => 'C:\\Incoming'; window.__al = ''; }); await st.click('#bUpdate');
  ok(/doesn't look like Lew's Toolbox/.test(await st.evaluate(() => window.__al)), 'a folder that isn\'t the Toolbox: refused, nothing changed');
};
