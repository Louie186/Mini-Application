// Submission Check with Tower / Typology / Model columns (made-up data)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { window.__excel = 1;
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const P = '5013-KEO-T1-ZZ-PLN-INT-';
    const rows = [['Residential'], [P + '10100-T1', 'UNIT 1BR A - SETTING OUT', 'Tower 1', '1BRA', '21000'], [P + '10101-T1', 'UNIT 1BR A - FINISHES', 'Tower 1', '1BRA', '21000'],
      [P + '10110-T1', 'UNIT 1BR B - SETTING OUT', 'Tower 1', '1BRB', '21010'], [P + '10111-T1', 'UNIT 1BR B - FINISHES', 'Tower 1', '1BRB', '21010'],
      ['Enlarged drawings'], ['5013-KEO-T2-ZZ-PLN-INT-10270-T1', 'UNIT 2BR C - SETTING OUT', 'Tower 2', '2BRC', '22070']];
    const cells = {}; rows.forEach((r, i) => r.forEach((v, j) => cells[(i + 1) + ',' + (j + 1)] = { show: v }));
    add('C:\\Lists\\Typology.xlsx', 'MOCKXL' + JSON.stringify([{ name: 'List', visible: -1, cells }]));
    const cells2 = {}; [['10100', 'A', 'Tower 1', '1BRA'], ['10110', 'B', 'Tower 1', '1BRB'], ['10270', 'C', 'Tower 2', '2BRC']].forEach((r, i) => r.forEach((v, j) => cells2[(i + 1) + ',' + (j + 1)] = { show: v }));
    add('C:\\Lists\\Short.xlsx', 'MOCKXL' + JSON.stringify([{ name: 'Sheet1', visible: -1, cells: cells2 }]));
    [P + '10100-T1.pdf', P + '10100-T1.dwg', P + '10101-T1.pdf', P + '10110-T1.pdf', P + '10111-T2.pdf', 'extra.pdf'].forEach(n => add('C:\\Sub\\' + n, 'x'));
  });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(400);
  const f = page.frame({ url: /check\.html/ });
  await f.evaluate(() => { cfg.folder = 'C:\\Sub'; readList('C:\\Lists\\Typology.xlsx', true); cfg.list = 'C:\\Lists\\Typology.xlsx'; saveCfg(); showPaths(); });
  const cols = await f.evaluate(() => [cfg.colName, cfg.colTitle, cfg.colTower, cfg.colTypo, cfg.colModel].join(' | '));
  ok(cols == 'Column A | Column B | Column C | Column D | Column E', 'columns guessed from the cells: ' + cols);
  await f.click('#bRun'); await page.waitForTimeout(300);
  const r = await f.evaluate(() => last.rows.map(x => [x.entry.slice(-8), x.tower, x.typo, x.model, x.status, (x.found || []).join('+')].join(' ')));
  console.log('   ' + r.join('\n   '));
  ok(r[0] == '10100-T1 Tower 1 1BRA 21000 Found dwg+pdf', 'shows tower, typology, model and file types found (dwg+pdf)');
  ok(/Wrong revision/.test(r[3]) && /Missing/.test(r[4]), 'wrong revision and missing still found');
  await f.selectOption('#fTower', 'Tower 1'); await f.evaluate(() => { $('show').value = 'all'; render(); });
  ok(await f.evaluate(() => shown.length == 4 && shown.every(x => x.tower == 'Tower 1')), 'filter by Tower 1 shows its 4 drawings');
  await page.screenshot({ path: out + '/h_typo_list.png' });
  await f.selectOption('#fTower', ''); await f.selectOption('#show', 'groups');
  const g = await f.evaluate(() => groupRows().map(x => x.tower + '/' + x.typo + ' ' + x.found + 'of' + x.n + ' miss' + x.miss + ' rev' + x.rev + ' [' + typesText(x.types) + '] ' + x.models.join(',')));
  console.log('   ' + g.join('\n   '));
  ok(g.join(';') == 'Tower 1/1BRA 2of2 miss0 rev0 [dwg 1, pdf 2] 21000;Tower 1/1BRB 1of2 miss0 rev1 [pdf 1] 21010;Tower 2/2BRC 0of1 miss1 rev0 [] 22070', 'summary by tower / typology');
  await page.screenshot({ path: out + '/h_typo_groups.png' });
  ok(/BY TOWER \/ TYPOLOGY/.test(await f.evaluate(() => summaryText())), 'copied summary includes tower / typology lines');
  // short numbers only
  await f.evaluate(() => { readList('C:\\Lists\\Short.xlsx', true); cfg.list = 'C:\\Lists\\Short.xlsx'; showPaths(); });
  await f.click('#bRun'); await page.waitForTimeout(300);
  const s = await f.evaluate(() => last.rows.map(x => x.entry + ':' + x.status + ':' + (x.found || []).join('+')).join(' '));
  console.log('   ' + s);
  ok(s == '10100:Found:dwg+pdf 10110:Found:pdf 10270:Missing:', 'list with only the number part matches files by that number');
};
