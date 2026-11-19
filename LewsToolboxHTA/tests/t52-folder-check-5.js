// Folder Check: 5 views (Contents, Checklist, Revisions, Find, Review) + Tools; Contents with a My set (follows it); one Tower · Typology · Model column;
// Revisions: a folder / a list against the MIDP or a LOD list; Find: from My set
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Akala' }], current: 'p1' });
    var D = {}; [['T1-ZZ-DR-A-10101', 'P02', '1BR'], ['T1-ZZ-DR-A-10102', 'P03', '2BR'], ['T1-ZZ-DR-A-10103', 'P01', '1BR'], ['T1-ZZ-DR-A-10104', 'P01', '2BR']].forEach(x => { D[x[0]] = { num: x[0], rev: x[1], title: 'Plan ' + x[0], ok: true, tower: 'T1', typo: x[2] }; });
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', setup: {}, rules: [], history: [], changes: {}, drawings: D, models: [{ tower: 'T1', typo: '1BR', model: 'M-1BR' }, { tower: 'T1', typo: '2BR', model: 'M-2BR' }],
      sets: [{ id: 's1', name: 'Units', keys: ['T1-ZZ-DR-A-10101', 'T1-ZZ-DR-A-10102', 'T1-ZZ-DR-A-10104'], made: LT.today() }] });
    ['T1-ZZ-DR-A-10101-P02.pdf', 'T1-ZZ-DR-A-10101-P02.dwg', 'T1-ZZ-DR-A-10102-P02.pdf', 'Sub\\T1-ZZ-DR-A-10103-P03.pdf', 'notes.txt'].forEach(n => LT.writeText('C:\\Out\\' + n, 'x'));
    LT.writeText('C:\\Lists\\LOD.csv', 'Drawing,Rev\r\nT1-ZZ-DR-A-10101,P03\r\nT1-ZZ-DR-A-10102,P02\r\nT1-ZZ-DR-A-10103,P03\r\n'); });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(600); await page.mouse.move(900, 600);
  const k = page.frame({ url: /check\.html/ });
  ok(await k.evaluate(() => /Contents\s*Groups\s*Checklist\s*Revisions\s*Find\s*Review/.test($('fcv').innerText) && cfg.view == 'contents'), 'Folder Check: Contents · Groups · Checklist · Revisions · Find · Review (opens on Contents)');
  await k.click('#fcTools'); await page.waitForTimeout(100);
  ok(/Submission check[\s\S]*Names[\s\S]*Compare[\s\S]*Superseded/.test(await k.evaluate(() => document.getElementById('menu').innerText)), 'Tools ▾: Submission check, Names, Compare, Superseded');
  await k.evaluate(() => { var m = document.querySelectorAll('#menu .mi'); for (var i = 0; i < m.length; i++) if (/^Names/.test(m[i].innerText)) m[i].click(); }); await page.waitForTimeout(400);
  ok(await k.evaluate(() => cfg.view == 'naming' && /Names/.test($('fcTools').innerText) && / on/.test($('fcTools').className)), 'a tool opens; the Tools button shows its name');
  // ---------- Contents with a My set ----------
  await k.evaluate(() => setView('contents')); await page.waitForTimeout(600);
  const c = page.frame({ url: /contents\.html/ });
  await c.evaluate(() => { cfg.folder = 'C:\\Out'; cfg.subs = true; save(); });
  await c.evaluate(() => { askRef(); }); await c.click('#aSet'); await page.waitForTimeout(100);
  await c.evaluate(() => { var m = document.querySelectorAll('#menu .mi'); for (var i = 0; i < m.length; i++) if (/Units/.test(m[i].innerText)) m[i].click(); }); await page.waitForTimeout(300);
  ok(/My set: Units/.test(await c.evaluate(() => $('refLbl').innerText)), 'Contents: the checklist can be one of My sets');
  await c.evaluate(() => { $('show').value = 'left'; $('show').onchange(); }); await page.waitForTimeout(150);
  let ct = await c.evaluate(() => $('res').innerText);
  ok(/T1-ZZ-DR-A-10104/.test(ct) && !/T1-ZZ-DR-A-10101/.test(ct) && /T1 · 2BR · 🔗? ?M-2BR|T1 · 2BR · M-2BR/.test(ct) && /Tower · Typology · Model/.test(ct), 'remaining: T1-ZZ-DR-A-10104 (not in the folder), with Tower · Typology · Model in one column');
  await page.evaluate(() => { var P = LT.readJson(LT.registerFile('p1')); P.sets[0].keys.push('T1-ZZ-DR-A-10103'); LT.saveJson(LT.registerFile('p1'), P); });
  await c.evaluate(() => { readRef(); run(); }); await page.waitForTimeout(200);
  ok(await c.evaluate(() => items.length == 4), 'the set changes in the Drawing Register: Contents follows it (4 drawings now)');
  ok(await page.evaluate(() => LT.listUses('s1').some(u => u.title == 'Contents')), 'My sets "Used in" lists it');
  await page.screenshot({ path: out + '/fc_contents_set.png' });
  // ---------- Revisions ----------
  await k.evaluate(() => setView('revisions')); await page.waitForTimeout(600);
  const r = page.frame({ url: /revisions\.html/ });
  await r.evaluate(() => { cfg.src = 'folder'; cfg.folder = 'C:\\Out'; cfg.subs = true; cfg.ref = 'midp'; cfg.only = ''; save(); paths(); }); await r.click('#bRun'); await page.waitForTimeout(200);
  const st = () => r.evaluate(() => ltRev.rows().map(x => x.base + ':' + x.st).join(','));
  ok(await st() == 'T1-ZZ-DR-A-10101:same,T1-ZZ-DR-A-10102:older,T1-ZZ-DR-A-10103:newer', 'folder vs MIDP: T1-ZZ-DR-A-10101 same (P02), T1-ZZ-DR-A-10102 older (P02 < P03), T1-ZZ-DR-A-10103 newer (P03 > P01)');
  let rt = await r.evaluate(() => $('res').innerText);
  ok(!/T1-ZZ-DR-A-10101/.test(rt) && /T1-ZZ-DR-A-10102/.test(rt) && /T1 · 2BR · .*M-2BR/.test(rt), '"Only what differs" by default, with Tower · Typology · Model');
  await page.screenshot({ path: out + '/fc_revisions.png' });
  await r.evaluate(() => { cfg.only = 's1'; save(); run(); });
  ok(await st() == 'T1-ZZ-DR-A-10101:same,T1-ZZ-DR-A-10102:older,T1-ZZ-DR-A-10103:newer,T1-ZZ-DR-A-10104:missing', 'only a set: its drawings (T1-ZZ-DR-A-10104 is in the set, not in the folder)');
  await r.evaluate(() => { cfg.only = ''; cfg.ref = 'lod'; cfg.lod = 'C:\\Lists\\LOD.csv'; save(); paths(); run(); });
  ok(await st() == 'T1-ZZ-DR-A-10101:older,T1-ZZ-DR-A-10102:same,T1-ZZ-DR-A-10103:same', 'against a LOD list (Excel / CSV) instead of the MIDP');
  await r.evaluate(() => { cfg.src = 'list'; cfg.list = 'paste'; cfg.pasted = 'T1-ZZ-DR-A-10101  P02\r\nT1-ZZ-DR-A-10102-P03\r\nT9-ZZ-DR-A-99999 P01'; cfg.ref = 'midp'; save(); paths(); run(); });
  ok(await st() == 'T1-ZZ-DR-A-10101:same,T1-ZZ-DR-A-10102:same,T9-ZZ-DR-A-99999:noref', 'a pasted list (number + revision) against the MIDP; one not in the MIDP');
  await r.click('#bCsv'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => /Revision check_/.test(window.__lastCsv || '')), 'Export CSV');
  // ---------- Find from My set ----------
  await k.evaluate(() => setView('find')); await page.waitForTimeout(600);
  const f = page.frame({ url: /find\.html/ });
  await f.evaluate(() => { cfg.roots = ['C:\\Out']; cfg.subs = true; save && save(); }); await f.click('#bSet'); await page.waitForTimeout(100);
  await f.evaluate(() => { var m = document.querySelectorAll('#menu .mi'); for (var i = 0; i < m.length; i++) if (/Units/.test(m[i].innerText)) m[i].click(); }); await page.waitForTimeout(800);
  ok(await f.evaluate(() => ['10101', '10102', '10103', '10104'].every(n => $('q').value.indexOf('T1-ZZ-DR-A-' + n) >= 0)), 'Find: From My set fills the drawings to find');
};
