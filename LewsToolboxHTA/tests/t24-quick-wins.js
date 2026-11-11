// Quick wins: Ctrl+V into a task (snip or copied files), Copy as email, Ctrl+K search, reminders, chase-up messages
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  // pretend Windows: files on disk, PowerShell clipboard (window.__clip = 'img' | ['C:\\...'] | 0), Outlook
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add; add('C:\\Downloads\\RFI-021 reply.pdf', 'PDF'); add('C:\\Downloads\\Kitchen.dwg', 'DWG'); fs.dirs['c:\\jobs'] = 'C:\\Jobs';
    const wsh = new ActiveXObject('WScript.Shell'), run = wsh.Run; window.__runs = [];
    wsh.Run = function (cmd, a, b) { window.__runs.push(cmd); var c = top.__clip, m;
      if (c == 'img' && (m = /\$i\.Save\('([^']+)'/.exec(cmd))) add(m[1].replace(/''/g, "'"), 'PNG');
      if (c && c.join && (m = /WriteAllLines\('([^']+)'/.exec(cmd))) add(m[1].replace(/''/g, "'"), c.join('\r\n'));
      return run.call(this, cmd, a, b); };
    window.__mails = [];
    var orig = window.ActiveXObject; window.ActiveXObject = function (n) { if (/WScript\.Shell/i.test(n)) return wsh; if (/Outlook/i.test(n)) return { CreateItem: function () { var m = { Display: function () { top.__mails.push({ to: m.To, subject: m.Subject, body: m.Body }); } }; return m; } }; return new orig(n); };
    document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.ActiveXObject = window.ActiveXObject; } catch (e) { } }); });
  await page.waitForTimeout(1500); await page.evaluate(() => { LT.$('remind').style.display = 'none'; });   // (the morning card from start-up)
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.evaluate(() => { window.ActiveXObject = top.ActiveXObject; LT.wsh = new ActiveXObject('WScript.Shell');
    var x = blank(); x.title = 'Roof kitchen update'; x.project = 'Tower 1'; x.who = 'Ben'; x.due = LT.today(); x.notes = 'Update the layout to the new equipment list.';
    x.subs = [{ code: '', title: 'Check duct route', who: 'Ana', due: '', status: 'Done', refs: [] }]; x.refs = [{ kind: 'link', value: 'https://acc.example.com/roof', label: 'ACC model', send: 'copy' }];
    addTask(x); var y = blank(); y.title = 'Old late thing'; y.due = LT.iso(new Date(Date.now() - 3 * 864e5)); addTask(y); data.view = 'open'; save(); render(); });
  // 1. Ctrl+V on a task with no folder: offers to make one, then pastes into Reference
  await page.evaluate(() => { top.__clip = 'img'; top.__nextFolder = 'C:\\Jobs'; });
  await t.click('#main tr[data-i] td.t >> text=Roof kitchen update');
  ok(await t.evaluate(() => picked && picked.code == 'TL-001' && $('main').querySelectorAll('tr.pick').length == 1 && /Roof kitchen/.test($('main').querySelector('tr.pick').innerText)), 'click a task: it is picked (highlighted)');
  await t.evaluate(() => { window.confirm = () => true; });
  await page.keyboard.press('Control+v'); await page.waitForTimeout(200);
  ok(await t.evaluate(() => $('tf').style.display == 'block' && $('tfMake').style.display == ''), 'no folder yet: asks to make the task folder first');
  await t.click('#tfBrowse'); await t.click('#tfMakeB'); await page.waitForTimeout(200);
  const D = 'C:\\Jobs\\TL-001 Roof kitchen update';
  let files = await F();
  ok(files.some(p => p.indexOf(D + '\\Reference\\Screenshot ') == 0), 'folder made, then the snip is saved in Reference straight away');
  await t.click('#tfClose');
  // 2. copied files (Ctrl+C in Explorer) -> Ctrl+V on the task
  await page.evaluate(() => { top.__clip = ['C:\\Downloads\\RFI-021 reply.pdf', 'C:\\Downloads\\Kitchen.dwg']; });
  await t.click('#main tr[data-i] td.t >> text=Roof kitchen update'); await page.keyboard.press('Control+v'); await page.waitForTimeout(200);
  files = await F();
  ok(files.includes(D + '\\Reference\\RFI-021 reply.pdf') && files.includes(D + '\\Reference\\Kitchen.dwg') && files.includes('C:\\Downloads\\Kitchen.dwg'), 'copied files go into Reference (originals stay)');
  ok(/2 file\(s\) copied into TL-001/.test(await t.evaluate(() => $('toast').innerText)), 'toast: 2 file(s) copied into TL-001');
  // nothing on the clipboard
  await page.evaluate(() => { top.__clip = 0; }); let msg = '';
  await t.evaluate(() => { window.__al = ''; window.alert = m => { window.__al = m; }; }); await page.keyboard.press('Control+v'); msg = await t.evaluate(() => window.__al);
  ok(/Nothing to paste/.test(msg), 'empty clipboard: says how to copy first');
  // typing in a box: Ctrl+V is the normal paste (not grabbed)
  await page.evaluate(() => { top.__clip = 'img'; }); const n0 = (await F()).length;
  await t.click('#search'); await page.keyboard.press('Control+v'); await page.waitForTimeout(100);
  const nf = await F(); if (nf.length != n0) console.log('   new: ' + nf.slice(n0).join(', '));
  ok(nf.length == n0, 'Ctrl+V in a text box is left alone');
  // in the task folder window: into the folder you are looking at
  await t.evaluate(() => { openTF(byCode('TL-001')); tfShow('Incoming'); }); await t.click('#tfPath'); await page.keyboard.press('Control+v'); await page.waitForTimeout(100);
  ok((await F()).some(p => p.indexOf(D + '\\Incoming\\Screenshot ') == 0), 'task folder window: Ctrl+V into the subfolder shown (Incoming)');
  await t.click('#tfClose');
  // the Paste button in the task window
  await t.evaluate(() => { edit(byCode('TL-001')); }); await t.click('#ePaste'); await page.waitForTimeout(100);
  ok((await F()).filter(p => p.indexOf(D + '\\Reference\\Screenshot ') == 0).length == 2, 'task window: Paste screenshot / files button');
  // 5. copy as email + Outlook draft
  const em = await t.evaluate(() => emailText(byCode('TL-001')));
  ok(/^TL-001 Roof kitchen update \(due /.test(em.subject) && /Hi Ben/.test(em.body) && /\[x\] TL-001\.1 Check duct route \(Ana\)/.test(em.body) && /ACC model/.test(em.body) && /Task folder: C:\\Jobs\\TL-001 Roof kitchen update/.test(em.body) && /Reference 4/.test(em.body), 'Copy as email: subject, greeting, checklist, references, task folder');
  // 3. Ctrl+K search
  await page.keyboard.press('Control+k'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => LT.$('qs').style.display == 'block'), 'Ctrl+K (from inside a tab) opens the search');
  await page.keyboard.type('kitchen'); await page.waitForTimeout(100);
  const res = await page.evaluate(() => LT.$('qsRes').innerText);
  ok(/Task\s*TL-001\s*Roof kitchen update/.test(res) && /File\s*Kitchen\.dwg/.test(res), 'finds the task and the file in its folder');
  await page.screenshot({ path: out + '/q_search.png' });
  await page.keyboard.press('Escape'); await t.evaluate(() => { $('dlg').style.display = 'none'; data.view = 'today'; render(); });
  await page.keyboard.press('Control+k'); await page.keyboard.type('TL-002'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await t.evaluate(() => $('dlg').style.display == 'block' && $('eTitle').value == 'Old late thing'), 'Enter opens the task (TL-002) in Tasks');
  await t.evaluate(() => { $('dlg').style.display = 'none'; });
  // 8. Delegate: chase up
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const d = page.frame({ url: /delegate\.html/ });
  await d.evaluate(() => { window.ActiveXObject = top.ActiveXObject; var ago = n => LT.iso(new Date(Date.now() - n * 864e5));
    data.groups = [{ name: 'MEP Team', lead: 'Sam', members: ['Ana', 'Ben'] }];
    data.tasks.push({ id: 'a', code: 'T001', title: 'L16 ceiling coordination', who: 'MEP Team', due: ago(1), status: 'In progress', history: [], refs: [], subs: [
      { id: 's1', code: 'T001.1', title: 'Doors', who: 'Ana', due: ago(2), status: 'In progress' }, { id: 's2', code: 'T001.2', title: 'Windows', who: 'Ben', due: '', status: 'Completed' }] });
    data.tasks.push({ id: 'b', code: 'T002', title: 'Door schedule', who: 'Kim', due: ago(4), status: 'Not started', history: [], refs: [], subs: [] });
    data.tasks.push({ id: 'c', code: 'T003', title: 'Stair sections', who: 'Kim', due: LT.iso(new Date(Date.now() + 2 * 864e5)), status: 'Not started', history: [], refs: [], subs: [] });
    data.project = 'Tower 1'; save(); render(); });
  await d.click('#bChase'); await page.waitForTimeout(100);
  let cl = await d.evaluate(() => chaseList.map(p => p.who + ':' + p.late.map(x => x.code).join('+') + '/' + p.soon.length).join(' '));
  ok(cl == 'Kim:T002/0 Sam:T001.1/0', 'late work per person, group work to the lead: ' + cl);
  const msgSam = await d.evaluate(() => $('cht1').value);
  ok(/^Hi Sam,/.test(msgSam) && /T001\.1  Doors \(Ana\) – was due .* \(2 days late\)   \[T001 L16 ceiling coordination\]/.test(msgSam) && !/Windows/.test(msgSam), 'Sam\'s message lists Doors (Ana), 2 days late; not the finished item');
  await d.click('#cSoon'); await page.waitForTimeout(100);
  cl = await d.evaluate(() => chaseList.map(p => p.who + ':' + p.late.length + '/' + p.soon.map(x => x.code).join('+')).join(' '));
  ok(cl == 'Kim:1/T003 Sam:1/', '"Also due in the next 3 days" adds T003 for Kim: ' + cl);
  ok(/A quick reminder|And coming up soon:/.test(await d.evaluate(() => $('cht0').value)), 'due-soon part of the message');
  await page.screenshot({ path: out + '/q_chase.png' });
  await d.click('#cLead'); cl = await d.evaluate(() => chaseList.map(p => p.who).join(' '));
  ok(/Ana/.test(cl) && !/Sam/.test(cl), 'group lead off: Ana is chased directly');
  await d.click('#cLead');
  await d.click('[data-cm="0"]'); await page.waitForTimeout(100);
  const mail = await page.evaluate(() => top.__mails[0]);
  ok(mail && mail.to == 'Kim' && /Quick check-in: 1 late, 1 due soon – Tower 1/.test(mail.subject) && /Door schedule/.test(mail.body), 'Email: Outlook draft to Kim with subject + message');
  ok(await d.evaluate(() => /Chased up Kim \(email\)/.test(findTask('T002').history.join()) && /Chased up Kim/.test(findTask('T003').history.join())), 'noted on the task history');
  await d.click('#cClose');
  // 4. reminder on opening (once a day)
  await page.evaluate(() => { var s = LT.settings(); delete s.remindOn; LT.saveSettings(s); });
  ok(await page.evaluate(() => reminders(false)), 'reminder shows on the first open of the day');
  const rm = await page.evaluate(() => LT.$('remind').innerText);
  console.log('   ' + rm.replace(/\n/g, ' | '));
  ok(/1 of your tasks due today/.test(rm) && /1 of your tasks late/.test(rm) && /Kim: 1 late \(T002\)/.test(rm) && /Sam: 1 late \(T001\.1\)/.test(rm) && /Chase up \(2\)/.test(rm), 'says: due today, late, who on the team is late');
  await page.screenshot({ path: out + '/q_remind.png' });
  ok(await page.evaluate(() => !reminders(false)), 'not again the same day');
  await page.click('#rChase'); await page.waitForTimeout(400);
  ok(await d.evaluate(() => $('chase').style.display == 'block'), 'Chase up button opens Delegate > Chase up');
};
