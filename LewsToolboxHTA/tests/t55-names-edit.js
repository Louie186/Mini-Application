// Names: correct a name with the MIDP number + edit the revision, one file or many (bulk), no redraw while editing
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(f => f.path).filter(p => /^C:\\Ren\\/i.test(p)).sort());
  await page.evaluate(() => {
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    LT.saveJson(LT.dataPath('register.json'), { current: 'p1', projects: [{ id: 'p1', name: 'Tower' }] });
    const D = {}; ['10100', '10101', '10102', '10103'].forEach((n, i) => { const k = 'PRJ-KEO-T1-ZZ-DR-A-' + n; D[k] = { num: k, title: 'Plan ' + n, rev: i == 0 ? 'C03' : 'C02', inMidp: true }; });
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower', drawings: D, sets: [] });
    LT.saveJson(LT.dataPath('naming.json'), { last: 0, rules: [{ name: 'Project rule', sep: '-', revOptional: true, parts: [{ name: 'Project', kind: 'list', val: 'PRJ' }, { name: 'Orig', kind: 'letters', val: '3' }, { name: 'Vol', kind: 'any' }, { name: 'Lvl', kind: 'any' }, { name: 'Type', kind: 'list', val: 'DR,SH' }, { name: 'Role', kind: 'letters', val: '1' }, { name: 'Number', kind: 'digits', val: '5' }, { name: 'Rev', kind: 'rev' }] }] });
    // wrong originator (MIDP number fixes it), a fine name, two more fine ones for the bulk revision
    ['PRJ-XYZ-T1-ZZ-DR-A-10100-C01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10101-C01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10102-C01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10103-C01.pdf'].forEach(n => add('C:\\Ren\\' + n, 'X'));
  });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500);
  const c = page.frame({ url: /check\.html/ }); await c.evaluate(() => setView('naming')); await page.waitForTimeout(600);
  const nm = page.frame({ url: /naming\.html/ }); await nm.evaluate(() => { window.confirm = () => true; window.alert = m => { window.__al = m; }; });
  await nm.evaluate(() => ltReceive('open-folder', 'C:\\Ren')); await page.waitForTimeout(150);
  ok(await nm.evaluate(() => { const x = document.querySelector('[data-x="0"]'); return x && x.querySelector('[data-b]').value == 'PRJ-KEO-T1-ZZ-DR-A-10100' && x.querySelector('[data-r]').value == 'C01' && x.querySelector('.sref').innerText == 'MIDP' && /MIDP rev C03/.test(x.innerText) && x.querySelector('[data-t]').checked; }),
    'single: the wrong name gets the MIDP number, its own revision, ticked; a "MIDP rev C03" link');
  // single edit: click the MIDP revision, no redraw
  await nm.evaluate(() => { window.__tbl = document.querySelector('#res table'); });
  await nm.click('[data-mr="0"]'); await page.waitForTimeout(80);
  ok(await nm.evaluate(() => document.querySelector('[data-r="0"]').value == 'C03' && document.querySelector('#res table') === window.__tbl), 'single: MIDP rev -> C03 in place (no redraw)');
  // type a revision by hand
  await nm.fill('[data-r="0"]', 't1'); await nm.evaluate(() => { const i = document.querySelector('[data-r="0"]'); i.dispatchEvent(new Event('change', { bubbles: true })); });
  ok(await nm.evaluate(() => document.querySelector('[data-r="0"]').value == 'T1' && results[0].rev == 'T1'), 'single: typed "t1" stays T1 (only upper case, no extra 0)');
  // bulk: show everything, tick the 3 fine ones, set C02
  await nm.selectOption('#show', 'all'); await page.waitForTimeout(100);
  await nm.click('[data-t="1"]'); await nm.click('[data-t="3"]', { modifiers: ['Shift'] });
  ok(await nm.evaluate(() => $('nT').innerText == '4'), 'bulk: Shift+click ticks a range (4 ticked)');
  await nm.fill('#bkRev', 't2'); await nm.click('#bkSet');
  ok(await nm.evaluate(() => document.querySelector('[data-r="1"]').value == 'T2'), 'bulk: Set "t2" stays T2 (no extra 0)');
  await nm.fill('#bkRev', 'C02'); await nm.click('#bkSet');
  ok(await nm.evaluate(() => [1, 2, 3].every(i => document.querySelector('[data-r="' + i + '"]').value == 'C02') && document.querySelector('[data-r="0"]').value == 'C02'), 'bulk: Set C02 on every ticked file (as typed)');
  await nm.click('#bkUp');
  ok(await nm.evaluate(() => [1, 2, 3].every(i => document.querySelector('[data-r="' + i + '"]').value == 'C03')), 'bulk: Revision +1 -> C03');
  await nm.click('#bkMidR');
  ok(await nm.evaluate(() => document.querySelector('[data-r="0"]').value == 'C03' && document.querySelector('[data-r="1"]').value == 'C02'), 'bulk: Use MIDP revision');
  ok(await nm.evaluate(() => /Rename \(4\)/.test($('bRen').innerText)), 'Rename (4)');
  await page.screenshot({ path: out + '/names_edit.png' });
  await nm.click('#bRen'); await page.waitForTimeout(150);
  const files = await F();
  ok(files.join('|') == ['C:\\Ren\\PRJ-KEO-T1-ZZ-DR-A-10100-C03.pdf', 'C:\\Ren\\PRJ-KEO-T1-ZZ-DR-A-10101-C02.pdf', 'C:\\Ren\\PRJ-KEO-T1-ZZ-DR-A-10102-C02.pdf', 'C:\\Ren\\PRJ-KEO-T1-ZZ-DR-A-10103-C02.pdf'].join('|'), 'renamed: ' + files.join(', '));
  await nm.click('#bUndo'); await page.waitForTimeout(150);
  ok((await F()).includes('C:\\Ren\\PRJ-XYZ-T1-ZZ-DR-A-10100-C01.pdf'), 'Undo puts the old names back');
  // the automatic fix follows the rule's revision example: T1 -> one digit, P01 -> two
  ok(await nm.evaluate(() => { const r = JSON.parse(JSON.stringify(rule())); r.parts[r.parts.length - 1].val = 'T1'; const a = LT.nameFix('prj_keo_t1_zz_dr_a_10100_t1', r); r.parts[r.parts.length - 1].val = 'P01'; const b = LT.nameFix('prj_keo_t1_zz_dr_a_10100_p1', r); return a == 'PRJ-KEO-T1-ZZ-DR-A-10100-T1' && b == 'PRJ-KEO-T1-ZZ-DR-A-10100-P01'; }), 'automatic fix: rule example T1 keeps T1, P01 makes P1 -> P01');
  // source = one of My sets: only its drawings count
  await nm.evaluate(() => { const P = LT.readJson(LT.registerFile('p1')); P.sets = [{ id: 's1', name: 'Batch 1', keys: ['PRJ-KEO-T1-ZZ-DR-A-10101'] }]; LT.saveJson(LT.registerFile('p1'), P); setMatch({ kind: 'set', id: 's1' }); });
  ok(await nm.evaluate(() => /My set: Batch 1/.test($('bMatch').innerText) && /1 drawing/.test($('matchInfo').innerText) && !results[0].mid && results[1].mid && results[1].mid.rev == 'C02' && /Use set revision/.test($('bkMidR').innerText)), 'My set as the source: only its drawings match; buttons say "set"');
  // source = an Excel / CSV list I give
  await nm.evaluate(() => { const p = 'C:\\Lists\\Names.csv', fs = window.top.__mockFs || window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: 'Drawing No,Title,Revision\nPRJ-KEO-T1-ZZ-DR-A-10100,Plan,C07\n', time: Date.now() }; fs.dirs['c:\\lists'] = 'C:\\Lists'; setMatch({ kind: 'list', path: p }); });
  ok(await nm.evaluate(() => { const x = document.querySelector('[data-x="0"]'); return /List: Names.csv/.test($('bMatch').innerText) && x.querySelector('[data-b]').value == 'PRJ-KEO-T1-ZZ-DR-A-10100' && x.querySelector('.sref').innerText == 'list' && /list rev C07/.test(x.innerText) && /Number isn't as in the list/.test($('res').innerText); }),
    'Excel/CSV list as the source: the wrong name gets the list number, "list rev C07"');
  await page.screenshot({ path: out + '/names_list.png' });
  ok(await nm.evaluate(() => [...document.querySelectorAll('.fx')].every(x => x.offsetHeight < 34) && [...document.querySelectorAll('#res tr[data-f]')].every(r => r.offsetHeight < 44)), 'every row is one line');
};
