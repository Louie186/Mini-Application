// Tracker in the pretend Windows
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(700);
  const f = page.frame({ url: /tracker\.html/ });
  const P = (s) => f.evaluate(s => { var t = parse(s, new Date(2026, 10, 4)); return [t.title, t.due, t.project, t.priority, t.waitingOn, t.status].join('|'); }, s);
  ok(await P('Check RFI drawings fri #Tower_1 !') == 'Check RFI drawings|2026-11-06|Tower 1|High||To do', 'quick add: fri #Tower_1 !');
  ok(await P('Send model to @Sam tomorrow') == 'Send model to|2026-11-05||Normal|Sam|Waiting', '@Sam tomorrow');
  ok((await P('Issue IFC wednesday')).split('|')[1] == '2026-11-11', 'same weekday = next week');
  ok((await P('Review 25/11 !low')).split('|').slice(1, 4).join('|') == '2026-11-25||Low', '25/11 + !low');
  ok((await P('Plan next week')).startsWith('Plan|2026-11-09'), 'next week = Monday');
  ok((await P('Fix the monitor stand')).startsWith('Fix the monitor stand||'), '"monitor" is not Monday');
  ok(await f.evaluate(() => hrs('1:30') == 1.5 && hrs('0.75') == 0.75 && hrs('2h') == 2), 'hours parsing');
  // feed from Delegate
  await page.evaluate(() => { const today = new Date(); const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const p = 'tmp\\claude-0\\hta-run\\LewsToolbox-data\\delegate-feed.json'; window.__mockFs.files[p.toLowerCase()] = { path: p, text: JSON.stringify([{ id: 'a', title: 'T001 Level 3 sheets (1/2 done)', who: 'Anna', due: iso, status: 'In progress', project: 'Tower 1' }]), time: 0 }; });
  await f.evaluate(() => { loadFeed(); });
  await f.fill('#quick', 'Late thing #A'); await f.evaluate(() => { data.view = 'open'; }); await f.press('#quick', 'Enter');
  await f.evaluate(() => { var d = new Date(); d.setDate(d.getDate() - 1); data.tasks[data.tasks.length - 1].due = LT.iso(d); data.view = 'today'; });
  await f.fill('#quick', 'Daily check #A'); await f.press('#quick', 'Enter');
  await f.evaluate(() => { data.tasks[data.tasks.length - 1].repeat = 'Daily'; save(); render(); });
  ok(await f.evaluate(() => data.tasks[1].due == LT.today()), 'added in Today view = due today');
  ok(await f.evaluate(() => pick('today').length == 3 && pick('today').some(t => t.fromDelegate && t.waitingOn == 'Anna')), 'Today shows late + today + delegated');
  ok(await f.evaluate(() => pick('overdue').length == 1), 'overdue = 1');
  await page.screenshot({ path: out + '/h_tracker.png' });
  await f.evaluate(() => setStatus(data.tasks[1], 'Done'));
  ok(await f.evaluate(() => { var n = data.tasks[2]; var d = new Date(); d.setDate(d.getDate() + 1); return data.tasks.length == 3 && n.due == LT.iso(d) && n.status == 'To do'; }), 'repeat makes the next one tomorrow');
  await f.evaluate(() => startTimer(data.tasks[0]));
  ok(await f.evaluate(() => data.tasks[0].timer > 0 && data.tasks[0].status == 'Doing'), 'timer starts, status Doing');
  await f.evaluate(() => { data.tasks[0].timer -= 90 * 60000; stopTimer(data.tasks[0]); save(); });
  ok(await f.evaluate(() => Math.abs(hours(data.tasks[0]) - 1.5) < 0.02), 'timer logged 1.5 h');
  const saved = await page.evaluate(() => JSON.parse(Object.values(window.__mockFs.files).find(x => /tracker\.json$/i.test(x.path)).text));
  ok(saved.tasks.length == 3 && !JSON.stringify(saved).includes('fromDelegate'), 'saved; delegated tasks not copied into the file');
  const w = await f.evaluate(() => weekly()); console.log(w.replace(/\r/g, ''));
  ok(w.includes('Daily check') && w.includes('Level 3 sheets') && w.includes('1.5 h'), 'weekly summary has done, waiting and time');
  await f.click('[data-v="board"]'); await page.waitForTimeout(300);
  ok(await f.evaluate(() => document.querySelectorAll('.col').length == 4), 'board has 4 columns');
  await page.screenshot({ path: out + '/h_board.png' });
};
