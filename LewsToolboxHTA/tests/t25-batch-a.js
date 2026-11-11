// Batch A: task templates, timeline, close-out pack, online links for drawings, "What's new"
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add; fs.dirs['c:\\jobs'] = 'C:\\Jobs';
    const wsh = new ActiveXObject('WScript.Shell'), run = wsh.Run; window.__runs = [];
    wsh.Run = function (cmd, a, b) { window.__runs.push(cmd); var m = /-DestinationPath '([^']+)'/.exec(cmd); if (m) add(m[1].replace(/''/g, "'"), 'ZIP'); return run.call(this, cmd, a, b); };
    var orig = window.ActiveXObject; window.ActiveXObject = function (n) { return /WScript\.Shell/i.test(n) ? wsh : new orig(n); };
    document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.ActiveXObject = window.ActiveXObject; } catch (e) { } }); });
  // What's new
  ok(await page.evaluate(() => { var s = LT.settings(); return s.seenVersion == LT.VERSION; }), '"What\'s new" shown once, then remembered (Got it)');
  ok(await page.evaluate(() => LTMain.whatsNew() && /Task templates/.test(LT.$('wnBox').innerText)), 'Settings > What\'s new shows it again');
  await page.screenshot({ path: out + '/a_whatsnew.png' });
  await page.click('#wnOk');
  // a drawing with an online link in the Register
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Tower 1' }], current: 'p1' });
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower 1', setup: {}, rules: [], models: [], history: [], changes: {}, drawings: { 'T1-ZZ-DR-A-1001': { num: 'T1-ZZ-DR-A-1001', title: 'GA Level 1', rev: 'C01', ok: true, typo: '-', tower: 'T1' } } }); });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { loadAll(); });
  await r.dblclick('#res td.no >> text=T1-ZZ-DR-A-1001'); await r.fill('#edLink', 'acc.example.com/sheet/1001'); await r.click('#edOk');
  ok(await r.evaluate(() => P.drawings['T1-ZZ-DR-A-1001'].link == 'https://acc.example.com/sheet/1001' && /link/.test($('res').innerText)), 'Register: online link saved (https added), shows 🔗 link');
  ok(await page.evaluate(() => LT.drawingLink('T1-ZZ-DR-A-1001-C01') == 'https://acc.example.com/sheet/1001'), 'other tabs find the link (also with the revision on the number)');
  // Tasks: a template
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.evaluate(() => { window.ActiveXObject = top.ActiveXObject; LT.wsh = new ActiveXObject('WScript.Shell');
    var x = blank(); x.title = 'Coordination round'; x.project = 'Tower 1'; x.who = 'MEP Team'; x.created = LT.today(); x.due = LT.iso(addDays(todayD(), 5)); x.notes = 'Run clash detection and issue the report.';
    x.subs = [{ code: '', title: 'Export NWC', who: 'Ana', due: LT.today(), status: 'Done', refs: [] }, { code: '', title: 'Clash report', who: 'Ben', due: '', status: 'To do', refs: [{ kind: 'drawing', value: 'T1-ZZ-DR-A-1001' }] }];
    addTask(x); save(); render(); window.prompt = () => 'Clash round'; saveTemplate(x); });
  ok(await t.evaluate(() => data.templates.length == 1 && data.templates[0].name == 'Clash round' && data.templates[0].subs.length == 2 && data.templates[0].days == 5 && !data.templates[0].subs[0].status), 'template saved: checklist (no statuses/dates), 5 days to do');
  await t.click('#bTpl'); await page.waitForTimeout(100);
  ok(/Clash round/.test(await t.evaluate(() => $('menu').innerText)), 'From template ▾ lists it');
  await t.click('#menu .mi >> text=Clash round'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => $('dlg').style.display == 'block' && /from template: Clash round/.test($('dTitle').innerText) && $('eTitle').value == 'Coordination round' && work.subs.length == 2 && work.subs[0].status == 'To do' && work.due == LT.iso(addDays(todayD(), 5))), 'new task from it: title, checklist (all to do), due in 5 days');
  await t.fill('#eTitle', 'Coordination round 2'); await t.click('#eOk');
  ok(await t.evaluate(() => { var n = byCode('TL-002'); return n && n.subs.length == 2 && n.subs[0].code == 'TL-002.1' && /Created from template: Clash round/.test(JSON.stringify(n.events)); }), 'saved as TL-002 with TL-002.1...; timeline says "Created from template"');
  // timeline
  await t.evaluate(() => { var x = byCode('TL-001'); setStatus(x, 'Doing'); ltReceive('delegated', JSON.stringify({ log: 'TL-001', code: 'T007', to: 'Sam', tr: 'TR-004' })); });
  await t.evaluate(() => { var dg = { groups: [], tasks: [{ code: 'T007', title: 'Coordination round', who: 'MEP Team', history: [LT.DAYS && (new Date().getDate()) + ' ' + LT.MON[new Date().getMonth()] + ' 23:59  Reply from Sam: T007.1 Completed'], subs: [] }] }; LT.saveJson(LT.dataPath('delegate.json'), dg); });
  const tl = await t.evaluate(() => LT.taskTimeline(byCode('TL-001')).map(x => x.text).join(' | '));
  ok(/^Created \| .*Status: Doing.*Delegated to Sam as T007 \(TR-004\)/.test(tl) && /T007: Reply from Sam: T007\.1 Completed/.test(tl), 'timeline: created, status, delegated (TR), and Delegate\'s history: ' + tl);
  await t.evaluate(() => { top.__nextFolder = 'C:\\Jobs'; openTF(byCode('TL-001')); }); await t.click('#tfBrowse'); await t.click('#tfMakeB'); await page.waitForTimeout(100);
  await t.click('#tfTabs [data-tfs="Timeline"]');
  ok(/Task folder made/.test(await t.evaluate(() => $('tfTime').innerText)) && /Delegated to Sam/.test(await t.evaluate(() => $('tfTime').innerText)), 'task folder window: 🕘 Timeline tab (newest first)');
  await page.screenshot({ path: out + '/a_timeline.png' });
  // close-out
  const D = 'C:\\Jobs\\TL-001 Coordination round';
  await page.evaluate(D => window.__add(D + '\\Output\\Clash report.pdf', 'PDF'), D);
  await t.click('#tfClose2'); await page.waitForTimeout(100);
  const files = await F(), cmd = await page.evaluate(() => window.__runs.filter(c => /Compress-Archive/.test(c)).pop() || '');
  ok(files.includes(D + '\\TL-001 Coordination round - close-out ' + await t.evaluate(() => LT.today()) + '.zip'), 'close-out pack: <code title> - close-out <date>.zip in the task folder');
  ok(/Compress-Archive -LiteralPath '.*\\Output','.*Task Summary\.html','.*Notes\.txt'/.test(cmd), 'zips Output + summary (HTML, and the PDF when there is one) + notes');
  await t.click('#tfClose'); await page.waitForTimeout(100);
  const sum = await page.evaluate(D => window.__mockFs.files[(D + '\\Reference\\Backup and Ref\\Task Summary.html').toLowerCase()].text, D);
  ok(/<h2>Timeline<\/h2>/.test(sum) && /Close-out pack made/.test(sum), 'summary has the Timeline');
  ok(/href="https:\/\/acc\.example\.com\/sheet\/1001"/.test(sum), 'summary: the drawing reference links to its online link');
  ok(await t.evaluate(() => /T1-ZZ-DR-A-1001 - GA Level 1  https:\/\/acc\.example\.com\/sheet\/1001/.test(LT.refLines([{ kind: 'drawing', value: 'T1-ZZ-DR-A-1001' }])[0])), 'email / CSV text includes the drawing link');
};
