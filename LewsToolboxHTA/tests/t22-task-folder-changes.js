// Task folder: renamed in Explorer, saved again after adding files, old-style folders tidied, links really open
const fs = require('fs'), path = require('path');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const D = 'C:\\Jobs\\Roof kitchen', M = D + '\\Reference\\Backup and Ref';
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('C:\\In\\FF&E.pdf', 'FFE'); add('C:\\In\\Kitchen layout.dwg', 'DWG'); fs.dirs['c:\\jobs'] = 'C:\\Jobs';
    add('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'EXE');
    const wsh = new ActiveXObject('WScript.Shell'), run = wsh.Run; window.__runs = [];
    wsh.Run = function (cmd, a, b) { window.__runs.push(cmd); var m = /--print-to-pdf="([^"]+)"/.exec(cmd); if (m) add(m[1], '%PDF'); return run.call(this, cmd, a, b); };
    var orig = window.ActiveXObject; window.ActiveXObject = function (n) { return /WScript\.Shell/i.test(n) ? wsh : new orig(n); }; });
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  const sum = () => page.evaluate(M => window.__mockFs.files[(M + '\\Task Summary.html').toLowerCase()].text, M);
  await t.evaluate(D => { window.ActiveXObject = top.ActiveXObject; LT.wsh = new ActiveXObject('WScript.Shell');
    var x = blank(); x.title = 'Roof kitchen update'; addTask(x); save(); render(); openTF(x); $('tfWhere').value = 'C:\\Jobs'; $('tfName').value = 'Roof kitchen'; makeTF();
    var r = LT.tfAdd(tfTask.folder, 'Reference', ['C:\\In\\FF&E.pdf'], false); tfAfter(r, 'x'); closeTF();
    // a file reference in the task's own list too
    tfTask.refs.push({ kind: 'file', value: D + '\\Reference\\FF&E.pdf', label: '', send: 'copy' }); save(); }, D);
  ok(/FF%26E\.pdf/.test(await sum()), 'saved: the summary links FF&E.pdf (the & is encoded so the link works)');
  // 1. renamed in Explorer
  await page.evaluate(D => { const fs = window.__mockFs, a = (D + '\\Reference\\FF&E.pdf').toLowerCase(), f = fs.files[a]; delete fs.files[a]; f.path = D + '\\Reference\\FF&E_consolidated.pdf'; fs.files[f.path.toLowerCase()] = f; }, D);
  await t.evaluate(() => openTF(byCode('TL-001')));
  ok(await t.evaluate(() => /FF&E_consolidated\.pdf/.test($('tfDrop').innerText) && !/FF&E\.pdf/.test($('tfDrop').innerText)), 'renamed in Explorer -> the folder window shows FF&E_consolidated.pdf (read from the folder each time)');
  await t.evaluate(() => { $('tfUpd').click(); });
  const s1 = await sum();
  ok(/FF%26E_consolidated\.pdf/.test(s1) && !/FF%26E\.pdf"/.test(s1), 'Update summary: the new name and link, the old one is gone');
  await t.evaluate(() => { closeTF(); edit(byCode('TL-001')); });
  ok(await t.evaluate(() => /not found here any more/.test($('eRefs').innerText)), 'a reference that pointed to the old name says "not found here any more (renamed or moved?)"');
  await t.evaluate(() => { $('dlg').style.display = 'none'; });
  // 2. save, add another file, save again
  const runs0 = await page.evaluate(() => window.__runs.length);
  await t.evaluate(() => { openTF(byCode('TL-001')); tfShow('Output'); var r = LT.tfAdd(tfTask.folder, 'Output', ['C:\\In\\Kitchen layout.dwg'], false); tfAfter(r, 'x'); closeTF(); });
  const s2 = await sum();
  ok(/Kitchen%20layout\.dwg/.test(s2) && /FF%26E_consolidated\.pdf/.test(s2) && (await page.evaluate(() => window.__runs.length)) > runs0, 'added a file and closed: summary + PDF made again, with the new file and the earlier ones');
  ok(await page.evaluate(M => !!window.__mockFs.files[(M + '\\_task.backup.json').toLowerCase()], M), 'the previous _task.json is kept as _task.backup.json');
  // a PDF that's open in a viewer can't be replaced: says so
  await t.evaluate(M => { var del = LT.fso.DeleteFile; LT.fso.DeleteFile = function (p, f) { if (/\.pdf$/i.test(p)) throw new Error('Permission denied'); return del.call(this, p, f); }; openTF(byCode('TL-001')); $('tfUpd').click(); window.__msg = $('tfMsg').innerText; LT.fso.DeleteFile = del; }, M);
  ok(/PDF is open in a viewer/.test(await t.evaluate(() => window.__msg)), 'PDF open in a viewer: "close it, then Update summary again"');
  await t.evaluate(() => closeTF());
  // 3. a folder made the old way (files at the top) is tidied on the next save
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const O = 'C:\\Jobs\\Old task'; ['Reference', 'Incoming', 'Output'].forEach(s => fs.dirs[(O + '\\' + s).toLowerCase()] = O + '\\' + s);
    add(O + '\\_task.json', JSON.stringify({ kind: 'lt-task-folder', v: 1, id: 'old1', code: 'TL-050', title: 'Old task', notes: [] })); add(O + '\\Task Summary.html', 'old'); add(O + '\\Notes.txt', 'old'); });
  await t.evaluate(() => { top.__nextFolder = 'C:\\Jobs\\Old task'; window.confirm = () => true; openTaskFolder(); tfDirty = true; closeTF(); });
  const ofs = await page.evaluate(() => Object.keys(window.__mockFs.files).filter(k => k.indexOf('c:\\jobs\\old task') == 0));
  ok(ofs.some(k => /reference\\backup and ref\\_task\.json$/.test(k)) && !ofs.some(k => /old task\\(_task\.json|task summary\.html|notes\.txt)$/.test(k)), 'an older task folder: recognised, and its summary / notes / _task.json moved into Reference\\Backup and Ref');
  // 4. the links really open the files: same folders on a real disk, in a real browser
  const R = '/tmp/claude-0/tfreal/Roof kitchen'; fs.rmSync('/tmp/claude-0/tfreal', { recursive: true, force: true });
  for (const p of ['Reference/Backup and Ref', 'Output']) fs.mkdirSync(R + '/' + p, { recursive: true });
  fs.writeFileSync(R + '/Reference/FF&E_consolidated.pdf', 'x'); fs.writeFileSync(R + '/Output/Kitchen layout.dwg', 'x');
  fs.writeFileSync(R + '/Reference/Backup and Ref/Task Summary.html', s2.replace(/^\ufeff/, ''));
  const pg = await page.context().newPage(); await pg.goto('file://' + encodeURI(R + '/Reference/Backup and Ref/Task Summary.html'));
  const targets = await pg.evaluate(() => [...document.querySelectorAll('a')].filter(a => /^file:/.test(a.href)).map(a => decodeURIComponent(a.href.replace('file://', ''))));
  await pg.close();
  ok(targets.length == 2 && targets.every(p => fs.existsSync(p)), 'every file link in the summary opens a real file: ' + targets.map(p => path.basename(p)).join(', '));
  ok(/FF&amp;E\.pdf &nbsp;&#9888; not found \(renamed or moved\?\)/.test(s2), 'the old FF&E.pdf reference is flagged "not found (renamed or moved?)" instead of a broken link');
};
