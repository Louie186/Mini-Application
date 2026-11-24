// Delegate: a task that is on hold in the Tasks tab (waits for another task) says so - and why - in the next files you send (task pack + Excel sheet)
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    LT.saveJson(LT.dataPath('tracker.json'), { seq: 2, view: 'open', tasks: [
      { id: 'ta', code: 'TL-001', title: 'Lobby ceiling details', status: 'To do', who: 'Ana', after: ['tb'], holdWhy: 'MEP clashes in the ceiling void', subs: [], refs: [], log: [] },
      { id: 'tb', code: 'TL-002', title: 'MEP coordination for lobby', status: 'To do', due: '2026-12-05', subs: [], refs: [], log: [] }] });
    LT.saveJson(LT.dataPath('delegate.json'), { seq: 2, groups: [], tasks: [
      { id: 'a', code: 'T006', log: 'TL-001', title: 'Lobby ceiling details', who: 'Ana', due: '', status: 'Not started', subs: [{ code: 'T006.1', title: 'Sheet 1', who: '', due: '', status: 'Not started', notes: '' }], history: [] },
      { id: 'b', code: 'T007', title: 'Other', who: 'Ana', due: '', status: 'Not started', subs: [{ code: 'T007.1', title: 'X', who: '', due: '', status: 'Not started', notes: '' }], history: [] }] }); });
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(700);
  const d = page.frame({ url: /delegate\.html/ }); await d.evaluate(() => { load(); view = 'list'; render(); });
  ok(await d.evaluate(() => { const r = [...document.querySelectorAll('#main tr.task')]; return /on hold/.test(r.find(x => /T006/.test(x.innerText)).innerText) && !/on hold/.test(r.find(x => /T007/.test(x.innerText)).innerText); }), 'Delegate list: T006 (from TL-001) tagged on hold; T007 not');
  ok(await d.evaluate(() => holdText(findTask('T006')) == 'ON HOLD - waits for TL-002 MEP coordination for lobby (due 05 Dec). Why: MEP clashes in the ceiling void' || /ON HOLD - waits for TL-002 MEP coordination for lobby \(due .*\)\. Why: MEP clashes in the ceiling void/.test(holdText(findTask('T006')))), 'the hold text: what it waits for, its date, and why');
  // the task pack
  await d.evaluate(() => { LT.mkdirs('C:\\Out'); buildPack('C:\\Out\\H.html', [findTask('T006'), findTask('T007')], 'Akala', 'Lew', 'Ana', 'Ana', 'X', [], {}); });
  fs.writeFileSync('/tmp/claude-0/pack-hold.html', await page.evaluate(() => window.__mockFs.files['c:\\out\\h.html'].text));
  const pg = await page.context().newPage(); const perr = []; pg.on('pageerror', e => perr.push(e.message)); await pg.setViewportSize({ width: 1200, height: 800 }); await pg.goto('file:///tmp/claude-0/pack-hold.html'); await pg.waitForTimeout(600);
  const cards = await pg.evaluate(() => [...document.querySelectorAll('.card')].map(c => c.innerText.replace(/\s+/g, ' ')));
  ok(!perr.length && /ON HOLD/.test(cards[0]) && /waits for TL-002 MEP coordination for lobby/.test(cards[0]) && /Why: MEP clashes in the ceiling void/.test(cards[0]) && !/ON HOLD/.test(cards[1]), 'task pack: an ON HOLD tag + a line with what it waits for and why (only on that task)');
  await pg.screenshot({ path: out + '/pack_hold.png' }); await pg.close();
  // the Excel task sheet
  await page.evaluate(() => { top.__excel = 1; });
  await d.evaluate(() => { buildPlan('C:\\Out\\HPlan.xlsx', [findTask('T006'), findTask('T007')], 'Akala', 'Lew', 'Ana', 'X', []); });
  const xl = await page.evaluate(() => { var k = Object.keys(window.__mockFs.files).filter(p => /hplan\.xlsx$/i.test(p))[0]; return k ? window.__mockFs.files[k].text : 'NOFILE'; });
  ok(/ON HOLD - wait before starting/.test(xl) && /T006  Lobby ceiling details/.test(xl) && /waits for TL-002 MEP coordination for lobby/.test(xl) && /Some tasks are ON HOLD: see the Guide sheet/.test(xl) && !/T007  Other/.test(xl), 'Excel task sheet: an ON HOLD section on the Guide sheet (the Tasks sheet says so)');
  // when TL-002 is done, the next files don't say on hold
  await page.evaluate(() => { const j = LT.readJson(LT.dataPath('tracker.json')); j.tasks[1].status = 'Done'; LT.saveJson(LT.dataPath('tracker.json'), j); });
  await d.evaluate(() => { HOLDS = null; });
  ok(await d.evaluate(() => holdText(findTask('T006')) === ''), 'TL-002 done: the next files no longer say on hold');
};
