// Folder Check > Review: the folder's contents become the checklist
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const R0 = 'C:\\Incoming\\From Sam 2026-11-12';
  await page.evaluate(R0 => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add; window.__del = p => { delete fs.files[p.toLowerCase()]; };
    ['A-101-P02.pdf', 'A-101-P02.dwg', 'A-102-P01.pdf', 'A-103-P01.pdf', 'Sections\\A-201-P01.pdf'].forEach(n => add(R0 + '\\' + n, 'X')); }, R0);
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const c = page.frame({ url: /check\.html/ });
  await c.click('[data-fv="review"]'); await page.waitForTimeout(600);
  const r = page.frame({ url: /review\.html/ });
  ok(/Review a folder/.test(await r.evaluate(() => $('res').innerText)), 'Review view: explains itself until a folder is picked');
  await r.evaluate(R0 => { top.__nextFolder = R0; }, R0); await r.click('#bFolder'); await page.waitForTimeout(200);
  ok(await r.evaluate(() => lines.length == 4 && lines.map(l => l.name).join() == 'A-101-P02,A-102-P01,A-103-P01,A-201-P01' && lines[0].types.join() == 'pdf,dwg'), 'one line per drawing (pdf + dwg together), subfolders included');
  ok(/0 of 4 reviewed/.test(await r.evaluate(() => $('sum').innerText)), '0 of 4 reviewed');
  const ix = n => r.evaluate(n => shown.findIndex(l => l.name == n), n);
  await r.click('tr[data-r="' + await ix('A-101-P02') + '"] .sb[data-v="ok"]');
  ok(await r.evaluate(() => shown[shown.length - 1].name == 'A-101-P02' && /Reviewed \(1\)/.test($('res').innerText)), 'Checked: it moves down to Reviewed');
  await r.click('tr[data-r="' + await ix('A-101-P02') + '"] .sb[data-v="no"]');
  const ni = await ix('A-101-P02'); await r.fill('[data-note="' + ni + '"]', 'Door swing wrong on grid C'); await r.press('[data-note="' + ni + '"]', 'Enter'); await page.waitForTimeout(100);
  const it = await r.evaluate(() => { var L = lines.find(l => l.name == 'A-101-P02'); return R.items[L.key]; });
  ok(it.st == 'no' && it.note == 'Door swing wrong on grid C' && it.by == 'lew' && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(it.at), 'Not OK + note, with who and when');
  // keyboard: Space = Checked
  await r.evaluate(() => { cur = 0; mark(); document.activeElement && document.activeElement.blur(); }); await page.keyboard.press('Space'); await page.waitForTimeout(100);
  ok(/2 of 4 reviewed/.test(await r.evaluate(() => $('sum').innerText)), 'Space marks the picked line Checked');
  // a note on an unmarked line marks it "Comments"
  await r.evaluate(() => { var i = shown.findIndex(l => !(R.items[l.key] || {}).st); var inp = $('res').querySelector('[data-note="' + i + '"]'); inp.value = 'Missing north arrow'; inp.dispatchEvent(new Event('change', { bubbles: true })); });
  ok(/3 of 4 reviewed/.test(await r.evaluate(() => $('sum').innerText)) && await r.evaluate(() => Object.values(R.items).some(x => x.st == 'cm' && x.note == 'Missing north arrow')), 'typing a note on an unmarked line = Comments');
  ok(await r.evaluate(() => $('remTop').checked && !(R.items[shown[0].key] || {}).st && /To check \(1\)/.test($('res').innerText)), 'To check on top, under its own heading');
  await page.screenshot({ path: out + '/r_review.png' });
  // a new file arrives, one goes; read again
  await page.evaluate(R0 => { window.__add(R0 + '\\A-104-P01.pdf', 'X'); window.__del(R0 + '\\A-101-P02.pdf'); window.__del(R0 + '\\A-101-P02.dwg'); }, R0);
  await r.click('#bRescan');
  ok(await r.evaluate(() => { var n = lines.find(l => l.name == 'A-104-P01'), g = lines.find(l => l.name == 'A-101-P02'); return n && n.isNew && g && g.gone; }), 'read again: A-104 shows NEW; A-101 (marked) stays, "not in the folder now"');
  ok(/1 NEW/.test(await r.evaluate(() => $('sum').innerText)), 'the summary counts NEW');
  // remembered
  await r.evaluate(() => { load(); open(cfg.folder); });
  ok(await r.evaluate(() => Object.values(R.items).filter(x => x.st).length == 3), 'remembered (opening again keeps every mark)');
  // report
  const txt = await r.evaluate(() => textReport());
  ok(/NOT OK \(1\)\r\n  • A-101-P02  – Door swing wrong on grid C/.test(txt) && /COMMENTS \(1\)/.test(txt) && /STILL TO CHECK \(2\)/.test(txt), 'Copy as text: not OK, comments, still to check');
  const html = await r.evaluate(() => htmlReport());
  ok(/Drawing review/.test(html) && /Door swing wrong/.test(html) && /href="file:\/\/\/C:\/Incoming/.test(html), 'HTML report with links to the drawings');
  // a folder from another view without a review: offered, not started
  await r.evaluate(() => { ltReceive('open-folder', 'C:\\Incoming'); });
  ok(await r.evaluate(() => !R && /Review this folder: Incoming/.test($('res').innerText) && !store.reviews['c:\\incoming']), 'a folder picked in another view is offered (no review made until you say)');
  await r.click('#bStart');
  ok(await r.evaluate(() => R && R.folder == 'C:\\Incoming'), 'Review this folder: starts it');
  await r.click('#bRecent'); await page.waitForTimeout(100);
  ok(/From Sam 2026-11-12.*3 of 5/.test(await r.evaluate(() => $('menu').innerText)), 'Recent ▾ lists past reviews with progress');
};
