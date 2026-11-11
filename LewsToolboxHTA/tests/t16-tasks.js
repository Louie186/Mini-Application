// Tasks (task log): IDs, who, references on task + checklist items, To delegate / Waiting views, delegated status back
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { const fs = window.__mockFs; fs.files['c:\\refs\\markup.pdf'] = { path: 'C:\\Refs\\Markup.pdf', text: 'x', time: Date.now() }; fs.dirs['c:\\refs'] = 'C:\\Refs'; });
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.querySelector('.nb[data-k="tracker"]').innerText.indexOf('Tasks') >= 0), 'the tab is called Tasks');
  const f = page.frame({ url: /tracker\.html/ });
  // a quick personal to-do still works
  await f.fill('#quick', 'Call client tomorrow #Tower_1'); await f.press('#quick', 'Enter');
  ok(await f.evaluate(() => data.tasks[0].code == 'TL-001' && !data.tasks[0].who), 'quick to-do gets TL-001, for me');
  // a task to hand out, with references
  await f.click('#bDetail'); await page.waitForTimeout(150);
  await f.fill('#eTitle', 'Level 16 ceiling coordination'); await f.fill('#eAssign', 'MEP Team'); await f.fill('#eNotes', 'Check services against the RCP');
  const addRef = async (box, kind, val) => { await f.selectOption(box + ' .rfk', kind); await f.fill(box + ' .rfnew', val); await f.click(box + ' .rfa'); };
  await addRef('#eRefs', 'link', 'https://acc.example.com/project/123');
  await addRef('#eRefs', 'file', 'C:\\Refs\\Markup.pdf');
  await addRef('#eRefs', 'note', 'Use the markup on page 3');
  await f.selectOption('#eRefs .rf:nth-child(2) .rfs', 'link');
  ok(await f.evaluate(() => work.refs.length == 3 && work.refs[1].send == 'link' && work.refs[0].kind == 'link'), '3 references on the task (file set to Link only)');
  await f.click('#eAddSub'); await f.click('#eAddSub');
  await f.evaluate(() => { var r = $('subs').getElementsByTagName('tr'); r[1].querySelector('.sT').value = 'Doors'; r[2].querySelector('.sT').value = 'Windows'; r[2].querySelector('.sW').value = 'Ben'; });
  await f.click('[data-sref="1"]'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => $('subRefs').style.display == 'block' && /Windows/.test($('subRefsT').innerText)), 'references box for checklist item 2 opens');
  await addRef('#subRefsE', 'drawing', '5013-KEO-T1-ZZ-PLN-INT-10100, 5013-KEO-T1-ZZ-PLN-INT-10101');
  ok(await f.evaluate(() => work.subs[1].refs.length == 2 && work.subs[1].refs[0].kind == 'drawing' && work.subs[1].title == 'Windows'), 'two drawings added to item 2 (typed title kept)');
  await page.screenshot({ path: out + '/o_task_edit.png' });
  await f.click('#eOk'); await page.waitForTimeout(150);
  const t = await f.evaluate(() => { var t = byCode('TL-002'); return t && [t.who, t.subs.map(s => s.code + ':' + s.title + ':' + (s.who || '-') + ':' + s.refs.length).join(' '), t.refs.length].join(' | '); });
  ok(t == 'MEP Team | TL-002.1:Doors:-:0 TL-002.2:Windows:Ben:2 | 3', 'saved: TL-002 for MEP Team, items TL-002.1/.2 with their refs: ' + t);
  await f.click('[data-v="todel"]'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => shown.length == 1 && /To delegate \(MEP Team\)/.test($('main').innerText)), 'To delegate view: 1 task, status "To delegate (MEP Team)"');
  ok(await f.evaluate(() => /Markup\.pdf/.test($('main').innerText) && /0\/2/.test($('main').innerText)), 'list shows the reference chips and checklist 0/2');
  await page.screenshot({ path: out + '/o_tasks_todel.png' });
  // Delegate this task -> the Delegate tab gets it; the answer marks it delegated
  await f.evaluate(() => { window.__sent = null; var m = LT.main(); m.__send = m.send; m.send = function (k, w, v) { window.__sent = [k, w, v]; }; delegate(byCode('TL-002')); m.send = m.__send; });
  ok(await f.evaluate(() => window.__sent && window.__sent[0] == 'delegate' && window.__sent[1] == 'from-log' && JSON.parse(window.__sent[2]).code == 'TL-002'), 'Delegate this task hands TL-002 to the Delegate tab');
  await f.evaluate(() => ltReceive('delegated', JSON.stringify({ log: 'TL-002', code: 'T004', to: 'Sam', tr: 'TR-005' })));
  await f.click('[data-v="waiting"]'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => /Delegated to Sam/.test($('main').innerText) && /TR-005/.test($('main').innerText) && byCode('TL-002').status == 'Waiting'), 'back from Delegate: "Delegated to Sam · TR-005", in Waiting on others');
  // progress from the Delegate feed, then completed
  await page.evaluate(() => { const fs = window.__mockFs, p = Object.values(fs.files).find(x => /tracker\.json$/i.test(x.path)).path.replace(/tracker\.json$/i, 'delegate-feed.json'); fs.files[p.toLowerCase()] = { path: p, text: JSON.stringify([{ id: 'x', log: 'TL-002', title: 'T004 Level 16', who: 'Sam (MEP Team)', status: 'In progress', progress: '1/2 done' }]), time: Date.now() }; });
  await f.evaluate(() => { loadFeed(); render(); });
  ok(await f.evaluate(() => /1\/2 done/.test($('main').innerText) && !feed.length), 'progress from Delegate shows on the task (not as a second line)');
  await page.evaluate(() => { const fs = window.__mockFs, k = Object.keys(fs.files).find(x => /delegate-feed\.json$/.test(x)); fs.files[k].text = JSON.stringify([{ id: 'x', log: 'TL-002', who: 'Sam', status: 'Completed', progress: '2/2 done' }]); });
  await f.evaluate(() => { loadFeed(); render(); });
  ok(await f.evaluate(() => byCode('TL-002').status == 'Done'), 'completed in Delegate = done here');
  const csv = await f.evaluate(() => { var r = null; LT.writeCsv = function (p, rows) { r = rows; }; LT.open = function () { }; exportMenu(0, 0); document.querySelectorAll('#menu .mi')[2].click(); return r; });
  ok(csv && csv[0].join('|').indexOf('References') > 0 && csv.some(r => r[0] == 'TL-002' && /Link: https/.test(r[14])), 'All tasks CSV has ID, who, checklist and references');
};
