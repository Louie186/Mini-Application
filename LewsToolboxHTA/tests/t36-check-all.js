// Folder Check > Check all: checklist + Folder 2 (goes out) + Folder 1 (source): cards, quantity, names, Collect, old revisions out
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    var W = 'C:\\WIP\\', S = 'C:\\Submission\\';
    // folder 1 (source)
    ['PRJ-KEO-T1-ZZ-DR-A-10101-P02.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10101-P02.dwg', 'PRJ-KEO-T1-ZZ-DR-A-10102-P01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10102-P01.dwg', 'PRJ-KEO-T1-ZZ-DR-A-10103-P03.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10103-P03.dwg', 'PRJ-KEO-T1-ZZ-DR-A-10104-P01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10104-P01.dwg'].forEach(n => add(W + n, 'SRC ' + n));
    // folder 2 (goes out): 10101 ok, 10102 missing the dwg, 10103 old P02 only, 10104 missing, an extra file, an old revision of 10101, a bad name
    ['PRJ-KEO-T1-ZZ-DR-A-10101-P02.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10101-P02.dwg', 'PRJ-KEO-T1-ZZ-DR-A-10101-P01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10102-P01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10103-P02.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10103-P02.dwg', 'Notes from Sam.pdf'].forEach(n => add(S + n, 'SRC ' + n));
    LT.saveJson(LT.dataPath('naming.json'), { last: 0, rules: [{ name: 'Project rule', sep: '-', revOptional: true, parts: [{ name: 'Project', kind: 'any' }, { name: 'Orig', kind: 'any' }, { name: 'Vol', kind: 'any' }, { name: 'Lvl', kind: 'any' }, { name: 'Type', kind: 'list', val: 'DR,SH' }, { name: 'Role', kind: 'list', val: 'A' }, { name: 'Num', kind: 'digits', val: '5' }, { name: 'Rev', kind: 'rev' }] }] });
    var s = LT.settings(); s.askLog = false; LT.saveSettings(s); });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500); await page.mouse.move(900, 650);
  const c = page.frame({ url: /check\.html/ }); await c.click('[data-fv="checkall"]'); await page.waitForTimeout(600);
  const k = page.frame({ url: /checkall\.html/ });
  ok(/Check everything at once/.test(await k.evaluate(() => $('res').innerText)), 'Check all view: explains the 3 steps');
  await k.evaluate(() => { cfg.src = { kind: 'paste', lines: ['PRJ-KEO-T1-ZZ-DR-A-10101\tP02\tPlan L1', 'PRJ-KEO-T1-ZZ-DR-A-10102\tP01', 'PRJ-KEO-T1-ZZ-DR-A-10103\tP03', 'PRJ-KEO-T1-ZZ-DR-A-10104\tP01'] }; cfg.f2 = 'C:\\Submission'; cfg.f1 = 'C:\\WIP'; cfg.need = 'pdf, dwg'; LT.saveJson(FILE(), cfg); show(); });
  await k.click('#bRun'); await page.waitForTimeout(200);
  const st = await k.evaluate(() => R.rows.map(r => r.it.base.slice(-5) + ':' + r.st).join(' '));
  console.log('   ' + st);
  ok(st == '10101:OK 10102:Missing file type 10103:Wrong revision 10104:Missing', 'each drawing: OK / missing dwg / wrong revision (P02 not P03) / missing');
  const cards = await k.evaluate(() => [...document.querySelectorAll('.cd')].map(c => c.innerText.replace(/\s+/g, ' ')).join(' | '));
  console.log('   ' + cards);
  ok(/1 ✔ OK/.test(cards) && /1 ✖ Missing/.test(cards) && /1 ↻ Wrong revision/.test(cards) && /1 ◐ Missing file type/.test(cards) && /1 ➕ Not on the checklist/.test(cards) && /2 🗑 Old revisions too/.test(cards) && /3 📥 Can collect/.test(cards), 'cards: OK, missing, wrong rev, missing type, not on the list, old revisions, can collect');
  ok(/1 🏷 Name problems/.test(cards), 'names checked against the naming rule (Notes from Sam.pdf)');
  ok(/checklist 4 drawings · 1 complete · Folder 2 has 7 files .* expected about 8/.test(await k.evaluate(() => $('qty').innerText)), 'quantity line: checklist, complete, files in Folder 2, expected');
  await page.screenshot({ path: out + '/k_checkall.png' });
  await k.click('.cd[data-cf="miss"]');
  ok(await k.evaluate(() => $('res').querySelectorAll('tr').length == 2 && /10104/.test($('res').innerText)), 'click a card: only those drawings');
  // collect from folder 1
  await k.evaluate(() => { window.confirm = () => true; window.alert = () => {}; }); await k.click('#bCollect'); await page.waitForTimeout(200);
  let files = await F();
  ok(['10102-P01.dwg', '10103-P03.pdf', '10103-P03.dwg', '10104-P01.pdf', '10104-P01.dwg'].every(n => files.includes('C:\\Submission\\PRJ-KEO-T1-ZZ-DR-A-' + n)), 'Collect: the missing dwg, the right revision (P03) and the missing drawing copied from Folder 1');
  ok(await k.evaluate(() => R.rows.every(r => r.st == 'OK')), 'after Collect every drawing is OK (it checks again by itself)');
  // old revisions out
  await k.click('#bOld'); await page.waitForTimeout(150); files = await F();
  ok(files.includes('C:\\Submission\\_Superseded\\PRJ-KEO-T1-ZZ-DR-A-10101-P01.pdf') && files.includes('C:\\Submission\\_Superseded\\PRJ-KEO-T1-ZZ-DR-A-10103-P02.pdf') && !files.includes('C:\\Submission\\PRJ-KEO-T1-ZZ-DR-A-10101-P01.pdf'), 'Move old revisions out: into Folder 2\\_Superseded (not checked any more)');
  ok(await k.evaluate(() => !R.rows.some(r => r.flags.old)), 'no old revisions left');
  // a copy that differs from folder 1
  await page.evaluate(() => { window.__mockFs.files['c:\\submission\\prj-keo-t1-zz-dr-a-10101-p02.pdf'].text = 'CHANGED - a different size'; });
  await k.click('#bRun'); await page.waitForTimeout(150);
  ok(/1 ↔ Differs from Folder 1/.test(await k.evaluate(() => $('cards').innerText.replace(/\s+/g, ' '))), 'a file not the same as in Folder 1 (size) is flagged');
  ok(/MISSING|OTHER NOTES/.test(await k.evaluate(() => reportText())), 'Report: copy the result as text');
};
