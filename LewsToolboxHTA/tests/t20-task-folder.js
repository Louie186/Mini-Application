// Task folders: make (Reference / Incoming / Output), add (copy / move), screenshot, notes, summary HTML + PDF, recognise, Delegate
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('C:\\Downloads\\A-501 Roof plan.pdf', 'PDF'); add('C:\\Downloads\\Kitchen.dwg', 'DWG'); add('C:\\Mail\\Reply from Sam.msg', 'MSG'); add('C:\\Other\\A-501 Roof plan.pdf', 'PDF2');
    fs.dirs['c:\\projects\\tower 1\\tasks'] = 'C:\\Projects\\Tower 1\\Tasks';
    add('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'EXE');   // a pretend Edge, to print the PDF
    // pretend Edge and PowerShell: write the file they would make
    const wsh = new ActiveXObject('WScript.Shell'), run = wsh.Run; window.__runs = [];
    wsh.Run = function (cmd, a, b) { window.__runs.push(cmd); var m = /--print-to-pdf="([^"]+)"/.exec(cmd); if (m) add(m[1], '%PDF'); m = /\$i\.Save\('([^']+)'/.exec(cmd); if (m && window.__clip) add(m[1].replace(/''/g, "'"), 'PNG'); return run.call(this, cmd, a, b); };
    var orig = window.ActiveXObject; window.ActiveXObject = function (n) { return /WScript\.Shell/i.test(n) ? wsh : new orig(n); };
    document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.ActiveXObject = window.ActiveXObject; } catch (e) { } });
  });
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.evaluate(() => { window.ActiveXObject = top.ActiveXObject; LT.wsh = new ActiveXObject('WScript.Shell');
    var x = blank(); x.title = 'Roof kitchen update'; x.project = 'Tower 1'; x.who = 'MEP Team'; x.due = LT.today(); x.notes = 'Update the roof kitchen layout to the new equipment list.';
    x.subs = [{ code: '', title: 'Check extract duct route', who: 'Ana', due: '', status: 'Done', refs: [] }, { code: '', title: 'Update RCP', who: 'Ben', due: '', status: 'To do', refs: [] }]; x.refs = [{ kind: 'link', value: 'https://acc.example.com/roof', label: 'ACC model', send: 'copy' }];
    addTask(x); save(); render(); openTF(x); });
  ok(await t.evaluate(() => $('tf').style.display == 'block' && $('tfMake').style.display == '' && $('tfName').value == 'TL-001 Roof kitchen update'), 'no folder yet: asks where + name (suggested, you can type your own)');
  await t.evaluate(() => { top.__nextFolder = 'C:\\Projects\\Tower 1\\Tasks'; }); await t.click('#tfBrowse');
  await t.fill('#tfName', 'Roof kitchen update'); await t.click('#tfMakeB'); await page.waitForTimeout(200);
  const D = 'C:\\Projects\\Tower 1\\Tasks\\Roof kitchen update';
  ok(await t.evaluate(D => byCode('TL-001').folder == D && ['Reference', 'Incoming', 'Output'].every(s => LT.fso.FolderExists(D + '\\' + s)), D), 'folder made with Reference, Incoming, Output (your typed name)');
  let files = await F();
  ok(files.includes(D + '\\_task.json') && files.includes(D + '\\Task Summary.html') && files.includes(D + '\\Task Summary.pdf') && files.includes(D + '\\Notes.txt'), '_task.json, Notes.txt, Task Summary.html and .pdf made');
  ok(await page.evaluate(() => window.__runs.some(c => /msedge\.exe" --headless .*--print-to-pdf=".*Task Summary\.pdf" "file:\/\/\/C:\/Projects\/Tower%201/.test(c))), 'PDF printed by Edge without a window (links kept)');
  ok(await t.evaluate(() => $('tfBody').style.display == '' && /Reference/.test($('tfTabs').innerText) && /Notes/.test($('tfTabs').innerText)), 'the folder window: Reference / Incoming / Output / Notes');
  // add files: copy, then move, and the same name twice
  await t.evaluate(() => { var r = LT.tfAdd(tfTask.folder, 'Reference', ['C:\\Downloads\\A-501 Roof plan.pdf', 'C:\\Other\\A-501 Roof plan.pdf'], false); tfAfter(r, 'x'); });
  await t.evaluate(() => { tfShow('Incoming'); $('tfMove').click(); var r = LT.tfAdd(tfTask.folder, 'Incoming', ['C:\\Mail\\Reply from Sam.msg'], $('tfMove').checked); tfAfter(r, 'x'); });
  files = await F();
  ok(files.includes(D + '\\Reference\\A-501 Roof plan.pdf') && files.includes(D + '\\Reference\\A-501 Roof plan (2).pdf') && files.includes('C:\\Downloads\\A-501 Roof plan.pdf'), 'copy: both "A-501 Roof plan.pdf" kept, the second as (2); originals stay');
  ok(files.includes(D + '\\Incoming\\Reply from Sam.msg') && !files.includes('C:\\Mail\\Reply from Sam.msg') && await t.evaluate(() => LT.settings().tfMove === true), 'move: the email moved into Incoming (Move is remembered)');
  // screenshot from the clipboard
  await t.evaluate(() => { tfShow('Reference'); top.__clip = 1; window.__clip = 1; $('tfShot').click(); });
  files = await F();
  ok(files.some(p => p.indexOf(D + '\\Reference\\Screenshot ') == 0 && /\.png$/.test(p)) && /Screenshot saved/.test(await t.evaluate(() => $('tfMsg').innerText)), 'Paste screenshot: saved as Reference\\Screenshot <date time>.png');
  await t.evaluate(() => { window.__clip = 0; top.__clip = 0; $('tfShot').click(); });
  ok(/No picture on the clipboard/.test(await t.evaluate(() => $('tfMsg').innerText)), 'no picture on the clipboard: says so');
  // notes
  await t.evaluate(() => tfShow('Notes')); await t.fill('#tfNote', 'Sam (Teams): extract fan moves 1.2 m east.'); await t.click('#tfAddN');
  ok(await t.evaluate(() => byCode('TL-001').fnotes.length == 1 && /extract fan/.test($('tfNList').innerText)), 'note added with date and time');
  await t.evaluate(() => tfShow('Reference'));
  await page.screenshot({ path: out + '/r_task_folder.png' });
  await t.click('#tfClose'); await page.waitForTimeout(200);
  // the summary
  const sum = await page.evaluate(D => window.__mockFs.files[(D + '\\Task Summary.html').toLowerCase()].text, D);
  ok(/href="Reference\/A-501%20Roof%20plan\.pdf"/.test(sum) && /href="Incoming\/Reply%20from%20Sam\.msg"/.test(sum) && /extract fan moves/.test(sum) && /1 of 2 done/.test(sum) && /ACC model/.test(sum), 'summary: links to the files, checklist 1 of 2, references, notes');
  const notes = await page.evaluate(D => window.__mockFs.files[(D + '\\Notes.txt').toLowerCase()].text, D);
  ok(/extract fan moves 1\.2 m east/.test(notes), 'Notes.txt has the note');
  // look at the summary page in a real browser
  const html = sum.replace(/^\ufeff/, ''); fs.writeFileSync('/tmp/claude-0/Task Summary.html', html);
  const pg = await page.context().newPage(); await pg.setViewportSize({ width: 900, height: 1200 }); await pg.goto('file:///tmp/claude-0/Task%20Summary.html'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: out + '/r_summary.png', fullPage: true }); await pg.close();
  ok(await t.evaluate(() => /folder/.test($('main').innerText)), 'the task shows a 📁 folder chip in the list');
  // recognise: a folder whose task isn't here (e.g. made on another PC)
  await t.evaluate(() => { data.tasks = []; save(); render(); top.__nextFolder = 'C:\\Projects\\Tower 1\\Tasks\\Roof kitchen update'; window.confirm = () => true; });
  await t.click('#bOpenTF'); await page.waitForTimeout(200);
  ok(await t.evaluate(() => data.tasks.length == 1 && data.tasks[0].title == 'Roof kitchen update' && data.tasks[0].folder && data.tasks[0].fnotes.length == 1 && data.tasks[0].subs.length == 2 && $('tf').style.display == 'block'), 'Open a task folder: not in Tasks yet -> added back from _task.json (checklist, notes) and opened');
  await t.click('#tfClose');
  await t.evaluate(() => { top.__nextFolder = 'C:\\Projects\\Tower 1\\Tasks\\Roof kitchen update'; }); await t.click('#bOpenTF'); await page.waitForTimeout(150);
  ok(await t.evaluate(() => data.tasks.length == 1), 'the same folder again: no second copy');
  await t.click('#tfClose');
  // delegate: the Reference files go along
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(400); await page.mouse.move(900, 600);
  const d = page.frame({ url: /delegate\.html/ });
  const refs = await d.evaluate(() => { var L = JSON.parse(JSON.stringify(LT.readJson(LT.dataPath('tracker.json')).tasks[0])); var t = fromLog(L); $('send').style.display = 'none'; return t.refs.map(r => r.kind + ':' + LT.refBase(r.value)).join(' | '); });
  ok(/file:A-501 Roof plan\.pdf/.test(refs) && /file:A-501 Roof plan \(2\)\.pdf/.test(refs) && /Screenshot/.test(refs) && !/Reply from Sam/.test(refs) && /link:/.test(refs), 'delegating: the Reference files become references (not Incoming): ' + refs);
};
