// Delegate Board + Calendar (drag, Undo, history), Slate theme and the fold-away menu
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(700);
  const f = page.frame({ url: /delegate\.html/ });
  const iso = n => f.evaluate(n => { var d = new Date(); d.setDate(d.getDate() + n); return LT.iso(d); }, n);
  const d0 = await iso(0), d1 = await iso(1), d3 = await iso(3);
  await f.evaluate(([d0, d1]) => {
    data.tasks = [
      { id: 'a', code: 'T001', title: 'Level 16 walls', group: 'Model', project: '', who: 'Anna', due: d0, status: 'Not started', notes: '', subs: [{ code: 'T001.1', title: 'Doors', who: 'Anna', due: d1, status: 'Not started', notes: '' }, { code: 'T001.2', title: 'Windows', who: 'Ben', due: d1, status: 'Not started', notes: '' }], history: [] },
      { id: 'b', code: 'T002', title: 'Sheet set', group: '', project: '', who: 'Ben', due: d0, status: 'Not started', notes: '', subs: [], history: [] }];
    data.seq = 2; save(); render();
  }, [d0, d1]);
  // ---- Board
  await f.click('[data-v="board"]'); await page.waitForTimeout(200);
  ok(await f.evaluate(() => document.querySelectorAll('.col').length == 3 && document.querySelectorAll('.dc').length == 2), 'board: 3 columns, 2 cards');
  await f.dragAndDrop('.dc:has-text("Sheet set")', '.col[data-st="In progress"]'); await page.waitForTimeout(200);
  ok(await f.evaluate(() => findTask('T002').status == 'In progress' && /dragged on the board/.test(findTask('T002').history.join())), 'board: drag → In progress, written in history');
  await page.screenshot({ path: out + '/h_board.png' });
  await f.click('#toastUndo'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => findTask('T002').status == 'Not started'), 'board: Undo puts it back');
  await f.dragAndDrop('.dc:has-text("Level 16 walls")', '.col[data-st="Completed"]'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => statusOf(findTask('T001')) == 'Not started' && /comes from them/.test($('toast').innerText)), 'board: a task with items is not moved (message says why)');
  // ---- Calendar
  await f.click('[data-v="cal"]'); await page.waitForTimeout(200);
  ok(await f.evaluate(() => document.querySelectorAll('.ev.p').length == 2 && document.querySelectorAll('.ev:not(.p)').length == 1), 'calendar: 2 tasks due + 1 items chip');
  await f.evaluate(() => { calMonth = null; });
  await f.dragAndDrop('.ev.p:has-text("Sheet set")', `td[data-day="${d3}"]`).catch(async () => { await f.click('[data-mon="1"]'); await f.dragAndDrop('.ev.p:has-text("Sheet set")', `td[data-day="${d3}"]`); });
  await page.waitForTimeout(150);
  ok(await f.evaluate(d3 => findTask('T002').due == d3, d3), 'calendar: drag task → new due date');
  await page.screenshot({ path: out + '/h_cal.png' });
  await f.click('#toastUndo'); await page.waitForTimeout(100);
  ok(await f.evaluate(d0 => findTask('T002').due == d0 && /Undo/.test(findTask('T002').history.join()), d0), 'calendar: Undo, noted in history');
  await f.dragAndDrop('.ev:not(.p):has-text("Level 16 walls")', `td[data-day="${d3}"]`); await page.waitForTimeout(150);
  ok(await f.evaluate(([d0, d3]) => { var t = findTask('T001'); return t.due == d0 && t.subs[0].due == d3 && t.subs[1].due == d3; }, [d0, d3]), 'calendar: drag ↳ items → only the items move');
  // person filter: only Ben's item moves
  await f.evaluate(d1 => { var t = findTask('T001'); t.subs[0].due = d1; t.subs[1].due = d1; save(); $('person').value = 'Ben'; render(); }, d1);
  await f.dragAndDrop('.ev:not(.p):has-text("Level 16 walls")', `td[data-day="${d3}"]`); await page.waitForTimeout(150);
  ok(await f.evaluate(([d1, d3]) => { var t = findTask('T001'); return t.subs[0].due == d1 && t.subs[1].due == d3; }, [d1, d3]), 'calendar: with a person picked, only their items move');
  await f.evaluate(() => { $('person').value = ''; render(); });
  // saved to disk
  const disk = await page.evaluate(() => JSON.parse(Object.values(window.__mockFs.files).find(x => /\\delegate\.json$/i.test(x.path)).text));
  ok(disk.tasks[0].subs[1].due == d3, 'changes saved in delegate.json');
  // ---- Slate theme + folding menu
  await page.evaluate(() => { var s = LT.settings(); s.theme = 'slate'; LT.saveSettings(s); LTMain.themeChanged(); });
  await f.click('[data-v="board"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor == 'rgb(8, 11, 15)'), 'Slate theme applied to the window');
  ok(await f.evaluate(() => getComputedStyle(document.querySelector('.btn')).borderRadius == '99px'), 'Slate: pill buttons in the tab');
  await page.screenshot({ path: out + '/h_slate_board.png' });
  await page.click('#railBtn'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => LT.$('nav').offsetWidth == 58 && LT.settings().rail === true), 'menu folds to icons and is remembered');
  await f.click('[data-v="cal"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/h_slate_cal_rail.png' });
  await page.keyboard.press('Control+BracketLeft'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => LT.$('nav').offsetWidth == 200 && LT.settings().rail === false), 'Ctrl+[ opens it again');
  await page.evaluate(() => { var s = LT.settings(); s.theme = 'slatelight'; LT.saveSettings(s); LTMain.themeChanged(); });
  await page.waitForTimeout(200); await page.screenshot({ path: out + '/h_slate_light.png' });
};
