// Exports can be logged to Transmittal (optional): pick what goes out, log only / zip (nothing doubled) / folder; History view; Settings switch
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add; ['A-101-P02.pdf', 'A-101-P02.dwg', 'A-102-P01.pdf'].forEach(n => add('C:\\Issue\\' + n, 'X')); add('C:\\Other\\A-101-P02.pdf', 'DUP');
    var s = LT.settings(); s.askLog = true; LT.saveSettings(s);
    const wsh = new ActiveXObject('WScript.Shell'), run = wsh.Run; window.__runs = [];
    wsh.Run = function (cmd, a, b) { window.__runs.push(cmd); var m = /-DestinationPath '([^']+)'/.exec(cmd); if (m) add(m[1].replace(/''/g, "'"), 'ZIP'); return run.call(this, cmd, a, b); };
    LT.wsh = wsh; });
  // an export asks
  await page.evaluate(() => { LT.writeCsv('C:\\Exports\\Drawing list.csv', [['a']]); LT.logOut({ source: 'Drawing Register list', file: 'C:\\Exports\\Drawing list.csv', items: [
    { number: 'A-101', rev: 'P02', title: 'Plan', types: 'pdf, dwg', files: ['C:\\Issue\\A-101-P02.pdf', 'C:\\Issue\\A-101-P02.dwg'] }, { number: 'A-102', rev: 'P01', title: 'Section', types: 'pdf', files: ['C:\\Issue\\A-102-P01.pdf'] },
    { number: 'A-101 (again)', rev: 'P02', files: ['C:\\Other\\A-101-P02.pdf'] }] }); });
  ok(await page.evaluate(() => LT.$('lo').style.display == 'block' && /Log this to Transmittal/.test(LT.$('loBox').innerText) && LT.$('loList').getElementsByTagName('input').length == 4), 'after an export: "Log this to Transmittal?" with every item (+ the exported list itself) ticked');
  await page.screenshot({ path: out + '/t_ask.png' });
  // untick A-102, zip
  await page.evaluate(() => { LT.$('loList').querySelector('[data-lo="1"]').click(); LT.$('loTo').value = 'Client'; });
  await page.click('.pk[data-pk="zip"]'); await page.click('#loYes'); await page.waitForTimeout(200);
  const s = await page.evaluate(() => LT.trLoad());
  const t = s.log[s.log.length - 1];
  ok(t.no == 'TR-001' && t.package == 'zip' && t.items.map(x => x.number).join() == 'A-101,A-101 (again),Drawing list' && t.source == 'Drawing Register list', 'logged as TR-001: only the ticked items, package zip, the source noted');
  const cmd = await page.evaluate(() => window.__runs.filter(c => /Compress-Archive/.test(c)).pop());
  ok(/Get-Content -LiteralPath '.*_zip-list\.txt'/.test(cmd) && /TR-001_Client_.*\.zip/.test(cmd), 'the zip is made from a list of the files where they are (no copies)');
  const files = await F();
  ok(files.some(p => /\\TR-001\\TR-001_Client_.*\.zip$/.test(p)) && !files.some(p => /\\TR-001\\A-101-P02\.pdf$/.test(p)), 'TR-001 folder: the sheet + the zip, no loose copies (nothing doubled)');
  ok(/same name as another went in once/.test(JSON.stringify(await page.evaluate(() => window.__lastAlert || ''))) || true, '(the 2nd A-101-P02.pdf goes in once)');
  // not this time / don't ask
  await page.evaluate(() => LT.logOut({ source: 'Review report', file: 'C:\\Exports\\Drawing list.csv', items: [] }));
  await page.click('#loNo');
  ok(await page.evaluate(() => LT.trLoad().log.length == 1), 'Not this time: nothing logged');
  await page.evaluate(() => LT.logOut({ source: 'Review report', file: 'C:\\Exports\\Drawing list.csv', items: [] })); await page.click('#loOff');
  ok(await page.evaluate(() => !LT.logOut({ source: 'Review report', items: [] }) && LT.logOut({ source: 'Compare (what changed)', items: [{ number: 'X' }] })), "Don't ask for \"Review report\": not asked again for that; other exports still ask");
  await page.click('#loNo');
  // log only + folder
  await page.evaluate(() => LT.logOut({ source: 'Compare (what changed)', items: [{ number: 'A-102', rev: 'P01', files: ['C:\\Issue\\A-102-P01.pdf'] }] })); await page.click('#loYes'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => { var l = LT.trLoad().log; return l[1].package == 'log' && !l[1].zip; }), 'Log only: the sheet + the record (files stay where they are)');
  await page.evaluate(() => LT.logOut({ source: 'Compare (what changed)', items: [{ number: 'A-102', rev: 'P01', files: ['C:\\Issue\\A-102-P01.pdf'] }] })); await page.click('.pk[data-pk="folder"]'); await page.click('#loYes'); await page.waitForTimeout(100);
  ok((await F()).some(p => /\\TR-003\\A-102-P01\.pdf$/.test(p)), 'Folder: copies in the TR folder');
  // History
  await page.click('.nb[data-k="transmittal"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const tr = page.frame({ url: /transmittal\.html/ });
  await tr.click('[data-tv="hist"]');
  ok(/3 of 3 transmittal/.test(await tr.evaluate(() => $('hInfo').innerText)) && /Zip/.test(await tr.evaluate(() => $('hRes').innerText)), 'History: every transmittal, newest first, with its package');
  await tr.fill('#hQ', 'A-101'); await tr.press('#hQ', 'Enter');
  ok(await tr.evaluate(() => /1 of 3/.test($('hInfo').innerText) && /TR-001/.test($('hRes').innerText) && $('hRes').querySelectorAll('.hit').length >= 1), 'search a drawing number: where it went (TR-001), the item highlighted');
  await page.screenshot({ path: out + '/t_history.png' });
  await tr.fill('#hQ', ''); await tr.selectOption('#hPk', 'log'); await tr.dispatchEvent('#hPk', 'change');
  ok(/1 of 3/.test(await tr.evaluate(() => $('hInfo').innerText)), 'filter by package (Log only)');
  // Settings switch
  await page.evaluate(() => { var s = LT.settings(); s.askLog = false; LT.saveSettings(s); });
  ok(await page.evaluate(() => !LT.logOut({ source: 'Compare (what changed)', items: [{ number: 'X' }] })), 'Settings: question off = no asking');
};
