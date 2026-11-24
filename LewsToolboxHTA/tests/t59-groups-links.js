// Tasks: groups (drag onto a group), links (one must finish first -> on hold, release, bell), duplicates (warn, merge, keep both), the Links node view
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500);
  const t = page.frame({ url: /tracker\.html/ });
  await t.evaluate(() => { window.confirm = () => true; window.__pr = []; window.prompt = (m, d) => window.__pr.length ? window.__pr.shift() : d; LT.saveJson(LT.dataPath('tracker.json'), { tasks: [], view: 'open' }); load(); data.view = 'open';
    const mk = (title, due, who, dw) => { const x = blank(); x.title = title; x.due = due; x.who = who || ''; if (dw) x.subs = dw.map(n => ({ code: '', title: n + ' - plan', who: '', due: '', status: 'To do', refs: [{ kind: 'drawing', value: n }], dwg: n })); addTask(x); return x; };
    mk('Lobby ceiling details', LT.iso(addDays(todayD(), 2)), '', ['A-10100', 'A-10101']);   // TL-001
    mk('MEP coordination for lobby', LT.iso(addDays(todayD(), 5)), '');                       // TL-002
    mk('Tower 1 typical floor', LT.iso(addDays(todayD(), 3)), 'Sam', ['A-20100']);           // TL-003
    mk('Podium finishes', LT.iso(addDays(todayD(), 4)), '');                                  // TL-004
    save(); render(); });
  // ---------- groups ----------
  await t.evaluate(() => { window.__pr = ['Tower 1']; }); await t.click('#gpAdd'); await t.evaluate(() => { window.__pr = ['Podium']; }); await t.click('#gpAdd');
  ok(await t.evaluate(() => groups().length == 2 && /Tower 1/.test($('gp').innerText) && /Podium/.test($('gp').innerText)), 'Groups panel: + Group makes "Tower 1" and "Podium"');
  const dragTo = async (fromSel, toSel) => { await t.evaluate(([a, b]) => { const s = document.querySelector(a), d = document.querySelector(b), dt = new DataTransfer();
    s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 300, clientY: 200 })); }, [fromSel, toSel]); await page.waitForTimeout(80); };
  const row = code => t.evaluate(c => { const i = shown.findIndex(x => x.code == c); return '#main tr[data-i="' + i + '"]'; }, code);
  const gsel = name => t.evaluate(n => '#gp [data-gid="' + groups().find(g => g.name == n).id + '"]', name);
  await dragTo(await row('TL-001'), await gsel('Podium')); await dragTo(await row('TL-004'), await gsel('Podium')); await dragTo(await row('TL-003'), await gsel('Tower 1')); await dragTo(await row('TL-001'), await gsel('Tower 1'));
  ok(await t.evaluate(() => { const a = byCode('TL-001'), g = groups(); return a.groups.length == 2 && inGroup(byCode('TL-004'), g[1].id) && inGroup(byCode('TL-003'), g[0].id); }), 'drag a task onto a group: in it (TL-001 in two groups)');
  ok(await t.evaluate(() => /Podium/.test(document.querySelector('#gp').innerText) && /2 open/.test([...document.querySelectorAll('#gp .gcard')].find(c => /Podium/.test(c.innerText)).innerText)), 'group card: 2 open');
  await t.click(await gsel('Podium'));
  ok(await t.evaluate(() => shown.length == 2 && shown.every(x => /TL-00[14]/.test(x.code))), 'click a group: only its tasks');
  await t.click(await gsel('Podium'));
  ok(await t.evaluate(() => shown.length == 4), 'click again: all tasks');
  // ---------- links ----------
  await t.evaluate(() => { window.__pr = ['MEP clashes in the ceiling void']; }); 
  await dragTo(await row('TL-002'), await row('TL-001'));
  ok(await t.evaluate(() => /TL-001.*waits for.*TL-002/.test($('menu').innerText.replace(/\s+/g, ' '))), 'drag a task onto another: a menu (waits for / same group / merge)');
  await t.evaluate(() => { [...document.querySelectorAll('#menu .mi')].find(m => /TL-001 waits for TL-002/.test(m.innerText.replace(/\s+/g, ' '))).click(); });
  await page.waitForTimeout(80);
  const r1 = await t.evaluate(() => document.querySelector('#main tr[data-i="' + shown.findIndex(x => x.code == 'TL-001') + '"]').innerText.replace(/\s+/g, ' '));
  ok(/on hold – waits for TL-002: MEP clashes/.test(r1) && /On hold \(TL-002\)/.test(r1) && /TL-002 is due after this/.test(r1), 'TL-001: on hold, why, and "TL-002 is due after this" (date clash): ' + r1);
  ok(/holds up TL-001/.test(await t.evaluate(() => document.querySelector('#main tr[data-i="' + shown.findIndex(x => x.code == 'TL-002') + '"]').innerText)), 'TL-002: "holds up TL-001"');
  ok(await t.evaluate(() => { linkTasks(byCode('TL-001'), byCode('TL-002')); return byCode('TL-002').after == null || byCode('TL-002').after.length == 0; }), 'a loop (TL-002 waiting for TL-001 too) is refused');
  ok(await t.evaluate(() => { data.view = 'hold'; render(); const n = shown.length; data.view = 'open'; render(); return n == 1; }), '"On hold" view');
  await t.evaluate(() => edit(byCode('TL-001')));
  ok(await t.evaluate(() => /waits for TL-002/.test($('eLinks').innerText)), 'task window: Linked tasks shows what it waits for');
  await t.evaluate(() => { $('dlg').style.display = 'none'; setStatus(byCode('TL-002'), 'Done'); });
  ok(await t.evaluate(() => { const a = byCode('TL-001'); return !holdOf(a).length && a.released && a.released.by == 'TL-002' && /can continue/.test(document.querySelector('#main tr[data-i="' + shown.findIndex(x => x.code == 'TL-001') + '"]').innerText); }), 'TL-002 done: TL-001 can continue (flag + tag)');
  ok(await page.evaluate(() => { const R = remindData(); return R.released.length == 1 && R.released[0].code == 'TL-001'; }), 'the bell knows: TL-001 can continue');
  await t.evaluate(() => { linkTasks(byCode('TL-004'), byCode('TL-003'), ''); linkTasks(byCode('TL-003'), byCode('TL-001'), 'waits for the typical floor'); });
  ok(/ON HOLD \(2\)[\s\S]*Lobby ceiling details – waits for TL-003 Tower 1 typical floor \(waits for the typical floor\)/.test(await t.evaluate(() => weekly())), 'weekly summary: an ON HOLD section with what each waits for and why');
  // ---------- duplicates ----------
  await t.fill('#quick', 'Tower 1 typical floor'); await t.press('#quick', 'Enter'); await page.waitForTimeout(80);
  ok(await t.evaluate(() => $('dupDlg').style.display == 'block' && /TL-003/.test($('dupT').innerText) && /same task title/.test($('dupT').innerText) && /Sam/.test($('dupT').innerText)), 'quick add of the same task: "Possible duplicate" - TL-003, the same title, given to Sam');
  await t.click('#dupCancel');
  ok(await t.evaluate(() => data.tasks.length == 4), 'Cancel: nothing added');
  await t.evaluate(() => { edit(null); $('eTitle').value = 'Check the lobby set'; $('eAssign').value = 'Ana'; work.subs = [{ code: '', title: 'A-10101 - plan', who: '', due: '', status: 'To do', refs: [], dwg: 'A-10101' }]; drawSubs(); saveEdit(); });
  ok(await t.evaluate(() => $('dupDlg').style.display == 'block' && /1 same drawing \(A-10101\)/.test($('dupT').innerText)), 'a new task with a drawing already in TL-001: warned (1 same drawing)');
  await t.click('#dupT [data-dm="0"]'); await page.waitForTimeout(80);
  ok(await t.evaluate(() => data.tasks.length == 4 && byCode('TL-001').subs.length == 2 && /Merged/.test(JSON.stringify(byCode('TL-001').events))), 'Merge: it goes into TL-001 (no doubled drawing), no new task');
  await t.evaluate(() => { edit(null); $('eTitle').value = 'Podium finishes'; saveEdit(); });
  await t.click('#dupKeep'); await page.waitForTimeout(80);
  ok(await t.evaluate(() => { const n = data.tasks[data.tasks.length - 1]; return data.tasks.length == 5 && n.title == 'Podium finishes' && n.notDup.length == 1 && !dupsOf(n).length; }), 'Keep both: added, and those two are not asked about again');
  // a duplicate already in the list shows
  await t.evaluate(() => { const x = blank(); x.title = 'Something else'; x.subs = [{ code: '', title: 'A-20100', status: 'To do', refs: [], dwg: 'A-20100' }]; addTask(x); save(); render(); });
  ok(await t.evaluate(() => /Duplicates/.test($('views').innerText) && /duplicate\? TL-003/.test($('main').innerText)), 'duplicates in the list: tagged, and a Duplicates view appears');
  // delegate: the same drawing already given out
  await t.evaluate(() => { LT.saveJson(LT.dataPath('delegate.json'), { tasks: [{ code: 'T009', title: 'Typicals', who: 'Ana', status: 'In progress', subs: [{ code: 'T009.1', title: 'A-20100 - plan', who: 'Ana', status: 'Not started', dwg: 'A-20100' }] }], groups: [] }); window.__cf = ''; window.confirm = m => { window.__cf = m; return false; }; delegate(byCode('TL-003')); window.confirm = () => true; });
  ok(await t.evaluate(() => /already given out in Delegate/.test(window.__cf) && /T009 Typicals - Ana/.test(window.__cf)), 'Delegate: the same drawing already given to Ana (T009) - asked first');
  // ---------- the Links view ----------
  await t.evaluate(() => { data.view = 'links'; render(); });
  const g = await t.evaluate(() => ({ n: document.querySelectorAll('#gSvg .gnode').length, e: document.querySelectorAll('#gSvg .gedge:not(.tmp)').length, boxes: [...document.querySelectorAll('#gSvg .gbox text')].map(x => x.textContent).join(','), crit: document.querySelectorAll('#gSvg .gedge.crit').length, dup: document.querySelectorAll('#gSvg .gnode.dup').length }));
  ok(g.n >= 4 && g.e == 3 && /Tower 1/.test(g.boxes) && /Podium/.test(g.boxes), 'Links view: nodes, 3 arrows, group boxes: ' + JSON.stringify(g));
  ok(g.crit == 2 && g.dup >= 2, 'the longest waiting chain glows (TL-004 → TL-003 → TL-001), duplicates outlined');
  await page.screenshot({ path: out + '/links.png' });
  // drag a node
  const fr = await page.evaluate(() => { const b = [...document.querySelectorAll('iframe')].find(x => /tracker/.test(x.src)).getBoundingClientRect(); return [b.left, b.top]; });
  const nb = await t.evaluate(() => { const r = document.querySelector('#gSvg [data-gn="' + byCode('TL-004').id + '"] rect').getBoundingClientRect(); return [r.left + 40, r.top + 20]; });
  const p0 = await t.evaluate(() => data.nodePos[byCode('TL-004').id].slice());
  await page.mouse.move(fr[0] + nb[0], fr[1] + nb[1]); await page.mouse.down(); await page.mouse.move(fr[0] + nb[0] + 80, fr[1] + nb[1] + 60, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80);
  ok(await t.evaluate((p0) => { const p = data.nodePos[byCode('TL-004').id]; return Math.abs(p[0] - p0[0] - 80) < 3 && Math.abs(p[1] - p0[1] - 60) < 3 && $('dlg').style.display != 'block' && LT.readJson(LT.dataPath('tracker.json')).nodePos; }, p0), 'drag a node: it moves (saved), the arrows follow; no window opens');
  // link by dragging from the dot
  const d1 = await t.evaluate(() => { const c = document.querySelector('#gSvg [data-gl="' + byCode('TL-004').id + '"]').getBoundingClientRect(), r = document.querySelector('#gSvg [data-gn="' + data.tasks[5].id + '"] rect').getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2, r.left + 50, r.top + 25]; });
  await t.evaluate(() => { window.__pr = ['']; });
  await page.mouse.move(fr[0] + d1[0], fr[1] + d1[1]); await page.mouse.down(); await page.mouse.move(fr[0] + d1[2], fr[1] + d1[3], { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(80);
  ok(await t.evaluate(() => (data.tasks[5].after || []).indexOf(byCode('TL-004').id) >= 0), 'drag from a node\'s dot to another: linked (TL-004 must finish first)');
  // click a node = open it
  const nc = await t.evaluate(() => { const r = document.querySelector('#gSvg [data-gn="' + byCode('TL-003').id + '"] rect').getBoundingClientRect(); return [r.left + 60, r.top + 30]; });
  await page.mouse.click(fr[0] + nc[0], fr[1] + nc[1]); await page.waitForTimeout(80);
  ok(await t.evaluate(() => $('dlg').style.display == 'block' && work.code == 'TL-003'), 'click a node: the task opens');
};
