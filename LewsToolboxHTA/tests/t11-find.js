// Find Drawings: several folders, revision ignored but shown, latest, short numbers, not found, big folder (made-up data)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    const fs = window.__mockFs, add = (p) => { fs.files[p.toLowerCase()] = { path: p, text: 'x', time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const N = (t, n) => 'PRJ-ABC-' + t + '-ZZ-PLN-INT-' + n;
    add('P:\\Proj\\01 WIP\\Tower 1\\PDF\\' + N('T1', '10100') + '-T1.pdf');
    add('P:\\Proj\\04 Published\\2026-11-01 Submission\\' + N('T1', '10100') + '-T2.pdf');
    add('P:\\Proj\\04 Published\\2026-11-01 Submission\\CAD\\' + N('T1', '10100') + '-T2.dwg');
    add('P:\\Proj\\01 WIP\\Tower 1\\PDF\\' + N('T1', '10110') + '-T1.pdf');
    add('P:\\Proj\\02 Shared\\Tower 1\\' + N('T1', '10110') + '-T2 - UNIT TYPE 1BR B.pdf');
    add('P:\\Proj\\02 Shared\\Tower 2\\20261101_' + N('T2', '10270') + '-T1.pdf');
    add('P:\\Proj\\02 Shared\\Tower 2\\notes.txt');
    add('Q:\\Archive\\Old\\' + N('T1', '10100') + '-T0.pdf');
  });
  await page.evaluate(() => LTMain.show('find')); await page.waitForTimeout(1200);   // Find drawings lives in Folder Check now
  const f = page.frame({ url: /find\.html/ });
  for (const p of ['P:\\Proj', 'Q:\\Archive']) { await f.evaluate((p) => { top.__nextFolder = p; }, p); await f.click('#bAdd'); }
  ok(await f.evaluate(() => cfg.roots.length == 2), 'two folders added');
  await f.fill('#q', 'PRJ-ABC-T1-ZZ-PLN-INT-10100\nPRJ-ABC-T1-ZZ-PLN-INT-10110-T2\n10270\nPRJ-ABC-T2-ZZ-SEC-INT-30442');
  await f.click('#bFind'); await page.waitForTimeout(800);
  const g = await f.evaluate(() => last.groups.map(x => x.q.text.slice(-11) + ': ' + x.files.map(y => y.rec.rev + (y.latest ? '*' : '') + '.' + y.rec.ext + '@' + y.loc).join(', ')));
  console.log('   ' + g.join('\n   '));
  ok(g[0] == 'N-INT-10100: T0.pdf@Archive\\Old, T1.pdf@Proj\\01 WIP\\Tower 1\\PDF, T2*.pdf@Proj\\04 Published\\2026-11-01 Submission, T2*.dwg@Proj\\04 Published\\2026-11-01 Submission\\CAD', 'every revision found in both folders, oldest first, T2 latest, location shown');
  ok(/T1\.pdf.*T2\*\.pdf@Proj\\02 Shared\\Tower 1/.test(g[1]), 'typed with a revision: still finds every revision; name with a title after it works');
  ok(g[2] == '10270: T1*.pdf@Proj\\02 Shared\\Tower 2', 'short number finds the drawing (date in front of the file name)');
  ok(g[3] == 'C-INT-30442: ', 'drawing with no file -> not found');
  const sum = await f.evaluate(() => document.getElementById('sum').innerText);
  console.log('   ' + sum); ok(/4 drawing\(s\) searched · 3 found · 7 file\(s\) in 6 folder\(s\) · 1 not found/.test(sum), 'summary counts');
  await page.screenshot({ path: out + '/k_find.png' });
  await f.check('#latest');
  ok(await f.evaluate(() => shown.length == 4 && shown.every(x => x.latest)), 'latest revision only: 4 files');
  await f.uncheck('#latest'); await f.selectOption('#fType', 'dwg');
  ok(await f.evaluate(() => shown.length == 1 && shown[0].rec.ext == 'dwg'), 'file type filter');
  await f.selectOption('#fType', ''); await f.selectOption('#show', 'miss');
  ok(await f.evaluate(() => /Not found in these folders/.test(document.getElementById('res').innerHTML) && shown.length == 0), 'Show: not found only');
  await f.selectOption('#show', 'all');
  ok(await f.evaluate(() => folderText().length == 6 && folderText()[0] == 'Q:\\Archive\\Old'), 'copy the folders gives full paths (6)');
  ok(await f.evaluate(() => exportRows().length == 9 && exportRows()[8][5] == 'NOT FOUND'), 'export rows (7 files + 1 not found)');
  // long folder paths: the X stays visible and works; New search empties everything
  await page.evaluate(() => { const fs = window.__mockFs; ['C:\\Users\\F265\\DC\\ACCDocs\\Company\\25-0000\\Project Files\\102-WIP Very Long Folder Name For Testing', 'C:\\Users\\F265\\DC\\ACCDocs\\Company\\25-0000\\Project Files\\300-PUBLISHED Another Long Folder Name'].forEach(p => fs.dirs[p.toLowerCase()] = p); });
  for (const p of ['C:\\Users\\F265\\DC\\ACCDocs\\Company\\25-0000\\Project Files\\102-WIP Very Long Folder Name For Testing', 'C:\\Users\\F265\\DC\\ACCDocs\\Company\\25-0000\\Project Files\\300-PUBLISHED Another Long Folder Name']) { await f.evaluate((p) => { top.__nextFolder = p; }, p); await f.click('#bAdd'); }
  const xs = await f.evaluate(() => [...document.querySelectorAll('#roots .x')].map(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.right < innerWidth; }));
  ok(xs.length == 4 && xs.every(Boolean), 'every folder X is visible (4 folders, long paths shortened)');
  await page.screenshot({ path: out + '/k_find_chips.png', clip: { x: 200, y: 0, width: 980, height: 60 } });
  await f.click('#roots [data-rm="3"]');
  ok(await f.evaluate(() => cfg.roots.length == 3 && !/300-PUBLISHED/.test(cfg.roots.join())), 'clicking the X takes that folder off');
  const keepQ = await f.evaluate(() => document.getElementById('q').value);
  await f.click('#bNew');
  ok(await f.evaluate(() => cfg.roots.length == 0 && document.getElementById('q').value == '' && !last), 'New search: no folders, empty drawings box, no result');
  await f.evaluate((q) => { cfg.roots = ['P:\\Proj', 'Q:\\Archive']; document.getElementById('q').value = q; save(); showRoots(); }, keepQ);
  // remembered
  ok(await f.evaluate(() => { const c = LT.readJson(LT.dataPath('find.json'), {}); return c.roots.length == 2 && /30442/.test(c.q); }), 'folders and search remembered');
  // big folder: 5,000 files in 500 folders, read in steps
  await page.evaluate(() => { const fs = window.__mockFs; for (let d = 0; d < 500; d++) for (let i = 0; i < 10; i++) { const p = 'B:\\Big\\F' + d + '\\BIG-PRJ-ZZ-ZZ-' + String(d * 10 + i).padStart(5, '0') + '-T' + (1 + i % 3) + '.pdf'; fs.files[p.toLowerCase()] = { path: p, text: 'x', time: 1 }; fs.dirs[('B:\\Big\\F' + d).toLowerCase()] = 'B:\\Big\\F' + d; } fs.dirs['b:\\big'] = 'B:\\Big'; fs.dirs['b:'] = 'B:'; });
  await f.evaluate(() => { cfg.roots = ['B:\\Big']; IDX = null; showRoots(); document.getElementById('q').value = 'BIG-PRJ-ZZ-ZZ-04999\n02500'; });
  const t0 = Date.now(); await f.click('#bFind');
  let sawProgress = false; for (let i = 0; i < 600; i++) { const s = await f.evaluate(() => [!!scanning, document.getElementById('progTxt').innerText]); if (s[0] && /Reading/.test(s[1])) sawProgress = true; if (!s[0] && await f.evaluate(() => !!last && last.groups.length == 2)) break; await page.waitForTimeout(100); }
  const big = await f.evaluate(() => [IDX.nFiles, IDX.nDirs, last.groups[0].files.length, last.groups[1].files.length].join(' '));
  console.log('   big folder: ' + big + ' in ' + (Date.now() - t0) + ' ms (pretend Windows)');
  ok(big == '5000 501 1 1' && await f.evaluate(() => IDX.steps > 1), 'big folder read in steps with a progress count, both found');
  await f.evaluate(() => { IDX = null; readFolders(); stopNow = true; }); await page.waitForTimeout(400);
  ok(await f.evaluate(() => !scanning && IDX.stopped && IDX.nFiles < 5000 && /stopped/.test(document.getElementById('idxLbl').innerText)), 'Stop works and says it was stopped part way');
};
