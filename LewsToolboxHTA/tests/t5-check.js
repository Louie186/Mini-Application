// Submission Check in the pretend Windows
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const P = '5013-KEO-ZZ-DR-A';
    ['Drawings\\' + P + '-10101-P02.pdf', 'Drawings\\' + P + '-10101-P02.dwg', 'Drawings\\' + P + '-10102-P01.pdf', 'Drawings\\' + P + '-10103-P01.pdf', 'Drawings\\' + P + '-10105-P01.rvt',
     'Drawings\\' + P + '-10106-P01.pdf', 'Drawings\\5013-keo-zz-dr-a-10107-p01.pdf', 'random notes.txt'].forEach(n => add('C:\\Sub\\' + n, 'x'));
    add('C:\\Sub\\Drawings\\empty.pdf', '');
    add('C:\\Lists\\list.csv', 'TRANSMITTAL 03 - Tower 1\r\n\r\nDrawing Number,Title,Rev,Format,Folder\r\n' + [
      [P + '-10101', 'GA L1', 'P02', '"pdf, dwg"', ''], [P + '-10102', 'GA L2', 'P02', 'pdf', ''], [P + '-10103', 'GA L3', 'P01', '"pdf,dwg"', ''], [P + '-10104', 'GA L4', 'P01', 'pdf', ''],
      [P + '-10105', 'Model', 'P01', 'rvt', 'Models'], [P + '-10106-P01.pdf', 'GA L6', '', '', ''], [P + '-10101', 'GA L1 again', 'P02', 'pdf', ''], [P + '-10107', 'GA L7', 'P01', 'pdf', '']].map(r => r.join(',')).join('\r\n'));
  });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(600);
  const f = page.frame({ url: /check\.html/ });
  await f.evaluate(() => { window.top.__nextFolder = 'C:\\Sub'; }); await f.click('#bFolder');
  await f.evaluate(() => { readList('C:\\Lists\\list.csv', true); cfg.list = 'C:\\Lists\\list.csv'; saveCfg(); showPaths(); });
  ok(await f.evaluate(() => cfg.colName == 'Drawing Number' && cfg.colRev == 'Rev' && cfg.colFmt == 'Format' && cfg.colFolder == 'Folder' && cfg.colTitle == 'Title' && headRow == 2), 'heading row found under the title rows; columns guessed');
  await f.click('#bRun'); await page.waitForTimeout(300);
  const st = await f.evaluate(() => last.rows.map(r => r.status));
  console.log('   ' + st.join(' | '));
  ok(st.join('|') == 'Found|Wrong revision|Missing file type|Missing|Wrong folder|Found|Listed twice|Found', 'each list row gets the right result');
  ok(await f.evaluate(() => last.rows[7].lv == 1 && /case/.test(last.rows[7].note)), 'upper/lower case difference noted');
  ok(await f.evaluate(() => last.extra.length == 2 && last.extra.some(e => e.name == 'random notes.txt')), '2 files not on the list');
  ok(await f.evaluate(() => last.types.pdf[1] == 6 && last.types.dwg[0] == 2 && last.types.dwg[1] == 1), 'count by type: 6 pdf, dwg 1 of 2 needed');
  const s = await f.evaluate(() => summaryText()); ok(/MISSING \(1\)/.test(s) && /NOT ON THE LIST \(2\)/.test(s), 'summary text for email');
  await page.screenshot({ path: out + '/h_check.png' });
  await f.evaluate(() => { window.top.__excel = 1; });
  const rep = await f.evaluate(() => excelReport());
  ok(/SubmissionCheck_Sub_.*\.xlsx$/.test(rep || ''), 'Excel report made: ' + (rep || '').split('\\').pop());
};
