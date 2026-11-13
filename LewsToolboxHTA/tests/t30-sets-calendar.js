// Drawing Register > My sets (two columns, drag between), Tasks pulls a set; Tasks > Calendar (drag = move, Ctrl + drag = copy)
module.exports = async ({ page, out, drag }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Tower 1' }], current: 'p1' });
    var D = {}, put = (n, title, cat, typo) => { D[n] = { num: n, title: title, cat: cat, tower: 'T1', typo: typo, ok: true }; };
    put('T1-ZZ-DR-A-3001', 'Level 12 - Unit 1201', 'UNIT PLANS', 'X'); put('T1-ZZ-DR-A-3002', 'Level 12 - Unit 1202', 'UNIT PLANS', 'X'); put('T1-ZZ-DR-A-3003', 'Level 12 - Unit 1203', 'UNIT PLANS', 'X');
    put('T1-ZZ-DR-A-3004', 'Level 14 - Unit 1401', 'UNIT PLANS', 'X'); put('T1-ZZ-DR-A-1001', 'GA Level 1', 'GA', '-');
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower 1', setup: {}, rules: [], models: [], history: [], changes: {}, drawings: D, order: ['T1-ZZ-DR-A-1001', 'T1-ZZ-DR-A-3001', 'T1-ZZ-DR-A-3002', 'T1-ZZ-DR-A-3003', 'T1-ZZ-DR-A-3004'] }); });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { loadAll(); window.prompt = () => 'Serviced units'; }); await r.click('#views [data-v="sets"]'); await page.waitForTimeout(100);
  await r.click('#stNew'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => P.sets.length == 1 && P.sets[0].name == 'Serviced units' && setsView.left.length == 5), 'My sets: + New set "Serviced units"; the MIDP on the left (5)');
  // select 3001 + shift 3003, drag to the right
  await r.click('.dr[data-key="T1-ZZ-DR-A-3001"]'); await r.click('.dr[data-key="T1-ZZ-DR-A-3003"]', { modifiers: ['Shift'] });
  ok(await r.evaluate(() => Object.keys(selL).length == 3), 'click + Shift+click selects 3');
  await r.dragAndDrop('.dr[data-key="T1-ZZ-DR-A-3002"]', '.pl[data-pane="R"]'); await page.waitForTimeout(150);
  ok(await r.evaluate(() => P.sets[0].keys.join() == 'T1-ZZ-DR-A-3001,T1-ZZ-DR-A-3002,T1-ZZ-DR-A-3003' && setsView.left.length == 2), 'drag to the right: the 3 go into the set, out of the left list');
  await r.dblclick('.dr[data-key="T1-ZZ-DR-A-3004"]'); await page.waitForTimeout(100);
  ok(await r.evaluate(() => P.sets[0].keys.length == 4), 'double-click adds one');
  await r.dragAndDrop('.pl[data-pane="R"] .dr[data-key="T1-ZZ-DR-A-3004"]', '.pl[data-pane="L"]'); await page.waitForTimeout(150);
  ok(await r.evaluate(() => P.sets[0].keys.length == 3 && LT.readJson(LT.registerFile('p1')).sets[0].keys.length == 3), 'drag back to the left removes it; saved');
  await page.screenshot({ path: out + '/s_sets.png' });
  // Tasks: pull the set
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.click('#bDetail'); await t.click('#eMidp'); await page.waitForTimeout(100);
  ok(/Serviced units \(3\)/.test(await t.evaluate(() => $('mpSet').innerText)), 'From the MIDP: My set lists "Serviced units (3)"');
  await t.selectOption('#mpSet', { label: 'Serviced units (3)' }); await page.waitForTimeout(100); await t.click('#mpOk');
  ok(await t.evaluate(() => work.subs.length == 3 && $('eTitle').value == 'Serviced units drawings' && work.midp.set), 'the set becomes 3 checklist items (title from the set)');
  await t.fill('#eTitle', 'Print serviced units'); await t.evaluate(() => { $('eDue').value = ''; }); await t.click('#eOk');
  // the set changes later: Update from the MIDP follows it
  await page.evaluate(() => { var P = LT.readJson(LT.registerFile('p1')); P.sets[0].keys.push('T1-ZZ-DR-A-3004'); LT.saveJson(LT.registerFile('p1'), P); });
  await t.evaluate(() => { edit(byCode('TL-001')); window.confirm = () => true; mpUpdate(); saveEdit(); });
  ok(await t.evaluate(() => byCode('TL-001').subs.length == 4), 'set changed in the Register: Update from the MIDP brings the 4th drawing');
  // calendar
  await t.evaluate(() => { var x = byCode('TL-001'); x.due = LT.today(); save(); data.view = 'cal'; calMonth = null; render(); });
  ok(await t.evaluate(() => /Print serviced units/.test($('main').querySelector('td.tdy').innerText)), 'Calendar view: the task on its due day (today)');
  const tgt = await t.evaluate(() => { var d = new Date(); d.setDate(d.getDate() + (d.getDate() > 20 ? -2 : 2)); return LT.iso(d); });
  await t.dragAndDrop('td.tdy .ev', 'td[data-day="' + tgt + '"]'); await page.waitForTimeout(150);
  ok(await t.evaluate(tgt => byCode('TL-001').due == tgt && /moved to/.test($('toast').innerText) && /Due moved/.test(JSON.stringify(byCode('TL-001').events)), tgt), 'drag to another day: due date moved (with Undo, on the timeline)');
  await t.click('#toastUndo'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => byCode('TL-001').due == LT.today()), 'Undo puts it back');
  // Ctrl + drag = copy (playwright: dispatch a drop with ctrlKey)
  await t.evaluate(tgt => { var ev = $('main').querySelector('td.tdy .ev'), td = $('main').querySelector('td[data-day="' + tgt + '"]'), dt = new DataTransfer();
    ev.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); td.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ctrlKey: true })); td.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ctrlKey: true })); }, tgt);
  await page.waitForTimeout(150);
  ok(await t.evaluate(tgt => { var c = byCode('TL-002'); return c && c.title == 'Print serviced units' && c.due == tgt && byCode('TL-001').due == LT.today() && c.subs.length == 4 && c.subs.every(s => s.status == 'To do'); }, tgt), 'Ctrl + drag: a copy TL-002 on that day (the original stays; checklist copied, all to do)');
  await page.screenshot({ path: out + '/s_cal.png' });
  // a task with no date: in the strip, drag onto a day
  await t.evaluate(() => { var x = blank(); x.title = 'Undated thing'; addTask(x); save(); render(); });
  ok(await t.evaluate(() => /Undated thing/.test($('main').querySelector('.nodate').innerText)), 'tasks with no due date wait in a strip above the calendar');
  await drag(t, '.nodate .ev', 'td.tdy'); await page.waitForTimeout(150);
  ok(await t.evaluate(() => byCode('TL-003').due == LT.today()), 'drag it onto a day: it gets that date');
};
