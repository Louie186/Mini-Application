// Round 4: task drop-downs show their value, Needs details tray, Delegate output (+ name check, send back, links from replies),
// Transmittal replies + task status, Register (lookup rev / models / set, sets keep the list), Incoming (refresh, deleted, by day, outputs found by themselves)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const quiet = fr => fr.evaluate(() => { window.confirm = () => true; window.alert = m => { window.__al = m; }; window.prompt = (q, d) => window.__answer != null ? window.__answer : d; });
  const iso = n => page.evaluate(n => LT.iso(new Date(Date.now() + n * 864e5)), n);
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add;
    LT.saveJson(LT.dataPath('tracker.json'), { view: 'board', seq: 3, tasks: [
      { id: 'a', code: 'TL-001', title: 'Sync model', project: 'Akala', due: LT.today(), status: 'Done', doneOn: LT.today(), log: [], subs: [] },
      { id: 'b', code: 'TL-002', title: 'Call Ben about doors', project: '', due: '', priority: 'Normal', status: 'To do', log: [], subs: [] },
      { id: 'c', code: 'TL-003', title: 'No date thing', project: 'Akala', due: '', status: 'Doing', log: [], subs: [] }] });
    LT.saveJson(LT.dataPath('naming.json'), { last: 0, rules: [{ name: 'Short rule', sep: '-', revOptional: true, parts: [{ name: 'Role', kind: 'letters', val: '1' }, { name: 'Number', kind: 'digits', val: '3' }, { name: 'Rev', kind: 'rev' }] }] });
    ['A-301-P01.pdf', 'A-302-P01.pdf', 'a_303.pdf'].forEach(n => add('C:\\Team\\Out\\' + n, 'X')); add('C:\\Team\\Other\\A-304-P01.dwg', 'X');
    LT.saveJson(LT.dataPath('delegate.json'), { seq: 2, project: 'Tower 1', issued: [], imports: [], groups: [], tasks: [
      { id: 't1', code: 'T001', title: 'Level 3 GA', who: 'Anna', due: '', status: 'Not started', history: [], subs: [{ id: 's1', code: 'T001.1', title: 'A-301', who: 'Anna', status: 'In progress' }, { id: 's2', code: 'T001.2', title: 'Sheet A-305 update', who: 'Ben', status: 'Not started' }] },
      { id: 't2', code: 'T002', title: 'Door schedule', who: 'Kim', due: '', status: 'Completed', history: [], subs: [] }] });
    LT.saveJson(LT.dataPath('transmittals.json'), { next: 3, prefix: 'TR-', log: [{ no: 'TR-001', date: LT.today(), to: 'Client', purpose: 'For comment', items: [{ number: 'A-301', rev: 'P01' }] }, { no: 'TR-002', date: LT.today(), to: 'Anna', purpose: 'For action', items: [{ number: 'T001 pack' }], tasks: ['T001', 'T002'] }] });
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Tower 1' }], current: 'p1' });
    var D = {}; for (var i = 0; i < 6; i++) { var k = 'T1-ZZ-DR-A-' + (4000 + i); D[k] = { num: k, title: 'Plan ' + i, ok: true, rev: i < 3 ? 'P02' : '', tower: 'T1', typo: i < 4 ? '1BRA' : '2BRB', model: i < 4 ? 'T1-1BRA-Unit Model' : 'T1-2BRB-Unit Model' }; }
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower 1', setup: {}, rules: [], models: [{ tower: 'T1', typo: '1BRA', model: 'T1-1BRA-Unit Model', link: 'https://acc.autodesk.com/1bra' }, { tower: 'T1', typo: '2BRB', model: 'T1-2BRB-Unit Model', link: '' }], history: [], changes: {}, drawings: D, sets: [{ id: 'S1', name: 'Mine', keys: ['T1-ZZ-DR-A-4001'] }] });
  });

  // ---------- Tasks ----------
  await page.click('.nb[data-k="tracker"]'); await page.mouse.move(900, 650); await page.waitForTimeout(700);
  const t = page.frame({ url: /tracker\.html/ }); await quiet(t);
  await t.evaluate(() => edit(byCode('TL-001')));
  ok(await t.evaluate(() => $('eStat').selectedIndex == 3 && $('eStat').value == 'Done' && $('ePrio').value == 'Normal'), 'a Done task (dragged to Done) opens with Status = Done and Priority = Normal (never empty)');
  await t.evaluate(() => $('dlg').style.display = 'none');
  await t.evaluate(() => { var x = byCode('TL-002'); setStatus(x, 'Doing'); });
  ok(await t.evaluate(() => { var x = byCode('TL-002'); return x.status == 'Doing' && x.title == 'Call Ben about doors' && x.priority == 'Normal' && x.project == '' && x.due == ''; }), 'moving between columns changes only the status');
  ok(await t.evaluate(() => $('nd').style.display == 'block' && /Needs details\s*2/.test($('ndH').innerText) && $('ndL').querySelectorAll('.ndi').length == 2), 'a floating "Needs details" tray: the 2 open tasks without a date or project');
  await page.screenshot({ path: out + '/r4_tray.png' });
  await t.evaluate(() => { var r = document.querySelector('[data-nd="b"]'); r.querySelector('[data-ndd="b"]').value = '20/11'; r.querySelector('[data-ndp="b"]').value = 'Tower 1'; });
  await t.click('[data-nds="b"]'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => { var x = byCode('TL-002'); return /-11-20$/.test(x.due) && x.project == 'Tower 1' && $('ndL').querySelectorAll('.ndi').length == 1; }), 'fill in the date + project in the tray: saved, it leaves the tray');
  await t.evaluate(() => { data.view = 'cal'; save(); render(); });
  const today = await iso(0);
  await t.evaluate(() => { dragTask = byId('c'); dragI = null; });
  await t.evaluate(d => { var td = document.querySelector('td[data-day="' + d + '"]'); var ev = document.createEvent('Event'); ev.initEvent('drop', true, true); ev.dataTransfer = null; td.dispatchEvent(ev); }, today);
  ok(await t.evaluate(d => byCode('TL-003').due == d && $('nd').style.display == 'none', today), 'drag a tray task onto a calendar day: it gets that date (tray gone when nothing is missing)');
  await t.evaluate(() => { data.view = 'today'; save(); render(); });

  // ---------- Delegate: output ----------
  await page.click('.nb[data-k="delegate"]'); await page.mouse.move(900, 650); await page.waitForTimeout(700);
  const d = page.frame({ url: /delegate\.html/ }); await quiet(d);
  await d.evaluate(() => { var t1 = findTask('T001'); openOut(t1, t1.subs[0]); addOut(['https://acc.autodesk.com/docs/out1', 'C:\\Team\\Out\\A-301-P01.pdf', 'C:\\Team\\Out\\A-302-P01.pdf', 'C:\\Team\\Out\\a_303.pdf', 'C:\\Team\\Other\\A-304-P01.dwg'], 'dropped'); });
  const ol = await d.evaluate(() => $('oList').innerText);
  ok(/Links[\s\S]*acc\.autodesk\.com/.test(ol) && (ol.match(/C:\\Team\\Out/g) || []).length == 1 && /3 items/.test(ol) && /C:\\Team\\Other[\s\S]*1 item/.test(ol), 'Output: the link, then the files grouped per folder (each folder once, its files under it)');
  ok(await d.evaluate(() => /1 name\(s\) don't follow Short rule/.test($('oMsg').innerText) && document.querySelectorAll('#oList .bad').length >= 1), 'C: the output names are checked against your naming rule (a_303 flagged)');
  await page.screenshot({ path: out + '/r4_output.png' });
  await d.evaluate(() => { $('odlg').style.display = 'none'; view = 'list'; render(); });
  ok(await d.evaluate(() => /🔗 5/.test($('main').innerText)), 'the item shows a 🔗 5 chip (click = open the output)');
  await d.evaluate(() => { window.__answer = 'Dimension the stairs'; var t1 = findTask('T001'); t1.subs[0].status = 'Completed'; sendBack(t1, t1.subs[0]); });
  ok(await d.evaluate(() => { var s = findTask('T001').subs[0]; return s.status == 'In progress' && s.backs.length == 1 && /Dimension the stairs/.test(s.notes) && /sent back/.test($('main').innerText); }), 'D: Send back for changes - back to In progress, your comment in the notes, "↩ sent back" shown');
  await d.evaluate(() => { var t1 = findTask('T001'); replyOut(t1, t1.subs[1], 'Done, see https://acc.autodesk.com/docs/x2 and C:\\Team\\Other', 'Ben'); });
  ok(await d.evaluate(() => { var o = findTask('T001').subs[1].outputs; return o.length == 2 && o[0].kind == 'link' && o[1].kind == 'folder'; }), 'a reply note with a link / folder path: it goes into the Output by itself');

  // ---------- Transmittal: replies ----------
  await page.click('.nb[data-k="transmittal"]'); await page.mouse.move(900, 650); await page.waitForTimeout(700);
  const tr = page.frame({ url: /transmittal\.html/ }); await quiet(tr);
  await tr.evaluate(() => setTv('hist'));
  ok(await tr.evaluate(() => /Sent/.test($('hRes').innerText) && document.querySelectorAll('[data-rp]').length == 2), 'History: a Reply column (Sent) and ↩ on each transmittal');
  await tr.click('[data-rp="TR-001"]'); await tr.selectOption('#rpCode', 'C'); await tr.fill('#rpNote', 'Comments on A-301'); await tr.fill('#rpLink', 'https://acc.autodesk.com/review/9'); await tr.click('#rpOk'); await page.waitForTimeout(100);
  const h1 = await tr.evaluate(() => $('hRes').innerText);
  ok(/Replied · C/.test(h1) && /C Revise and resubmit Comments on A-301/.test(h1), 'log a reply: "Replied · C", the reply listed with its link');
  await tr.click('tr.hr[data-tr="TR-002"]'); await page.waitForTimeout(100);
  ok(/From Delegate:[\s\S]*T001 · Level 3 GA · In progress \(0\/2 items\)[\s\S]*T002 · Door schedule · Completed/.test(await tr.evaluate(() => $('hRes').innerText)), 'a transmittal from Delegate shows its tasks\' status (read-only)');
  await page.screenshot({ path: out + '/r4_replies.png' });

  // ---------- Register ----------
  await page.click('.nb[data-k="register"]'); await page.mouse.move(900, 650); await page.waitForTimeout(700);
  const r = page.frame({ url: /register\.html/ }); await quiet(r);
  await r.evaluate(() => { view = 'look'; render(); $('lkText').value = 'T1-ZZ-DR-A-4000\tP02\tPlan 0\nT1-ZZ-DR-A-4001-P01\tPlan 1\nT1-ZZ-DR-A-4004\tP01\nT1-2BRB-Unit Model.0003\nT1-1BRA-Unit Model'; $('lkGo').click(); });
  const lk = await r.evaluate(() => P.lookup.rows.map(x => (x.isModel ? 'M:' + x.model + ':' + x.typo : x.num + ':' + (x.rev || '') + '/' + (x.midRev || ''))).join(' | '));
  ok(lk == 'T1-ZZ-DR-A-4000:P02/P02 | T1-ZZ-DR-A-4001-P01:P01/P02 | T1-ZZ-DR-A-4004:P01/ | M:T1-2BRB-Unit Model:2BRB | M:T1-1BRA-Unit Model:1BRA', 'lookup reads the revision (a column or on the number) and models (with or without a version) (' + lk + ')');
  const tb = await r.evaluate(() => $('lkT').innerText);
  ok(/= P02/.test(tb) && /P01 ≠ P02/.test(tb) && /1 revision\(s\) differ from the MIDP/.test(await r.evaluate(() => $('sum').innerText)), 'Rev · MIDP column: = P02 / P01 ≠ P02, and "1 revision(s) differ" on top');
  ok(await r.evaluate(() => { var l = document.querySelectorAll('#lkT .mlk'); for (var i = 0; i < l.length; i++) if (l[i].getAttribute('data-ml') == 'https://acc.autodesk.com/1bra') return true; return false; }), 'a pasted model gets its tower, typology and link');
  await page.screenshot({ path: out + '/r4_lookup.png' });
  await r.evaluate(() => { window.__answer = 'From my list'; }); await r.click('#lkSet'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => { var s = P.sets[P.sets.length - 1]; return s.name == 'From my list' && s.keys.length == 6; }), 'Make a set from the lookup: the drawings found + every drawing of the pasted models (6)');
  await r.evaluate(() => { view = 'sets'; curSet = 'S1'; render(); });
  ok(await r.evaluate(() => document.querySelectorAll('.pl[data-pane="L"] .dr').length == 6 && document.querySelectorAll('.pl[data-pane="L"] .dr.ins').length == 1), 'My sets: the left list keeps every drawing (the ones in the set dimmed ✓) - nothing jumps');
  await r.evaluate(() => { var pl = document.querySelector('.pl[data-pane="L"]'); pl.style.height = '60px'; pl.scrollTop = 40; window.__top = pl.scrollTop; setAdd(['T1-ZZ-DR-A-4003']); });
  ok(await r.evaluate(() => { var pl = document.querySelector('.pl[data-pane="L"]'); return setOf('S1').keys.length == 2 && document.querySelectorAll('.pl[data-pane="L"] .dr').length == 6; }), 'adding keeps the list as it was (same drawings, same place)');
  await r.evaluate(() => { view = 'midp'; render(); });

  // ---------- Incoming: refresh, deleted, by day, outputs found by themselves ----------
  await page.evaluate(() => { window.__add('C:\\Inbox\\old.pdf', 'X'); LT.watchAdd('C:\\Inbox'); window.__add('C:\\Inbox\\T1-A-305-P01.pdf', 'X'); delete window.__mockFs.files['c:\\inbox\\old.pdf']; });
  await page.click('.nb[data-k="home"]'); await page.mouse.move(900, 650); await page.waitForTimeout(900);
  const h = page.frame({ url: /home\.html/ }); await quiet(h);
  await h.click('#inRef'); await page.waitForTimeout(300);
  const inc = await h.evaluate(() => $('incoming').innerText);
  ok(/1 new · 1 deleted \/ moved · checked just now/.test(inc) && /TODAY/i.test(inc) && /old\.pdf[\s\S]*deleted \/ moved/.test(inc), '↻ Refresh checks now: "1 new · 1 deleted / moved · checked just now", grouped by day');
  ok(await page.evaluate(() => { var s = LT.readJson(LT.dataPath('delegate.json'), null).tasks[0].subs[1]; return s.outputs.some(o => o.auto && /T1-A-305-P01\.pdf$/.test(o.path)); }) && /output of T001\.2/.test(inc), 'A: a new file with a delegated drawing number (A-305) goes into that item\'s Output by itself, and Home says so');
  await page.screenshot({ path: out + '/r4_incoming.png' });
};
