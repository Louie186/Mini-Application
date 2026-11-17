// Live lists: a task made from one of My sets follows the set (Tasks + Delegate): new drawings come in (NEW), removed ones are flagged; Show list changes; Accept; Used in; pack sorting
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Akala' }], current: 'p1' });
    var D = {}; [['A-101', 'T2', '2BR'], ['A-102', 'T1', '1BR'], ['A-103', 'T1', '3BR'], ['A-104', 'T1', '1BR']].forEach(x => { D[x[0]] = { num: x[0], title: 'Plan ' + x[0], ok: true, tower: x[1], typo: x[2] }; });
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', setup: {}, rules: [], history: [], changes: {}, drawings: D, models: [{ tower: 'T1', typo: '1BR', model: 'M-1BR' }, { tower: 'T2', typo: '2BR', model: 'M-2BR' }, { tower: 'T1', typo: '3BR', model: 'M-3BR' }],
      sets: [{ id: 's1', name: 'Units', keys: ['A-101', 'A-102'], made: LT.today() }] });
    LT.saveJson(LT.dataPath('delegate.json'), { seq: 0, groups: [], tasks: [] }); });
  await page.click('.nb[data-k="register"]'); await page.mouse.move(900, 690); await page.waitForTimeout(800);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { view = 'sets'; curSet = 's1'; render(); }); await r.click('#stTask'); await page.waitForTimeout(900);
  const tk = page.frame({ url: /tracker\.html/ });
  await tk.evaluate(() => { var o = document.querySelectorAll('.ov'); for (var i = 0; i < o.length; i++) o[i].style.display = 'none'; window.confirm = () => true; });
  const T = () => tk.evaluate(() => { var t = data.tasks[data.tasks.length - 1]; return { set: t.midp && t.midp.set, subs: t.subs.map(s => s.dwg + (s.listNew ? '+' : '') + (s.listGone ? '-' : '')) }; });
  let t1 = await T();
  ok(t1.set == 's1' && t1.subs.join() == 'A-101,A-102', 'My sets > Task checklist: the task follows the set (linked)');
  // hand it out: Delegate follows the set too
  await tk.evaluate(() => { var t = data.tasks[data.tasks.length - 1]; t.who = 'Ana'; save(); delegate(t); }); await page.waitForTimeout(1200);
  const dg = page.frame({ url: /delegate\.html/ }); await dg.evaluate(() => { var o = document.querySelectorAll('.ov'); for (var i = 0; i < o.length; i++) o[i].style.display = 'none'; window.confirm = () => true; });
  const DT = () => dg.evaluate(() => { var t = data.tasks[data.tasks.length - 1]; return { set: t.setId, subs: t.subs.map(s => s.dwg + (s.listNew ? '+' : '') + (s.listGone ? '-' : '')), st: statusOf(t) }; });
  ok((await DT()).set == 's1' && (await DT()).subs.join() == 'A-101,A-102', 'delegated: the Delegate task follows the same set');
  // the set changes in the Drawing Register: A-104 added, A-101 taken out
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(300);
  await r.evaluate(() => { view = 'sets'; curSet = 's1'; render(); setAdd(['A-104']); setRemove(['A-101']); }); await page.waitForTimeout(200);
  ok(/Used in: Tasks TL-\d+ Units · Delegate T001 Units/.test(await r.evaluate(() => document.querySelector('.pane[data-pane="R"] .ph').innerText)), 'My sets shows where the set is used');
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(400);
  t1 = await T();
  ok(t1.subs.slice().sort().join() == 'A-101-,A-102,A-104+', 'Tasks: the new drawing comes in (NEW), the removed one is flagged (not deleted)');
  await tk.evaluate(() => { edit(data.tasks[data.tasks.length - 1]); }); await page.waitForTimeout(200);
  const bar = await tk.evaluate(() => $('eLink').innerText);
  ok(/Follows My set Units/.test(bar) && /\+1 new/.test(bar) && /1 removed from the set/.test(bar), 'the task window says: follows My set Units · +1 new · 1 removed');
  ok(await tk.evaluate(() => !!document.querySelector('#subs .lnew') && !!document.querySelector('#subs tr.lgone .lgn')), 'NEW and "removed" marks on the items');
  await page.screenshot({ path: out + '/live_list_task.png' });
  await tk.click('#eShowLC'); await page.waitForTimeout(100);
  ok(await tk.evaluate(() => !document.querySelector('#subs .lnew') && !document.querySelector('#subs tr.lgone') && document.querySelectorAll('#subs tr[data-si]').length == 2), 'Show list changes off: no marks, the removed item is hidden');
  await tk.click('#eShowLC'); await tk.click('#eAcc'); await page.waitForTimeout(100);
  ok(await tk.evaluate(() => work.subs.map(s => s.dwg).join() == 'A-102,A-104' && !work.subs.some(s => s.listNew)), 'Accept the changes: the removed item goes, the NEW marks clear');
  await tk.evaluate(() => { $('dlg').style.display = 'none'; });
  // Delegate follows too
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(500);
  const d1 = await DT();
  ok(d1.subs.slice().sort().join() == 'A-101-,A-102,A-104+' && /List Units: \+1 new, 1 removed/.test(await dg.evaluate(() => data.tasks[data.tasks.length - 1].history.join('|'))), 'Delegate: the same - new item in, removed one flagged (in the history too)');
  ok(await dg.evaluate(() => { view = 'list'; render(); return !!document.querySelector('#main tr[data-gone] .lgn') && !!document.querySelector('#main .lnew') && /Units/.test(document.querySelector('#main .lset').innerText); }), 'Delegate list: NEW / removed marks, and the task shows the set it follows');
  await page.screenshot({ path: out + '/live_list_delegate.png' });
  await dg.evaluate(() => { var t = data.tasks[data.tasks.length - 1]; t.subs.forEach(s => { if (!s.listGone) s.status = 'Completed'; }); save(); });
  ok((await DT()).st == 'Completed', 'a removed item does not hold the task open');
  await dg.evaluate(() => { var t = data.tasks[data.tasks.length - 1]; t.subs.forEach(s => { s.status = 'Not started'; }); save(); $('showLC').click(); });
  ok(await dg.evaluate(() => !document.querySelector('#main tr[data-gone]') && !document.querySelector('#main .lnew')), 'Show list changes off (Delegate): no marks, removed hidden');
  await dg.evaluate(() => { $('showLC').click(); });
  // the pack: no removed item; sort by model / drawing / tower
  await dg.evaluate(() => { LT.mkdirs('C:\\Out'); var t = data.tasks[data.tasks.length - 1]; t.subs.push({ id: 'z', code: 'T001.9', title: 'A-103 - Plan A-103', who: '', due: '', status: 'Not started', notes: '', refs: [], dwg: 'A-103' }); buildPack('C:\\Out\\P.html', [t], 'Akala', 'Lew', 'Ana', 'Ana', 'X', [], {}); });
  fs.writeFileSync('/tmp/claude-0/pack-live.html', await page.evaluate(() => window.__mockFs.files['c:\\out\\p.html'].text));
  const pg = await page.context().newPage(); await pg.goto('file:///tmp/claude-0/pack-live.html'); await pg.waitForTimeout(600);
  const names = () => pg.evaluate(() => [...document.querySelectorAll('.it .tt')].map(e => e.innerText.split(' ')[0]).join(','));
  ok(!/A-101/.test(await names()) && /NEW/.test(await pg.evaluate(() => document.body.innerText)), 'task pack: the removed drawing is not sent; the new one has its NEW tag');
  ok(await names() == 'A-102,A-104,A-103', 'sorted as sent');
  await pg.selectOption('#srt', 'model'); await pg.waitForTimeout(100);
  ok(await names() == 'A-102,A-104,A-103', 'sort by model (M-1BR, M-1BR, M-3BR)');
  await pg.selectOption('#srt', 'dno'); await pg.waitForTimeout(100);
  ok(await names() == 'A-102,A-103,A-104', 'sort by drawing number');
  await pg.selectOption('#srt', 'tower'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => document.querySelectorAll('.it').length == 3), 'sort by tower: nothing hidden (all 3 still there)');
  await pg.screenshot({ path: out + '/pack_sort.png' }); await pg.close();
};
