// Folder Contents: folder first, then the reference list gives Tower / Typology / Model (made-up data)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { window.__excel = 1;
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const P = '5013-KEO-T1-ZZ-PLN-INT-';
    const rows = [['Residential'], [P + '10100-T1', 'UNIT 1BR A - SETTING OUT', 'Tower 1', '1BRA', '21000'], [P + '10101-T1', 'UNIT 1BR A - FINISHES', 'Tower 1', '1BRA', '21000'],
      [P + '10110-T1', 'UNIT 1BR B - SETTING OUT', 'Tower 1', '1BRB', '21010'],
      ['Enlarged drawings'], ['5013-KEO-T2-ZZ-PLN-INT-10270-T1', 'UNIT 2BR C - SETTING OUT', 'Tower 2', '2BRC', '22070']];
    const cells = {}; rows.forEach((r, i) => r.forEach((v, j) => cells[(i + 1) + ',' + (j + 1)] = { show: v }));
    add('C:\\Lists\\Typology.xlsx', 'MOCKXL' + JSON.stringify([{ name: 'List', visible: -1, cells }]));
    [P + '10100-T1.pdf', P + '10100-T1.dwg', P + '10100-T2.pdf', P + '10101-T1.pdf', 'CAD\\' + P + '10110-T1.dwg', 'CAD\\' + P + '10110-T1.rvt',
     '5013-KEO-T2-ZZ-PLN-INT-10270-T1.pdf', P + '19999-T1.pdf', 'Transmittal.xlsx', 'notes.docx'].forEach(n => add('C:\\Drawings\\' + n, 'x'));
  });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(400); await page.mouse.move(900, 600); await page.frame({ url: /check\.html/ }).click('[data-fv="contents"]'); await page.waitForTimeout(700);   // a view inside Folder Check
  const f = page.frame({ url: /contents\.html/ });
  await f.evaluate(() => { top.__nextFolder = 'C:\\Drawings'; });
  await f.click('#bFolder'); await page.waitForTimeout(200);
  ok(await f.evaluate(() => document.getElementById('ask').style.display == 'block'), 'asks which list to use after picking the folder');
  await page.screenshot({ path: out + '/i_ask.png' });
  await f.evaluate(() => useRef('file', 'C:\\Lists\\Typology.xlsx')); await page.waitForTimeout(200);
  const cols = await f.evaluate(() => [cfg.cols.name, cfg.cols.title, cfg.cols.tower, cfg.cols.typo, cfg.cols.model].join(' | '));
  ok(cols == 'Column A | Column B | Column C | Column D | Column E', 'columns guessed: ' + cols);
  const r = await f.evaluate(() => result.rows.map(x => [x.base.slice(-5), x.revs.join('+'), typeList(x.types).join('+'), x.ref ? x.ref.tower : '-', x.ref ? x.ref.typo : '-', x.ref ? x.ref.model : '-', x.folders.join('+') || 'top'].join(' ')));
  console.log('   ' + r.join('\n   '));
  ok(r[0] == '10100 T1+T2 dwg+pdf Tower 1 1BRA 21000 top', 'drawing shown once with both revisions and its file types');
  ok(r[2] == '10110 T1 dwg+rvt Tower 1 1BRB 21010 CAD', 'subfolder files read (dwg + rvt in CAD)');
  ok(r.some(x => /^19999 T1 pdf - - -/.test(x)), 'drawing not in the list has no tower');
  ok(await f.evaluate(() => result.other.length == 2), 'non-drawing files kept separately (2)');
  const sum = await f.evaluate(() => document.getElementById('sumTxt').innerText + ' / ' + document.getElementById('chips').innerText + ' / ' + document.getElementById('types').innerText);
  console.log('   ' + sum);
  ok(/5 drawing/.test(sum) && /not on the checklist 1/.test(sum) && /\.pdf 5/.test(sum), 'summary counts drawings, not on the list (now a button), and file types');
  await page.screenshot({ path: out + '/i_contents.png' });
  await f.selectOption('#show', 'noref');
  ok(await f.evaluate(() => shown.length == 1 && /19999/.test(shown[0].base)), 'Show: not in the reference list');
  await f.selectOption('#show', 'all'); await f.selectOption('#fType', 'rvt');
  ok(await f.evaluate(() => shown.length == 1 && /10110/.test(shown[0].base)), 'filter by file type rvt');
  await f.selectOption('#fType', ''); await f.selectOption('#show', 'groups');
  const g = await f.evaluate(() => groupRows().map(x => x.tower + '/' + x.typo + ' ' + x.n + ' [' + typeList(x.types).map(t => t + ' ' + x.types[t]).join(', ') + '] ' + x.models.join(',')));
  console.log('   ' + g.join('\n   '));
  ok(g.join(';') == 'Tower 1/1BRA 2 [dwg 1, pdf 2] 21000;Tower 1/1BRB 1 [dwg 1, rvt 1] 21010;Tower 2/2BRC 1 [pdf 1] 22070;(not in the reference)/ 1 [pdf 1] ', 'summary by tower / typology');
  await page.screenshot({ path: out + '/i_groups.png' });
  ok(/BY TOWER \/ TYPOLOGY/.test(await f.evaluate(() => summaryText())), 'copied summary has tower / typology lines');
  // second pick goes straight in, no question
  await f.evaluate(() => { top.__nextFolder = 'C:\\Drawings\\CAD'; });
  await f.click('#bFolder'); await page.waitForTimeout(200);
  ok(await f.evaluate(() => document.getElementById('ask').style.display != 'block' && result.rows.length == 1), 'next folder uses the same list without asking');
  // none
  await f.selectOption('#show', 'all'); await f.evaluate(() => useRef('none'));
  ok(await f.evaluate(() => !refMap && result.rows.length == 1 && !/Tower/.test(document.getElementById('res').innerHTML)), 'None: just drawings and file types');
};
