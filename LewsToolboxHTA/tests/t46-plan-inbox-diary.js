// Week plan (Delegate), Smart Inbox (new tab), Project Diary (new tab)
module.exports = async ({ page, out, drag }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const quiet = fr => fr.evaluate(() => { window.confirm = m => { window.__cf = m; return true; }; window.alert = m => { window.__al = m; }; window.prompt = () => window.__pr; });
  const F = () => page.evaluate(() => Object.keys(window.__mockFs.files).map(k => window.__mockFs.files[k].path));
  // every date hangs off next week's Monday, so the test reads the same on any day
  const D = await page.evaluate(() => { var t = new Date(), m = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7) + 7), o = []; for (var i = 0; i < 5; i++) o.push(LT.iso(new Date(m.getFullYear(), m.getMonth(), m.getDate() + i))); return o; });
  await page.evaluate(D => { var s = LT.settings(); s.userName = 'Lew'; LT.saveSettings(s); const ago = n => LT.iso(new Date(Date.now() - n * 864e5));
    var sub = (n, who) => ({ code: 'T001.' + n, title: 'Sheet ' + n, who: who, due: D[1], status: 'Not started', notes: '' });
    LT.saveJson(LT.dataPath('delegate.json'), { seq: 2, groups: [], tasks: [
      { id: 'a', code: 'T001', title: 'Level 16', who: 'Anna', due: D[1], status: 'Not started', subs: [sub(1, 'Anna'), sub(2, 'Anna'), sub(3, 'Anna'), sub(4, 'Anna')], history: ['3 Nov 10:15 · me  Sent to Anna'] },
      { id: 'b', code: 'T002', title: 'Sheet set', who: 'Ben', due: D[2], status: 'Not started', subs: [], history: [] }] });
    LT.saveJson(LT.dataPath('tracker.json'), { seq: 1, view: 'open', tasks: [{ id: 'x1', code: 'TL-001', title: 'My check', status: 'To do', priority: 'Normal', due: D[3], events: [{ at: LT.today() + ' 09:00', text: 'Created' }] }] });
    LT.saveJson(LT.dataPath('transmittals.json'), { next: 2, prefix: 'TR-', log: [{ no: 'TR-001', date: ago(10), to: 'Client', purpose: 'For approval', items: [{ number: 'T1-ZZ-DR-A-5000', rev: 'C02', title: 'Plan' }], replies: [{ date: ago(3), code: 'B', note: 'see comments' }] }] });
    ['C:\\Drop\\T1-ZZ-DR-A-5000-P02.pdf', 'C:\\Drop\\T1-ZZ-DR-A-5001-P01.pdf', 'C:\\Drop\\model.rvt', 'C:\\Drop\\notes.txt', 'C:\\Proj\\Sheets\\T1-ZZ-DR-A-5000-P01.pdf', 'C:\\Inc\\old.pdf'].forEach(p => LT.writeText(p, 'x'));
  }, D);

  // ---------- Week plan ----------
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(700);
  const dg = page.frame({ url: /delegate\.html/ }); await quiet(dg);
  ok(/Week plan/.test(await dg.evaluate(() => $('views').innerText)), 'Delegate has a Week plan view');
  await dg.click('[data-v="planner"]'); await page.waitForTimeout(700);
  const pl = page.frame({ url: /planner\.html/ }); await quiet(pl);
  await pl.click('#bNext'); await page.waitForTimeout(150);
  const cls = (n, d) => pl.evaluate(([n, d]) => { var c = document.querySelector('td[data-c="' + n + '|' + d + '"]'); return c ? c.className + ' #' + c.querySelectorAll('.it').length : 'none'; }, [n, d]);
  ok(await pl.evaluate(() => ltPlan.people().join(',') == 'Lew,Anna,Ben'), 'one row per person: you, and everyone with work');
  ok(/hot #4/.test(await cls('Anna', D[1])), 'tasks sit on their due day; 4 tasks on one day = too much (red)');
  const hint = await pl.evaluate(() => $('hints').innerText);
  ok(/Anna has too much on Tue/.test(hint) && /free/.test(hint), 'a warning says who has too much, and who is free that day');
  ok(/TL-001/.test(await pl.evaluate(D => document.querySelector('td[data-c="Lew|' + D[3] + '"]').innerText, D)), 'your own tasks are on your row');
  await drag(pl, 'td[data-c="Anna|' + D[1] + '"] .it[data-k="T001.4"]', 'td[data-c="Anna|' + D[3] + '"]'); await page.waitForTimeout(200);
  ok(await pl.evaluate(D => ltPlan.store().plan['T001.4'] == D[3], D) && /#3/.test(await cls('Anna', D[1])) && /#1/.test(await cls('Anna', D[3])), 'drag a task to another day: it is planned there (the due date stays)');
  await drag(pl, 'td[data-c="Anna|' + D[1] + '"] .it[data-k="T001.3"]', 'td[data-c="Ben|' + D[2] + '"]'); await page.waitForTimeout(300);
  const disk = await page.evaluate(() => LT.readJson(LT.dataPath('delegate.json')));
  ok(/Give T001\.3 to Ben instead of Anna/.test(await pl.evaluate(() => window.__cf)) && disk.tasks[0].subs[2].who == 'Ben' && /Anna → Ben\s+\(week plan\)/.test(disk.tasks[0].history.join('|')), 'drag to another person: asks, then Delegate says Ben does it (noted in the history)');
  ok(/#2/.test(await cls('Ben', D[2])), 'the task is on the new person\'s row');
  ok((await page.evaluate(() => LT.readJson(LT.dataPath('delegate-feed.json'), []))).length > 0, 'Delegate passes the change on to the Tasks tab');
  await drag(pl, 'td[data-c="Lew|' + D[3] + '"] .it', 'td[data-c="Ben|' + D[4] + '"]'); await page.waitForTimeout(200);
  ok(/TL-001/.test(await pl.evaluate(D => document.querySelector('td[data-c="Lew|' + D[3] + '"]').innerText, D)), 'your own task can\'t be dragged to someone else (hand it out in Tasks)');
  await pl.click('[data-off="Ben|' + D[2] + '"]'); await page.waitForTimeout(150);
  ok(/off/.test(await cls('Ben', D[2])) && /Ben is on leave on Wed/.test(await pl.evaluate(() => $('hints').innerText)), 'mark a day as leave: work on that day is flagged');
  await pl.click('[data-off="Ben|' + D[2] + '"]'); await page.waitForTimeout(150);
  await pl.evaluate(() => { ltPlan.store().plan = {}; $('bNow').click(); $('bNext').click(); }); await page.waitForTimeout(150);
  await pl.click('#bSpread'); await page.waitForTimeout(200);
  const a0 = await cls('Anna', D[0]), a1 = await cls('Anna', D[1]);
  ok(/#[12]/.test(a0) && /#[12]/.test(a1) && !/hot/.test(a1) && await pl.evaluate(() => !!document.getElementById('toastUndo')), 'Spread fairly: the work is laid over the days before the due date, with Undo');
  await page.screenshot({ path: out + '/week_plan.png' });
  await pl.evaluate(() => { document.querySelector('.it[data-k="T002"]').ondblclick; window.__pr = '6'; var ev = document.createEvent('MouseEvents'); ev.initEvent('dblclick', true, true); document.querySelector('.it[data-k="T002"]').dispatchEvent(ev); }); await page.waitForTimeout(150);
  ok(/6 \/ 7\.5h/.test(await pl.evaluate(() => document.querySelector('.it[data-k="T002"]').parentNode.innerText)), 'double-click a task: type its hours (shared with Workload)');

  // ---------- Smart Inbox ----------
  await page.click('.nb[data-k="inbox"]'); await page.waitForTimeout(700);
  const ib = page.frame({ url: /inbox\.html/ }); await quiet(ib);
  await page.evaluate(() => { top.__nextFolder = 'C:\\Drop'; }); await ib.click('#bFolder'); await page.waitForTimeout(150);
  ok(await ib.evaluate(() => items.length == 4 && /choose the filing folder/.test($('res').innerText) && $('bGo').disabled), '4 loose files listed; nothing can be filed before the filing folder is chosen');
  await page.evaluate(() => { top.__nextFolder = 'C:\\Proj'; }); await ib.click('#bRoot'); await page.waitForTimeout(150);
  const it = n => ib.evaluate(n => { var x = items.filter(i => i.name.indexOf(n) >= 0)[0]; return { dest: x.dest, why: x.why, block: x.block, old: x.old.length }; }, n);
  const p2 = await it('5000-P02'), p1 = await it('5001'), rv = await it('model'), tx = await it('notes');
  ok(p2.dest == 'C:\\Proj\\Sheets' && /next to P01/.test(p2.why) && p2.old == 1, 'a new revision goes next to the one already filed - and the old revision is marked for Superseded');
  ok(p1.dest == 'C:\\Proj\\Drawings\\PDF' && /rule: pdf/.test(p1.why) && rv.dest == 'C:\\Proj\\Models', 'other files follow your rules (pdf > Drawings\\PDF, rvt > Models)');
  ok(/no rule fits/.test(tx.block) && /Copy 3 files/.test(await ib.evaluate(() => $('bGo').innerText)), 'a file no rule fits is shown in red and left out (click to choose)');
  await page.screenshot({ path: out + '/smart_inbox.png' });
  await ib.click('#bGo'); await page.waitForTimeout(250);
  let fs = await F();
  ok(fs.includes('C:\\Proj\\Sheets\\T1-ZZ-DR-A-5000-P02.pdf') && fs.includes('C:\\Proj\\Sheets\\Superseded\\T1-ZZ-DR-A-5000-P01.pdf') && !fs.includes('C:\\Proj\\Sheets\\T1-ZZ-DR-A-5000-P01.pdf') && fs.includes('C:\\Proj\\Drawings\\PDF\\T1-ZZ-DR-A-5001-P01.pdf') && fs.includes('C:\\Proj\\Models\\model.rvt'), 'File them: copied into place, the old revision moved to Superseded');
  ok(fs.includes('C:\\Drop\\model.rvt') && await ib.evaluate(() => items.length == 1), 'the originals stay (copy), filed files leave the list');
  await page.evaluate(() => { top.__nextFolder = 'C:\\Drop'; }); await ib.click('#bFolder'); await page.waitForTimeout(150);
  ok(/already there/.test(await ib.evaluate(() => $('res').innerText)), 'adding the same files again: "already there" - nothing is overwritten');
  await ib.click('#bUndo'); await page.waitForTimeout(250); fs = await F();
  ok(!fs.includes('C:\\Proj\\Sheets\\T1-ZZ-DR-A-5000-P02.pdf') && fs.includes('C:\\Proj\\Sheets\\T1-ZZ-DR-A-5000-P01.pdf') && !fs.includes('C:\\Proj\\Models\\model.rvt'), 'Undo the last run: the copies are removed, the old revision is back');
  await ib.evaluate(() => { $('bRules').click(); $('rules').value = 'contains: notes -> Admin\\{EXT}\r\n' + $('rules').value; $('rOk').click(); }); await page.waitForTimeout(150);
  ok((await it('notes')).dest == 'C:\\Proj\\Admin\\TXT', 'your own rule (contains: notes > Admin\\{EXT}) is used');
  await ib.evaluate(() => { store.mode = 'move'; save(); analyse(); render(); }); await ib.click('#bGo'); await page.waitForTimeout(250); fs = await F();
  ok(fs.includes('C:\\Proj\\Admin\\TXT\\notes.txt') && !fs.includes('C:\\Drop\\notes.txt'), 'Move (Options): the files leave the drop folder');
  // files arriving in a watched folder are noted in the diary
  await page.evaluate(() => { LT.watchAdd('C:\\Inc', 'Incoming'); LT.writeText('C:\\Inc\\T1-ZZ-DR-A-5002-P01.pdf', 'x'); LT.watchScan(); });
  await ib.evaluate(() => render());
  ok(/From Incoming \(1\)/.test(await ib.evaluate(() => $('bWatch').innerText)), 'From Incoming: takes the new files of your watched folders');

  // ---------- Project Diary ----------
  await page.click('.nb[data-k="diary"]'); await page.waitForTimeout(700);
  const dy = page.frame({ url: /diary\.html/ }); await quiet(dy);
  const txt = () => dy.evaluate(() => $('list').innerText);
  let t = await txt();
  ok(/TR-001 sent to Client/.test(t) && /TR-001 reply from Client: B/.test(t), 'transmittals and their replies are in the diary');
  ok(/TL-001 My check: Created/.test(t) && /T001 Level 16: Sent to Anna/.test(t), 'so are your tasks and what you handed out');
  ok(/Smart Inbox: 3 files filed/.test(t) && /Incoming: 1 new/.test(t) && /T001\.3 \(Level 16\): Anna → Ben/.test(t) && /Ben on leave/.test(t), 'and files (filed, arrived) and week-plan changes');
  await dy.evaluate(() => { $('q').value = 'rev c02'; $('q').onkeyup(); });
  ok(await dy.evaluate(() => shown.length == 1 && /TR-001 sent/.test(shown[0].text)), 'search "rev c02": the transmittal that carried it (who, when)');
  await dy.evaluate(() => { $('q').value = 'today inbox'; $('q').onkeyup(); });
  ok(await dy.evaluate(() => shown.length >= 2 && shown.every(e => e.at.substring(0, 10) == LT.today() && /inbox/i.test(e.text))), 'plain words: "today inbox" = today\'s Smart Inbox entries');
  await dy.evaluate(() => { $('q').value = ''; kind = 'tr'; render(); });
  ok(await dy.evaluate(() => shown.length == 2 && shown.every(e => e.kind == 'tr')), 'the Transmittals chip shows only transmittals');
  await dy.evaluate(() => { kind = ''; window.__pr = 'Client agreed the new grid on the phone'; $('bNote').click(); });
  ok(/Client agreed the new grid/.test(await txt()), '+ Note: your own line in the diary');
  await page.screenshot({ path: out + '/diary.png' });
  await dy.click('#bPdf'); await page.waitForTimeout(200);
  const page1 = await page.evaluate(() => { var k = Object.keys(window.__mockFs.files).filter(p => /exports\\diary\\diary_.*\.html$/i.test(p))[0]; return k ? window.__mockFs.files[k].text : ''; });
  ok(/Project diary/.test(page1) && /TR-001 sent to Client/.test(page1) && page1.indexOf('TR-001 sent') < page1.indexOf('Client agreed'), 'Export PDF: a page of what you see, oldest first (PDF made by Edge on your PC)');
  await dy.click('#bCsv'); await page.waitForTimeout(150);
  ok((await F()).some(p => /exports\\Diary\\Diary_.*\.csv$/.test(p)), 'Export CSV too');
};
