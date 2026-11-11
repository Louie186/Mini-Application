// Drawing Register: projects, MIDP load + changes, guesses, models table, import, export; date picker (made-up data)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { window.__excel = 1;
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const xl = (p, sheets) => add(p, 'MOCKXL' + JSON.stringify(sheets.map(([name, rows]) => { const cells = {}; rows.forEach((r, i) => r.forEach((v, j) => { if (v !== '') cells[(i + 1) + ',' + (j + 1)] = { show: v }; })); return { name, visible: -1, cells }; })));
    const N = (t, n, r) => '9001-ABC-' + t + '-ZZ-PLN-INT-' + n + (r ? '-' + r : '');
    const v1 = [['Drawing Number', 'Title', 'Rev', 'Status'], ['GENERAL', '', '', ''],
      [N('XX', '00100', 'T0'), 'GENERAL NOTES', 'T0', 'S2'], [N('XX', '00101', 'T0'), 'LEGENDS AND SYMBOLS', 'T0', 'S2'], [N('XX', '00102', 'T0'), 'DOOR SCHEDULE', 'T0', 'S2'],
      ['APARTMENTS', '', '', ''],
      [N('T1', '10100', 'T1'), 'UNIT TYPE 1 BR - Type A (Res.1) - DETAILED PLANS', 'T1', 'S2'], [N('T1', '10101', 'T1'), 'UNIT TYPE 1 BR - Type A (Res.1) - SECTIONAL ELEVATIONS', 'T1', 'S2'],
      [N('T1', '10110', 'T1'), 'UNIT TYPE 1 BR - Type B (Res.1) - DETAILED PLANS', 'T1', 'S2'], [N('T2', '20100', 'T1'), 'UNIT TYPE 2 BR - Type C (Res.2) - DETAILED PLANS', 'T1', 'S2'],
      [N('T1', '10199', 'T1'), 'OLD DRAWING TO BE REMOVED', 'T1', 'S2']];
    xl('C:\\MIDP\\MIDP_V1.xlsx', [['COVER', [['Project MIDP']]], ['INT', v1]]);
    const v2 = v1.filter(r => !/10199/.test(r[0])).map(r => /00102/.test(r[0]) ? [r[0], 'DOOR SCHEDULE AND IRONMONGERY', r[2], r[3]] : r);
    v2.push([N('T1', '10111', 'T1'), 'UNIT TYPE 1 BR - Type B (Res.1) - SECTIONAL ELEVATIONS', 'T1', 'S2'], [N('T2', '20101', 'T1'), 'UNIT TYPE 2 BR - Type C (Res.2) - SECTIONAL ELEVATIONS', 'T1', 'S2'],
      [N('T2', '20200', 'T1'), 'UNIT TYPE 3 BR - Type D (Res.2) - DETAILED PLANS', 'T1', 'S2'], [N('XX', '00103', 'T0'), 'LIGHTING LEGEND', 'T0', 'S2']);
    xl('C:\\MIDP\\MIDP_V2.xlsx', [['COVER', [['Project MIDP']]], ['INT', v2]]);
    xl('C:\\Lists\\Models.xlsx', [['DATA', [['Tower', 'Typology', 'Sheet location', 'Model number', 'Model type'], ['T1', '1BRA', '4', 'M-21000', 'container model'], ['T1', '1BRB', '4', 'M-21001', 'container model'], ['T2', '2BRC', '9', 'M-22000', 'container model'], ['T2', '3BRD', '9', 'M-22010', 'container model']]]]);
    xl('C:\\Lists\\Generated.xlsx', [['GENERATED LIST', [['DRAWING NUMBER', 'DESCRIPTION', 'TOWER', 'TYPOLOGY', 'MODEL'], [N('XX', '00100'), 'GENERAL NOTES', '-', '-', ''], [N('XX', '00101'), 'LEGENDS AND SYMBOLS', '-', '-', ''],
      [N('T1', '10100'), 'UNIT TYPE 1 BR - Type A (Res.1) - DETAILED PLANS', 'T1', '1BRA', 'M-21000'], [N('T1', '10110'), 'UNIT TYPE 1 BR - Type B (Res.1) - DETAILED PLANS', 'T1', '1BRB', 'M-21001'], [N('T2', '20100'), 'UNIT TYPE 2 BR - Type C (Res.2) - DETAILED PLANS', '#N/A', '#N/A', '']]]]);
    ['DOOR SCHEDULE.pdf'].forEach(() => {});
    [N('T1', '10100', 'T1') + '.pdf', N('T1', '10100', 'T1') + '.dwg', N('T2', '20101', 'T1') + '.pdf'].forEach(n => add('C:\\Sub\\' + n, 'x'));
  });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(400);
  const f = page.frame({ url: /register\.html/ });
  ok(await f.evaluate(() => document.getElementById('empty').style.display == 'block'), 'empty register shows "Make a project"');
  await f.evaluate(() => { window.prompt = () => 'Test Tower Project'; }); await f.click('#bFirst');
  ok(await f.evaluate(() => P && P.name == 'Test Tower Project' && IX.projects.length == 1), 'project made');
  // setup: tower is part 3, import models table + earlier list
  await f.evaluate(() => { setupShow(); document.getElementById('sTowerPart').value = '3'; setupSave(); });
  await f.evaluate(() => { imp = { kind: 'models', path: 'C:\\Lists\\Models.xlsx', L: readModels('C:\\Lists\\Models.xlsx') }; impCols(true); });
  const mc = await f.evaluate(() => [imp.c.tower, imp.c.typo, imp.c.model].join('|'));
  ok(mc == 'Tower|Typology|Model number', 'models table columns found: ' + mc);
  await f.evaluate(() => impDo()); ok(await f.evaluate(() => P.models.length == 4), 'models table imported (4)');
  await f.evaluate(() => { imp = { kind: 'list', path: 'C:\\Lists\\Generated.xlsx', L: LT.readList('C:\\Lists\\Generated.xlsx', '') }; impCols(true); impDo(); });
  ok(await f.evaluate(() => Object.keys(P.drawings).length == 5 && P.drawings['9001-ABC-T1-ZZ-PLN-INT-10100'].ok && P.drawings['9001-ABC-T2-ZZ-PLN-INT-20100'].typo == '2BRC'), 'list imported; #N/A row got a guess (2BRC by rule)');
  // first MIDP: asks for the sheet
  await f.evaluate(() => loadMidp('C:\\MIDP\\MIDP_V1.xlsx'));
  ok(await f.evaluate(() => document.getElementById('ovSheet').style.display == 'block'), 'asks which sheet (2 sheets)');
  await f.click('#sheetList [data-sh="INT"]'); await page.waitForTimeout(200);
  const t1 = await f.evaluate(() => document.getElementById('ldTxt').innerText);
  ok(/8 drawings/.test(t1) && /New: 3/.test(t1), 'first MIDP: 8 drawings, 3 not known yet');
  await page.screenshot({ path: out + '/j_reg_first.png' });
  await f.click('#ldOk'); await page.waitForTimeout(200);
  const d1 = await f.evaluate(() => { const D = P.drawings; return Object.keys(D).map(k => [k.slice(-5), D[k].rev, D[k].cat, D[k].tower, D[k].typo, D[k].ok ? 'ok' : D[k].how].join(' ')).sort(); });
  console.log('   ' + d1.join('\n   '));
  ok(d1.includes('10101 T1 APARTMENTS T1 1BRA like'), 'new 10101 guessed T1 / 1BRA from its similar drawing; revision split off; section read');
  ok(d1.includes('00102 T0 GENERAL - - group'), 'new general drawing guessed "-" from its section');
  ok(await f.evaluate(() => P.setup.sheet == 'INT'), 'sheet remembered for next time');
  // second MIDP: changes
  await f.evaluate(() => loadMidp('C:\\MIDP\\MIDP_V2.xlsx'));
  const t2 = await f.evaluate(() => document.getElementById('ldTxt').innerText);
  console.log('   ' + t2.split('\n').filter(l => /New|Removed|Title|Same/.test(l)).join(' | '));
  ok(/New: 4/.test(t2) && /Removed from the MIDP: 1/.test(t2) && /Title changed: 1/.test(t2) && /Same: 6/.test(t2), 'second MIDP: 4 new, 1 removed, 1 title changed, 6 same');
  await f.click('#ldOk'); await page.waitForTimeout(200);
  const v = await f.evaluate(() => ({ view, n: shown.length, gone: P.drawings['9001-ABC-T1-ZZ-PLN-INT-10199'].inMidp, old: P.drawings['9001-ABC-XX-ZZ-PLN-INT-00102'].oldTitle }));
  ok(v.view == 'changes' && v.n == 6 && v.gone === false && v.old == 'DOOR SCHEDULE', 'opens on "Changes": 6 rows (4 new, 1 removed, 1 retitled)');
  const g = await f.evaluate(() => { const D = P.drawings, x = k => { const d = D['9001-ABC-' + k]; return d.tower + '/' + d.typo + '/' + modelOf(d) + '/' + (d.ok ? 'ok' : d.how); }; return [x('T1-ZZ-PLN-INT-10111'), x('T2-ZZ-PLN-INT-20101'), x('T2-ZZ-PLN-INT-20200')]; });
  console.log('   ' + g.join('  '));
  ok(g[0] == 'T1/1BRB/M-21001/like' && g[1] == 'T2/2BRC/M-22000/rule' && g[2] == 'T2/3BRD/M-22010/rule', 'guesses with models from the table (like / rule / rule)');
  await page.screenshot({ path: out + '/j_reg_changes.png' });
  // to check -> accept + set by hand
  await f.evaluate(() => { view = 'check'; render(); });
  const nCheck = await f.evaluate(() => shown.length);
  await f.evaluate(() => { ticked = {}; shown.forEach(k => ticked[k] = 1); accept(Object.keys(ticked)); ticked = {}; render(); });
  ok(nCheck >= 4 && await f.evaluate(() => counts().check == 1), 'accept the guesses: "To check" goes from ' + nCheck + ' to 1 (one with no guess)');
  await f.evaluate(() => { edit(['9001-ABC-XX-ZZ-PLN-INT-00103']); document.getElementById('edTower').value = 'T1'; document.getElementById('edTypo').value = '1BRA'; saveEdit(false); });
  ok(await f.evaluate(() => { const d = P.drawings['9001-ABC-XX-ZZ-PLN-INT-00103']; return d.how == 'you' && d.ok && modelOf(d) == 'M-21000'; }), 'edit by hand: model follows the table');
  ok(/NEW[\s\S]*REMOVED[\s\S]*TITLE CHANGED/.test(await f.evaluate(() => changesText())), 'copy changes text has new / removed / title changed');
  await f.evaluate(() => { view = 'midp'; render(); exportExcel(false); });
  const ex = await page.evaluate(() => Object.keys(window.__mockFs.files).filter(k => /drawingregister_/.test(k)));
  ok(ex.length == 1, 'Excel export saved: ' + (ex[0] || '').split('\\').pop());
  await f.evaluate(() => { view = 'all'; render(); });
  await page.screenshot({ path: out + '/j_reg_all.png' });
  // filter: tick sections, type to narrow
  await f.evaluate(() => { view = 'midp'; render(); });
  await f.click('#fbCat'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => document.getElementById('pick').style.display == 'block' && document.querySelectorAll('#pkList input').length == 2), 'Section filter opens with a tick-list (2 sections)');
  await f.fill('#pkQ', 'apart'); await f.evaluate(() => pickList()); await page.screenshot({ path: out + '/j_reg_pick.png' });
  ok(await f.evaluate(() => document.querySelectorAll('#pkList input').length == 1), 'typing narrows the list');
  await f.click('#pkAll'); await f.click('#pkDone');
  const fc = await f.evaluate(() => [shown.length, shown.every(k => P.drawings[k].cat == 'APARTMENTS'), document.getElementById('fbCat').innerText].join(' '));
  ok(/^\d+ true Section: APARTMENTS/.test(fc) && !/^0 /.test(fc), 'only the ticked section shows: ' + fc);
  await f.click('#fbTypo'); await f.evaluate(() => { F.typo['1BRB'] = 1; F.typo['2BRC'] = 1; fillFilters(); render(); pickHide(); });
  ok(await f.evaluate(() => shown.length == 4 && /2 ticked/.test(document.getElementById('fbTypo').innerText)), 'two typologies ticked at once: 4 drawings');
  await f.fill('#search', 'sectional'); await f.evaluate(() => { fillFilters(); render(); });
  ok(await f.evaluate(() => shown.length == 2), 'search adds on top of the filters');
  await page.screenshot({ path: out + '/j_reg_filter.png' });
  await f.click('#fClear');
  ok(await f.evaluate(() => shown.length == counts().midp && document.getElementById('fClear').style.display == 'none'), 'Clear filters shows everything again');
  // column width: drag the Title edge
  const box = await f.evaluate(() => { const r = document.querySelector('.rz[data-rz="title"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const fr = await (await f.frameElement()).boundingBox();
  await page.mouse.move(fr.x + box[0], fr.y + box[1]); await page.mouse.down(); await page.mouse.move(fr.x + box[0] - 150, fr.y + box[1], { steps: 5 }); await page.mouse.up();
  const w1 = await f.evaluate(() => colW().title);
  ok(w1 == 210, 'dragging the Title edge makes it narrower and remembers it: ' + w1);
  await f.evaluate(() => render());
  ok(await f.evaluate(() => document.querySelector('col[data-c="title"]').style.width == '210px'), 'width kept after redrawing');
  await f.dblclick('.rz[data-rz="title"]');
  ok(await f.evaluate(() => colW().title == 360), 'double-click the edge = back to normal');
  ok(await f.evaluate(() => !document.querySelector('.rz[data-rz="no"]') && document.querySelectorAll('.rz').length == 7), 'Drawing column has no drag edge; the 7 others do');
  // other tabs use it
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(400); await page.mouse.move(900, 600); await page.frame({ url: /check\.html/ }).click('[data-fv="contents"]'); await page.waitForTimeout(700);   // a view inside Folder Check
  const c = page.frame({ url: /contents\.html/ });
  await c.evaluate(() => { top.__nextFolder = 'C:\\Sub'; }); await c.click('#bFolder'); await page.waitForTimeout(200);
  ok(await c.evaluate(() => document.getElementById('aReg').style.display != 'none'), 'Folder Contents offers the Drawing Register');
  await c.click('#aReg'); await page.waitForTimeout(200);
  const cr = await c.evaluate(() => result.rows.map(r => r.base.slice(-5) + ':' + (r.ref ? r.ref.tower + '/' + r.ref.typo + '/' + r.ref.model : '-')).join(' '));
  ok(cr == '10100:T1/1BRA/M-21000 20101:T2/2BRC/M-22000', 'Folder Contents shows tower / typology / model from the register: ' + cr);
  // set up earlier with a list that has no Tower / Typology columns, and file names with extra text
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; fs.dirs['c:\\sub2'] = 'C:\\Sub2'; };
    add('C:\\Lists\\Plain.csv', 'Number,Title\r\n9001-ABC-T1-ZZ-PLN-INT-10100,A\r\n');
    add('C:\\Sub2\\9001-ABC-T1-ZZ-PLN-INT-10100-T1 - UNIT TYPE 1 BR A.pdf', 'x'); add('C:\\Sub2\\20261101_9001-ABC-T2-ZZ-PLN-INT-20101-T1.pdf', 'x'); add('C:\\Sub2\\notes.txt', 'x'); });
  await c.evaluate(() => { useRef('file', 'C:\\Lists\\Plain.csv'); cfg.folder = 'C:\\Sub2'; run(); $('show').value = 'all'; render(); });   // a list now opens on 'Remaining': look at every drawing
  const c2 = await c.evaluate(() => result.rows.map(r => r.base.slice(-5) + ':' + (r.ref ? r.ref.tower + '/' + r.ref.typo + '/' + r.ref.model : '-')).join(' ') + ' | other ' + result.other.length + ' | th ' + /<th>Tower/.test(document.getElementById('res').innerHTML));
  ok(c2 == '10100:T1/1BRA/M-21000 20101:T2/2BRC/M-22000 | other 1 | th true', 'old list without Tower columns + names with extra text: register fills them in: ' + c2);
  await c.evaluate(() => { useRef('none'); });
  ok(await c.evaluate(() => result.rows.length == 2 && regUsed == 2 && /<th>Tower/.test(document.getElementById('res').innerHTML)), '"None" still shows Tower / Typology / Model from the register');
  await page.screenshot({ path: out + '/j_contents_reg.png' });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(300); await page.mouse.move(900, 600); await page.frame({ url: /check\.html/ }).click('[data-fv="sub"]');   // Folder Check remembers the last view
  const k = page.frame({ url: /check\.html/ });
  await page.evaluate(() => { const fs = window.__mockFs, p = 'C:\\Lists\\Short.csv'; fs.files[p.toLowerCase()] = { path: p, text: 'Number,Title\r\n9001-ABC-T1-ZZ-PLN-INT-10100,A\r\n9001-ABC-T2-ZZ-PLN-INT-20101,B\r\n', time: Date.now() }; });
  await k.evaluate(() => { cfg.folder = 'C:\\Sub'; readList('C:\\Lists\\Short.csv', true); cfg.list = 'C:\\Lists\\Short.csv'; saveCfg(); showPaths(); });
  await k.click('#bRun'); await page.waitForTimeout(300);
  ok(await k.evaluate(() => regUsed == 2 && last.rows[1].typo == '2BRC' && last.rows[1].model == 'M-22000'), 'Submission Check fills Tower / Typology / Model from the register');
  // date picker in Delegate
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(300);
  const dg = page.frame({ url: /delegate\.html/ });
  await page.mouse.move(900, 600); await dg.evaluate(() => edit(null)); await page.waitForTimeout(200);   // '+ New task here' is under More now
  await dg.click('#eDue'); await page.waitForTimeout(100);
  ok(await dg.evaluate(() => document.getElementById('datePop').style.display == 'block'), 'clicking the due date opens the calendar');
  await page.screenshot({ path: out + '/j_datepick.png' });
  await dg.click('#datePop td[data-day="15"]');
  const dv = await dg.evaluate(() => document.getElementById('eDue').value);
  const now = new Date(); ok(dv == '15/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear() && await dg.evaluate(() => document.getElementById('datePop').style.display == 'none'), 'picking a day fills dd/mm/yyyy and closes: ' + dv);
  await dg.click('#eDue'); await dg.click('#datePop [data-dp="1"]'); await dg.click('#datePop [data-dp="today"]');
  ok(await dg.evaluate(() => document.getElementById('eDue').value) == String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear(), 'next month + Today button');
};
