// The team puts the link to their output in the HTML task pack / Excel sheet; it comes back with the reply into Delegate > Output
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const fs = require('fs');
  await page.evaluate(() => { window.__excel = 1; const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add;
    LT.saveJson(LT.dataPath('delegate.json'), { seq: 1, project: 'Tower 1', issued: [], imports: [], groups: [], tasks: [
      { id: 't1', code: 'T001', title: 'Level 3 GA', who: 'Sam', due: '', status: 'Not started', history: [], subs: [{ id: 's1', code: 'T001.1', title: 'Doors', who: 'Sam', status: 'In progress', outputs: [{ kind: 'link', path: 'https://acc.autodesk.com/old', at: LT.today() }] }, { id: 's2', code: 'T001.2', title: 'Windows', who: 'Sam', status: 'Not started' }] }] }); });
  await page.click('.nb[data-k="delegate"]'); await page.mouse.move(900, 650); await page.waitForTimeout(700);
  const d = page.frame({ url: /delegate\.html/ });
  // ---------- HTML pack ----------
  await d.evaluate(() => { LT.mkdirs('C:\\Out'); buildPack('C:\\Out\\Tasks_Sam.html', data.tasks, 'Tower 1', 'Lew', 'Sam', 'Sam', 'X1', [], {}); });
  fs.writeFileSync('/tmp/claude-0/pack-out.html', await page.evaluate(() => window.__mockFs.files['c:\\out\\tasks_sam.html'].text));
  const pg = await page.context().newPage(); const perr = []; pg.on('pageerror', e => perr.push(e.message));
  await pg.goto('file:///tmp/claude-0/pack-out.html'); await pg.waitForTimeout(700);
  ok(perr.length == 0 && await pg.evaluate(() => document.querySelectorAll('[data-outopen]').length == 2), 'the HTML pack: a 🔗 button on every item (your output)');
  ok(await pg.evaluate(() => /already received: https:\/\/acc\.autodesk\.com\/old/.test(document.body.innerText)), 'it shows what you already received for an item');
  await pg.click('[data-outopen="c:T001.2"]');
  await pg.fill('[data-out="c:T001.2"]', 'https://we.tl/t-AbC123\nC:\\Shared\\Windows-P01.pdf\nWindows schedule.xlsx');
  await pg.click('[data-outopen="c:T001.2"]'); await pg.waitForTimeout(100);
  const outTxt = await pg.evaluate(() => [].map.call(document.querySelectorAll('.outs'), x => x.innerText).join(' | ')), hrefs = await pg.evaluate(() => [].map.call(document.querySelectorAll('.outs a'), a => a.getAttribute('href')));
  ok(/Your output:/.test(outTxt) && hrefs.includes('https://we.tl/t-AbC123') && hrefs.includes('file:///C:/Shared/Windows-P01.pdf'), 'their output shows under the item, clickable (WeTransfer link, file path)');
  await pg.screenshot({ path: out + '/o_pack.png' });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act="reply"]')]);
  const reply = fs.readFileSync(await dl.path(), 'utf8'); await pg.close();
  // the reply saved from the email next to the file they attached
  await page.evaluate(r => { window.__add('C:\\Mail\\Reply_Sam.txt', r); window.__add('C:\\Mail\\Windows schedule.xlsx', 'X'); }, reply);
  await d.evaluate(() => { window.confirm = () => true; window.alert = () => {}; var r = readFile('C:\\Mail\\Reply_Sam.txt'); window.__n = applyReplies([r]); });
  const o = await d.evaluate(() => findTask('T001').subs[1].outputs.map(x => x.kind + ':' + x.path).join(' | '));
  ok(o == 'link:https://we.tl/t-AbC123 | file:C:\\Shared\\Windows-P01.pdf | file:C:\\Mail\\Windows schedule.xlsx', 'Load the reply: the outputs go into T001.2 > Output (a file name is found next to the reply) (' + o + ')');
  await d.evaluate(() => { openOut(findTask('T001'), findTask('T001').subs[1]); });
  ok(await d.evaluate(() => /we\.tl/.test($('oList').innerText) && /C:\\Mail/.test($('oList').innerText) && /C:\\Shared/.test($('oList').innerText)), 'Delegate > Output lists them (link + per folder), click to open');
  await page.screenshot({ path: out + '/o_delegate.png' });
  await d.evaluate(() => $('odlg').style.display = 'none');
  // a name that isn't next to the reply stays as a name
  ok(await d.evaluate(() => { var x = newOuts({}, ['Only a name.pdf'], 'C:\\Mail'); return x.length == 1 && x[0].kind == 'name'; }), 'a file name not found yet is kept as a name (shown: "in their email / WeTransfer")');
  // ---------- Excel ----------
  await d.evaluate(() => { buildPlan('C:\\Out\\Tasks_Sam.xlsx', data.tasks, 'Tower 1', 'Lew', 'Sam', 'X2', []); });
  const wb = await page.evaluate(() => JSON.parse(window.__mockFs.files['c:\\out\\tasks_sam.xlsx'].text.substring(6)));
  const c = wb[0].cells, col10 = Object.entries(c).filter(([k]) => k.endsWith(',10')).map(([k, v]) => v.show);
  ok(col10[0] == 'Output link' && col10.some(v => /we\.tl/.test(v)), 'Excel task sheet: an "Output link" column (yellow), with what was already received');
  ok(await d.evaluate(() => { var o = outList('https://acc.autodesk.com/a\nC:\\X\\b.pdf'); return o.length == 2; }), 'the Output link cell is read back from the Excel reply (one per line)');
};
