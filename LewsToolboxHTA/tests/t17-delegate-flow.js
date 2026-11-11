// Tasks -> Delegate: from the task log, groups with a lead, references copied and shown in the pack, lead assigns items
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { window.__excel = 1; const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('C:\\Refs\\Markup.pdf', 'PDF'); add('C:\\Refs\\Brief.docx', 'DOC'); add('C:\\Other\\Markup.pdf', 'PDF2'); });
  // a group with a lead (Delegate > Team & groups)
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(600); await page.mouse.move(900, 600);
  const d = page.frame({ url: /delegate\.html/ });
  await d.click('[data-v="team"]'); await d.click('#gAdd'); await d.fill('#gName', 'MEP Team'); await d.fill('#gLead', 'Sam'); await d.fill('#gMem', 'Ana, Ben, Sam'); await d.click('#gOk');
  ok(await d.evaluate(() => data.groups.length == 1 && data.groups[0].lead == 'Sam' && data.groups[0].members.join() == 'Ana,Ben'), 'group made: MEP Team, lead Sam, members Ana + Ben');
  await page.screenshot({ path: out + '/p_groups.png' });
  // log a task in Tasks for the group, with references
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const tk = page.frame({ url: /tracker\.html/ });
  await tk.evaluate(() => { var t = blank(); t.title = 'L16 ceiling coordination'; t.who = 'MEP Team'; t.due = LT.today(); t.notes = 'Check services against the RCP';
    t.refs = [{ kind: 'link', value: 'https://acc.example.com/p/1', label: 'ACC model', send: 'copy' }, { kind: 'file', value: 'C:\\Refs\\Markup.pdf', label: '', send: 'copy' }, { kind: 'file', value: 'C:\\Refs\\Brief.docx', label: '', send: 'link' }];
    t.subs = [{ code: '', title: 'Doors', who: '', due: '', status: 'To do', refs: [{ kind: 'file', value: 'C:\\Other\\Markup.pdf', label: '', send: 'copy' }] }, { code: '', title: 'Windows', who: '', due: '', status: 'To do', refs: [{ kind: 'note', value: 'Use the markup on page 3' }] }];
    addTask(t); save(); render(); });
  // From Tasks in Delegate
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(400); await page.mouse.move(900, 600);
  await d.click('#bFrom'); await page.waitForTimeout(100);
  ok(await d.evaluate(() => /TL-001/.test($('menu').innerText) && /MEP Team/.test($('menu').innerText)), 'From Tasks lists TL-001 (for MEP Team)');
  await d.click('#menu .mi'); await page.waitForTimeout(200);
  const t = await d.evaluate(() => { var t = data.tasks[0]; return [t.code, t.log, t.who, t.group, t.subs.map(s => s.code + ':' + s.refs.length).join(' '), t.refs.length].join(' | '); });
  ok(t == 'T001 | TL-001 | MEP Team | MEP Team | T001.1:1 T001.2:1 | 3', 'became T001 with its checklist and references: ' + t);
  ok(await d.evaluate(() => $('send').style.display == 'block' && /Sam/.test($('whoList').innerText) && /lead of MEP Team/.test($('whoList').innerText) && !/Ana|Ben/.test($('whoList').innerText)), 'Send opens: only the lead Sam (lead of MEP Team)');
  await page.screenshot({ path: out + '/p_send.png' });
  await d.click('#sOk'); await page.waitForTimeout(300);
  const files = await page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path).filter(p => /\\Delegate\\/.test(p)).sort());
  console.log('   files:', files.map(p => p.split('\\Delegate\\')[1]).join(', '));
  ok(files.some(p => /References\\Markup\.pdf$/.test(p)) && files.some(p => /References\\Markup \(2\)\.pdf$/.test(p)) && !files.some(p => /Brief/.test(p)), 'copies: Markup.pdf and Markup (2).pdf in References; Brief.docx is link only (not copied)');
  // Tasks hears about it
  ok(await tk.evaluate(() => { var t = byCode('TL-001'); return t.delegated && t.delegated.code == 'T001' && /Sam/.test(t.delegated.to); }), 'Tasks: TL-001 delegated (T001, Sam)');
  // the lead's pack
  const pk = files.find(p => /Tasks_Sam_.*\.html$/.test(p));
  fs.writeFileSync('/tmp/claude-0/pack-lead.html', await page.evaluate(p => window.__mockFs.files[p.toLowerCase()].text, pk));
  const pg = await page.context().newPage(); const perr = []; pg.on('pageerror', e => perr.push(e.message));
  await pg.goto('file:///tmp/claude-0/pack-lead.html'); await pg.waitForTimeout(800);
  ok(perr.length == 0 && await pg.evaluate(() => document.querySelectorAll('select.who').length == 2), "lead's pack opens with an Assign-to box on both items");
  const links = await pg.evaluate(() => [].map.call(document.querySelectorAll('.refs a'), a => a.getAttribute('href')).join(' '));
  ok(/https:\/\/acc\.example\.com\/p\/1/.test(links) && /References\/Markup\.pdf/.test(links) && /References\/Markup%20\(2\)\.pdf/.test(links) && /file:\/\/\/C:\/Refs\/Brief\.docx/.test(links), 'references link to the web, the copies, and the original (link only): ' + links);
  ok(await pg.evaluate(() => /Use the markup on page 3/.test(document.body.innerText)), 'note shows under its item');
  await pg.selectOption('select[data-who="T001.1"]', 'Ana'); await pg.selectOption('select[data-who="T001.2"]', 'Ben');
  await pg.click('[data-st="c:T001.1"][data-v="In progress"]');
  await pg.screenshot({ path: out + '/p_lead_pack.png' });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act="reply"]')]);
  const reply = fs.readFileSync(await dl.path(), 'utf8'); await pg.close();
  const n = await d.evaluate(r => applyReplies([parseReply(r)]), reply);
  ok(n == 3 && await d.evaluate(() => { var t = data.tasks[0]; return t.subs[0].who == 'Ana' && t.subs[1].who == 'Ben' && t.subs[0].status == 'In progress' && /Sam assigned T001.2 to Ben/.test(t.history.join('\n')); }), "lead's reply: Doors → Ana, Windows → Ben, Doors in progress (history: Sam assigned …)");
  // Excel sheet for the lead: References column + yellow Assignee with the team list
  const xl = files.find(p => /Tasks_Sam_.*\d\.xlsx$/.test(p));
  const wb = await page.evaluate(p => JSON.parse(window.__mockFs.files[p.toLowerCase()].text.substring(6)), xl);
  const c = wb[0].cells, hdr = c['5,9'] && c['5,9'].show, refTxt = Object.entries(c).filter(([k]) => k.endsWith(',9')).map(([k, v]) => v.show).join(' / ');
  ok(hdr == 'References' && /Link: ACC model - https:\/\/acc/.test(refTxt) && /Markup\.pdf/.test(refTxt), 'Excel sheet has a References column');
  // Team counts and Tasks progress
  await d.evaluate(() => { save(); });
  await tk.evaluate(() => { loadFeed(); render(); });
  ok(await tk.evaluate(() => /0\/2 done/.test(byCode('TL-001').dprog)), 'Tasks shows the progress (0/2 done)');
};
