// Delegate: tick many items + Assign / Status / Due at once, one line per item, Tower · Typology · Model, hide item numbers;
// Tasks checklist: tick + Who / Due / Status at once, hide numbers; task pack: no repeated drawing text, info + one line, tick + Assign (team packs)
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Akala' }], current: 'p1' });
    var D = {}; [['10102', '1BR-A'], ['10112', '1BR-B'], ['10122', '1BR-C'], ['10132', '1BR-D']].forEach(x => { var k = '5013-KEO-T1-ZZ-PLN-INT-' + x[0]; D[k] = { num: k, title: 'UNIT TYPE ' + x[1] + ' (Res.1) - DETAILED PLANS (SMALL POWER PLAN - REFLECTED CEILING PLAN)', ok: true, tower: 'T1', typo: x[1] }; });
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', setup: {}, rules: [], history: [], changes: {}, drawings: D, sets: [], models: [{ tower: 'T1', typo: '1BR-A', model: 'M-1BRA' }, { tower: 'T1', typo: '1BR-B', model: 'M-1BRB' }] });
    var subs = Object.keys(D).map((k, i) => ({ code: 'T006.' + (i + 1), title: k + ' – ' + D[k].title, who: '', due: '', status: 'Not started', notes: '', refs: [{ kind: 'drawing', value: k }], dwg: k }));
    LT.saveJson(LT.dataPath('delegate.json'), { seq: 6, groups: [{ name: 'External team', lead: 'Sam', members: ['North Egypt', 'Ana'] }], tasks: [{ id: 'x', code: 'T006', title: 'PSPC FF&E + RCP', group: 'External team', who: 'External team', due: '', status: 'Not started', subs: subs, history: [] }] }); });
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(800);
  const d = page.frame({ url: /delegate\.html/ }); await d.evaluate(() => { load(); view = 'list'; render(); window.alert = m => { window.__al = m; }; });
  ok(await d.evaluate(() => document.querySelectorAll('#main input[data-cks]').length == 4 && !!document.querySelector('#main input[data-ckt="T006"]')), 'Delegate list: a tick box on every item (and one on the task = all its items)');
  const info = await d.evaluate(() => [...document.querySelectorAll('#main td.dwi')].map(c => c.innerText));
  ok(info[0] == 'T1 · 1BR-A · M-1BRA' && info[1] == 'T1 · 1BR-B · M-1BRB' && info[2] == 'T1 · 1BR-C', 'items show Tower · Typology · Model in their own column');
  ok(await d.evaluate(() => { var c = document.querySelector('#main td.it'); return getComputedStyle(c.querySelector('.one')).whiteSpace == 'nowrap' && c.offsetHeight < 46; }), 'one line per item (the full title on hover)');
  await d.click('#main input[data-cks="T006.1"]'); await d.click('#main input[data-cks="T006.3"]'); await page.waitForTimeout(100);
  ok(/2 selected/.test(await d.evaluate(() => $('selBar').innerText)) && await d.evaluate(() => $('selBar').style.display != 'none'), 'tick two: the bar shows "2 selected · Assign to …"');
  ok(/North Egypt/.test(await d.evaluate(() => $('sbWho').innerText)), '"Assign to" lists the people of your groups');
  await page.screenshot({ path: out + '/delegate_assign_many.png' });
  await d.evaluate(() => { $('sbWho').value = 'North Egypt'; }); await d.click('#sbAssign'); await page.waitForTimeout(150);
  const w = await d.evaluate(() => findTask('T006').subs.map(s => s.who));
  ok(w[0] == 'North Egypt' && w[2] == 'North Egypt' && w[1] == '' && /T006.1, T006.3 assigned to North Egypt \(2 at once\)/.test(findTaskHist = await d.evaluate(() => findTask('T006').history.join('|'))), 'Assign: both items go to that person (one line in the history)');
  ok(await d.evaluate(() => /^0 selected/.test($('sbN').innerText) && $('selBar').style.display != 'none'), 'the selection clears after (the bar stays where it is)');
  await d.click('#main input[data-ckt="T006"]'); await page.waitForTimeout(100);
  ok(/4 selected/.test(await d.evaluate(() => $('selBar').innerText)), 'tick the task: all its open items are ticked');
  await d.evaluate(() => { $('sbSt').value = 'In progress'; $('sbDue').value = '20/11/2026'; }); await d.click('#sbSet'); await page.waitForTimeout(100);
  ok(await d.evaluate(() => findTask('T006').subs.every(s => s.status == 'In progress' && s.due == '2026-11-20')), 'Status and Due for all ticked at once');
  await d.click('#main [data-nums="T006"]'); await page.waitForTimeout(100);
  ok(await d.evaluate(() => findTask('T006').hideNums && !/T006\.1/.test($('main').innerText)), 'hide the item numbers of a task (the # next to its ID, or right-click)');
  await d.click('#main [data-nums="T006"]'); await page.waitForTimeout(100);
  ok(await d.evaluate(() => !findTask('T006').hideNums && /T006\.1/.test($('main').innerText)), '... and show them again');

  // like My sets: a click only highlights - the list is not drawn again, nothing moves
  await d.evaluate(() => { SEL = {}; render(); }); await page.waitForTimeout(150);   // let the list settle (render puts the scroll back a moment later)
  await d.evaluate(() => { document.querySelector('#main table').__mark = 1; $('main').scrollTop = 30; window.__top = $('main').scrollTop; window.__barH = $('selBar').offsetHeight; });
  await d.evaluate(() => { var c = document.querySelectorAll('#main td.it')[1], e = document.createEvent('MouseEvents'); e.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null); c.dispatchEvent(e); }); await page.waitForTimeout(100);   // a click without the test tool scrolling first
  ok(await d.evaluate(() => document.querySelector('#main table').__mark === 1 && $('main').scrollTop == window.__top && $('selBar').offsetHeight == window.__barH), 'click a row: the list is not drawn again, it does not move');
  ok(await d.evaluate(() => document.querySelectorAll('#main tr.sel').length == 1 && /1 selected/.test($('sbN').innerText) && document.querySelector('#main tr.sel input').checked), '... the row is highlighted (its tick box follows), the bar counts 1');
  await d.click('#main td.it >> nth=3', { modifiers: ['Control'] }); await page.waitForTimeout(80);
  ok(await d.evaluate(() => document.querySelectorAll('#main tr.sel').length == 2 && document.querySelector('#main table').__mark === 1), 'Ctrl + click: one more, still no redraw');
  await d.click('#main td.it >> nth=0'); await page.waitForTimeout(80);
  ok(await d.evaluate(() => document.querySelectorAll('#main tr.sel').length == 1), 'a plain click again: only that row');
  // Ctrl / Shift + click on rows, and the Assigned to cell
  await d.evaluate(() => { SEL = {}; render(); });
  await d.click('#main td.it >> nth=0', { modifiers: ['Control'] }); await d.click('#main td.it >> nth=2', { modifiers: ['Shift'] }); await page.waitForTimeout(100);
  ok(/3 selected/.test(await d.evaluate(() => $('selBar').innerText)), 'Ctrl + click a row, Shift + click another: the rows between are selected');
  await d.click('#main td.asg[data-asg="T006.2"]'); await page.waitForTimeout(100);
  const mt = await d.evaluate(() => document.getElementById('menu').innerText);
  ok(/Assign 3 items to/.test(mt) && /North Egypt/.test(mt) && /External team/.test(mt), 'click an "Assigned to" cell: a menu of people for all 3 selected');
  await d.evaluate(() => { var m = document.querySelectorAll('#menu .mi'); for (var i = 0; i < m.length; i++) if (/^Ana/.test(m[i].innerText)) { m[i].click(); break; } }); await page.waitForTimeout(100);
  ok(await d.evaluate(() => findTask('T006').subs.slice(0, 3).every(x => x.who == 'Ana') && findTask('T006').subs[3].who != 'Ana'), 'pick Ana: the 3 items are hers');
  await d.click('#main td.asg[data-asg="T006.4"]'); await page.waitForTimeout(100);
  ok(/Assign 1 item to/.test(await d.evaluate(() => document.getElementById('menu').innerText)), 'nothing selected: the cell assigns just its own item');
  await d.evaluate(() => LT.hideMenu());
  // Send to people: which tasks
  await d.evaluate(() => { data.tasks.push({ id: 'y', code: 'T007', title: 'Other job', who: 'Ana', due: '', status: 'Not started', subs: [], history: [] }); save(); SEL = {}; render(); openSend(); }); await page.waitForTimeout(100);
  ok(await d.evaluate(() => $('taskList').querySelectorAll('input:checked').length == 2 && /Send 2 of 2/.test($('sTitle').innerText)), 'Send to people: "Which tasks" lists the open tasks (all ticked)');
  await d.evaluate(() => { $('taskList').querySelector('input[value="T006"]').click(); }); await page.waitForTimeout(100);
  ok(await d.evaluate(() => /Send 1 of 2/.test($('sTitle').innerText) && sendPool.length == 1 && sendPool[0].code == 'T007' && /Ana/.test($('whoList').innerText) && !/North Egypt|Sam/.test($('whoList').innerText)), 'untick one: only the other is sent, and only its people are listed');
  await d.evaluate(() => { $('send').style.display = 'none'; SEL = { 'T007': 1 }; openSend(); });
  ok(await d.evaluate(() => $('taskList').querySelectorAll('input:checked').length == 1 && $('taskList').querySelector('input:checked').value == 'T007'), 'tasks ticked in the list come in ticked (the rest unticked)');
  await page.screenshot({ path: out + '/send_which_tasks.png' });
  await d.evaluate(() => { $('send').style.display = 'none'; data.tasks.pop(); SEL = {}; save(); render(); });
  // ---------- task pack for the group lead ----------
  await d.evaluate(() => { LT.mkdirs('C:\\Out'); var t = findTask('T006'); t.subs.forEach(s => { s.who = ''; }); buildPack('C:\\Out\\Tasks_Sam.html', [t], 'Akala', 'Lew', 'Sam', 'Sam', 'X1', ['North Egypt', 'Ana'], {}); });
  fs.writeFileSync('/tmp/claude-0/pack-many.html', await page.evaluate(() => window.__mockFs.files['c:\\out\\tasks_sam.html'].text));
  const pg = await page.context().newPage(); const perr = []; pg.on('pageerror', e => perr.push(e.message));
  await pg.setViewportSize({ width: 1400, height: 800 }); await pg.goto('file:///tmp/claude-0/pack-many.html'); await pg.waitForTimeout(700);
  const it = await pg.evaluate(() => [...document.querySelectorAll('.it')].map(e => ({ h: e.offsetHeight, inf: (e.querySelector('.inf') || {}).innerText || '', refs: (e.querySelector('.refs') || {}).innerText || '' })));
  ok(perr.length == 0 && it.length == 4, 'the pack opens (4 items)');
  ok(it.every(x => !/5013-KEO/.test(x.refs)), 'the drawing is not repeated under the item any more');
  ok(it.every(x => x.inf == ''), 'by default nothing extra next to the title');
  ok(it.every(x => x.h < 50), 'one line per item');
  ok(await pg.evaluate(() => [...document.querySelectorAll('.it .tt')].every(t => t.scrollWidth <= t.clientWidth + 1 && getComputedStyle(t).textOverflow != 'ellipsis')), 'the full name shows (never cut)');
  ok(await pg.evaluate(() => new Set([...document.querySelectorAll('.it .tt')].map(t => getComputedStyle(t).fontSize)).size == 1), 'every item the same text size');
  await pg.setViewportSize({ width: 800, height: 800 }); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => [...document.querySelectorAll('.it .tt')].every(t => t.scrollWidth <= t.clientWidth + 1) && document.querySelector('.it').offsetHeight > 50), 'a narrow window: the long names wrap onto a second line (still full)');
  await pg.screenshot({ path: out + '/pack_narrow_wrap.png' }); await pg.setViewportSize({ width: 1400, height: 800 }); await pg.waitForTimeout(100);
  { await d.evaluate(() => { var st = LT.settings(); st.packModel = true; LT.saveSettings(st); buildPack('C:\\Out\\Tasks_Sam2.html', [findTask('T006')], 'Akala', 'Lew', 'Sam', 'Sam', 'X2', ['North Egypt', 'Ana'], {}); st.packModel = false; LT.saveSettings(st); });
    fs.writeFileSync('/tmp/claude-0/pack-many2.html', await page.evaluate(() => window.__mockFs.files['c:\\out\\tasks_sam2.html'].text));
    const p2 = await page.context().newPage(); await p2.goto('file:///tmp/claude-0/pack-many2.html'); await p2.waitForTimeout(600);
    const inf2 = await p2.evaluate(() => [...document.querySelectorAll('.it')].map(e => (e.querySelector('.inf') || {}).innerText || ''));
    ok(inf2[0] == 'M-1BRA' && inf2[1] == 'M-1BRB' && inf2[2] == '', '"show each drawing\'s model" ticked: only the model next to the title');
    await p2.screenshot({ path: out + '/pack_model_only.png' }); await p2.close(); }
  await d.evaluate(() => { openSend(); }); await page.waitForTimeout(150);
  ok(await d.evaluate(() => !!$('sMdl') && $('sMdl').checked === false && /model/.test($('sMdl').parentNode.innerText)), 'Send to people: the tick box "show each drawing\'s model" (off by default, remembered)');
  await d.evaluate(() => { $('send').style.display = 'none'; });
  await pg.click('[data-pick="T006.2"]'); await pg.click('[data-pick="T006.4"]'); await pg.waitForTimeout(100);
  ok(/2 ticked/.test(await pg.evaluate(() => document.querySelector('.picks').innerText)), 'the lead ticks several items: "2 ticked · Assign to …"');
  await pg.selectOption('#pickWho', 'Ana'); await pg.click('[data-pickgo]'); await pg.waitForTimeout(100);
  const sel = await pg.evaluate(() => [...document.querySelectorAll('select.who')].map(s => s.value));
  ok(sel[1] == 'Ana' && sel[3] == 'Ana' && sel[0] == '' && sel[2] == '', 'Assign: those items are Ana\'s (the reply sends it back as usual)');
  await pg.screenshot({ path: out + '/pack_one_line.png' });
  await pg.close();

  // ---------- Tasks: tick checklist items, set Who for all; hide numbers ----------
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(700);
  const t = page.frame({ url: /tracker\.html/ });
  await t.evaluate(() => { window.alert = m => { window.__al = m; }; var x = blank(); x.title = 'Check plans'; ['5013-KEO-T1-ZZ-PLN-INT-10102', '5013-KEO-T1-ZZ-PLN-INT-10112', 'Coordination meeting'].forEach((n, i) => x.subs.push({ code: '', title: n + (i < 2 ? ' – plan' : ''), who: '', due: '', status: 'To do', refs: [], dwg: i < 2 ? n : '' })); addTask(x); x.subs.forEach((s, i) => s.code = x.code + '.' + (i + 1)); save(); render(); edit(x); });
  await page.waitForTimeout(200);
  const si = await t.evaluate(() => [...document.querySelectorAll('#subs td.sinfo')].map(c => c.innerText));
  ok(si[0] == 'T1 · 1BR-A · M-1BRA' && si[2] == '', 'Tasks checklist: Tower · Typology · Model in its own column (one line per item)');
  await t.click('#subs tr[data-si="0"] .sC'); await t.click('#subs tr[data-si="2"] .sC', { modifiers: ['Shift'] }); await page.waitForTimeout(100);
  ok(/3 ticked/.test(await t.evaluate(() => $('sbN').innerText)), 'tick one, Shift+tick another: the range is ticked');
  await t.fill('#sbWho', 'Ana'); await t.click('#sbWhoB'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => work.subs.every(s => s.who == 'Ana')), 'Who for all ticked at once');
  await t.click('#eNums'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => work.hideNums && !document.querySelector('#subs td.tid')), 'Hide item numbers (button under the checklist)');
  await page.screenshot({ path: out + '/tasks_checklist_bulk.png' });
  await t.evaluate(() => saveEdit()); await page.waitForTimeout(100);
  ok(await t.evaluate(() => data.tasks[data.tasks.length - 1].hideNums === true && data.tasks[data.tasks.length - 1].subs[1].who == 'Ana'), 'saved with the task (and handed on to Delegate when you delegate it)');
};
