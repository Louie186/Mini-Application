// Batch C: Team Board in a shared folder - publish, task folders + reference copies, add a task later (new or under one), NEW marks, replies via _Replies
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  const S = 'C:\\Share\\MEP';
  await page.evaluate(S => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add; add('C:\\Refs\\Markup.pdf', 'PDF'); add('C:\\Refs\\Door schedule.xlsx', 'XLS'); fs.dirs[S.toLowerCase()] = S; }, S);
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const d = page.frame({ url: /delegate\.html/ });
  await d.evaluate(() => { var ago = n => LT.iso(new Date(Date.now() - n * 864e5));
    data.groups = [{ name: 'MEP Team', lead: 'Sam', members: ['Ana', 'Ben'] }];
    data.tasks = [{ id: 'a', code: 'T001', title: 'L16 ceiling coordination', who: 'MEP Team', group: 'MEP Team', due: LT.iso(new Date(Date.now() + 5 * 864e5)), status: 'Not started', notes: 'Check services against the RCP', history: [], refs: [{ kind: 'file', value: 'C:\\Refs\\Markup.pdf', label: '', send: 'copy' }, { kind: 'link', value: 'https://acc.example.com/m', label: 'ACC model' }],
      subs: [{ id: 's1', code: 'T001.1', title: 'Doors', who: 'Ana', due: '', status: 'Not started', refs: [] }, { id: 's2', code: 'T001.2', title: 'Windows', who: 'Ben', due: '', status: 'Not started', refs: [] }] }];
    data.seq = 1; save(); view = 'team'; render(); });
  // set the team folder in the group dialog
  await d.dblclick('#main tr[data-r="0"] td >> text=MEP Team');
  await d.evaluate(S => { top.__nextFolder = S; }, S); await d.click('#gBrowse'); await d.click('#gOk'); await page.waitForTimeout(300);
  let files = await F();
  const B = S + '\\Team Board - MEP Team.html', T1 = S + '\\T001 L16 ceiling coordination';
  ok(files.includes(B) && files.includes(T1 + '\\Reference\\Markup.pdf') && await d.evaluate(T1 => LT.fso.FolderExists(T1 + '\\Output'), T1) && files.includes(S + '\\_board.json') && files.includes(S + '\\How to use the Team Board.txt') && await d.evaluate(S => LT.fso.FolderExists(S + '\\_Replies'), S),
    'team folder set: board page, T001 folder (Reference with the copied markup, Output), _Replies, how-to');
  ok(/Update board/.test(await d.evaluate(() => $('main').innerText)), 'Team & groups shows the board: Update board / Open');
  await page.screenshot({ path: out + '/c_groups.png' });
  // task 6 from Tasks: as an item under T001
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.evaluate(() => { var x = blank(); x.title = 'Door hardware check'; x.who = 'MEP Team'; x.notes = 'Use the new schedule'; x.refs = [{ kind: 'file', value: 'C:\\Refs\\Door schedule.xlsx', label: '', send: 'copy' }]; addTask(x); save(); render(); });
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(400); await page.mouse.move(900, 600);
  await d.click('#bFrom'); await page.waitForTimeout(100); await d.click('#menu .mi >> text=Door hardware check'); await page.waitForTimeout(100);
  ok(/already doing 1 task/.test(await d.evaluate(() => $('menu').innerText)), 'the group already has tasks: asks "a new task, or an item under T001?"');
  await d.click('#menu .mi >> text=An item under'); await page.waitForTimeout(300);
  ok(await d.evaluate(() => { var s = findTask('T001').subs[2]; return s && s.code == 'T001.3' && s.title == 'Door hardware check' && s.log == 'TL-001' && s.refs.length == 1; }), 'added as T001.3 under T001 (with its reference, linked to TL-001)');
  files = await F();
  ok(files.includes(T1 + '\\Reference\\Door schedule.xlsx'), 'its file is copied into T001\\Reference on the board');
  ok(await page.evaluate(() => { var f = LT.readJson(LT.dataPath('delegate-feed.json'), []); return f.some(x => x.log == 'TL-001' && x.progress == '0/1 done'); }), 'Tasks hears about it (TL-001 → T001.3)');
  // a whole new task too
  await d.evaluate(() => { fromLog({ code: 'TL-009', title: 'Riser sections', who: 'MEP Team', due: '', notes: '', refs: [], subs: [] }); $('send').style.display = 'none'; });
  files = await F();
  ok(await d.evaluate(S => LT.fso.FolderExists(S + '\\T002 Riser sections\\Reference'), S), 'a new task T002 gets its own folder on the board');
  // the board page itself
  const html = await page.evaluate(B => window.__mockFs.files[B.toLowerCase()].text, B);
  fs.mkdirSync('/tmp/claude-0/board', { recursive: true }); fs.writeFileSync('/tmp/claude-0/board/Team Board.html', html);
  const pg = await page.context().newPage(); await pg.setViewportSize({ width: 900, height: 900 }); await pg.goto('file:///tmp/claude-0/board/Team%20Board.html'); await pg.waitForTimeout(400);
  const txt = await pg.evaluate(() => document.body.innerText);
  ok(/Team Board/.test(txt) && /_Replies/.test(txt) && /L16 ceiling coordination/.test(txt) && /Riser sections/.test(txt), 'board page: banner, tasks');
  ok(await pg.evaluate(() => { const c = [...document.querySelectorAll('.card')]; const t2 = c.find(x => /Riser sections/.test(x.innerText)), t1 = c.find(x => /L16 ceiling/.test(x.innerText)); return /NEW/.test(t2.querySelector('.ch').innerText) && !/NEW/.test(t1.querySelector('.ch').innerText) && /Door hardware check\s*NEW/.test(t1.innerText); }), 'NEW on the new task T002 and the new item T001.3 (not on what they had)');
  ok(await pg.evaluate(() => [...document.querySelectorAll('.refs a')].some(a => /T001%20L16%20ceiling%20coordination\/Reference\/Markup\.pdf$/.test(a.getAttribute('href'))) && [...document.querySelectorAll('.refs a')].some(a => /Task folder/.test(a.innerText))), 'references link into the task folder next to the page (and "Task folder")');
  await pg.screenshot({ path: out + '/c_board.png', fullPage: true }); await pg.close();
  // a reply saved into _Replies
  await page.evaluate(S => { const j = { kind: 'lt-taskpack-reply', v: 1, pack: 'board:MEP Team', name: 'Ana', rows: [{ id: 'T001.1', title: 'Doors', status: 'Completed', notes: 'Done - see Output' }] };
    window.__add(S + '\\_Replies\\Reply_Ana.txt', "Lew's Tracker - task update\nLTUPDATE1:\n" + btoa(unescape(encodeURIComponent(JSON.stringify(j)))) + '\n'); }, S);
  await d.evaluate(() => { view = 'list'; render(); });
  ok(/1 reply on team boards/.test(await d.evaluate(() => $('views').innerText)), 'Delegate shows "📥 1 reply on team boards"');
  await d.click('#bBrep'); await page.waitForTimeout(300);
  files = await F();
  ok(await d.evaluate(() => findTask('T001').subs[0].status == 'Completed' && /Done - see Output/.test(findTask('T001').subs[0].notes)), 'reply loaded (after you OK the changes): T001.1 Completed with Ana\'s note');
  ok(files.includes(S + '\\_Replies\\Loaded\\Reply_Ana.txt') && !files.includes(S + '\\_Replies\\Reply_Ana.txt'), 'the reply file moves to _Replies\\Loaded');
  // changed here: the board offers an update
  await d.evaluate(() => { setTaskStatus(findTask('T002'), 'In progress', 'test'); render(); });
  ok(/Update team board \(MEP Team\)/.test(await d.evaluate(() => $('views').innerText)), 'changed since the last update: "📌 Update team board (MEP Team)"');
  await d.click('#bBpub'); await page.waitForTimeout(200);
  ok(!/Update team board/.test(await d.evaluate(() => $('views').innerText)), 'updated - the button goes');
  // unreachable folder
  await d.evaluate(() => { data.groups[0].folder = 'P:\\Gone'; });
  ok(await d.evaluate(() => publishBoard(data.groups[0], true) === false), 'folder not reachable: says so, nothing breaks');
};
