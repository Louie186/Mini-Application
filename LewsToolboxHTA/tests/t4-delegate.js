// Delegate in the pretend Windows (with pretend Excel); the HTML pack is opened in a real browser page
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { window.__excel = 1; });
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(700);
  const f = page.frame({ url: /delegate\.html/ });
  // make two tasks through the edit dialog
  await f.click('#bNew'); await f.fill('#eTitle', 'Level 3 GA sheets'); await f.fill('#eGroup', 'Drawings'); await f.fill('#eProj', 'Tower 1'); await f.fill('#eWho', 'Anna');
  await f.evaluate(() => { var d = new Date(); d.setDate(d.getDate() - 1); $('eDue').value = LT.pad(d.getDate()) + '/' + LT.pad(d.getMonth() + 1) + '/' + d.getFullYear(); });
  await f.click('#eAddRow'); await f.click('#eAddRow');
  await f.evaluate(() => { var r = $('items').getElementsByTagName('tr'); r[1].getElementsByClassName('iT')[0].value = 'Sheet A-301 – plan'; r[1].getElementsByClassName('iW')[0].value = 'Anna'; r[2].getElementsByClassName('iT')[0].value = 'Sheet A-302'; r[2].getElementsByClassName('iW')[0].value = 'Ben'; });
  await f.click('#eOk');
  await f.click('#bNew'); await f.fill('#eTitle', 'Clash report "zone B" & <check>'); await f.fill('#eWho', 'Ben, Anna'); await f.fill('#eNotes', 'first pass'); await f.click('#eOk');
  const tasks = await f.evaluate(() => data.tasks.map(t => t.code + ':' + t.subs.map(s => s.code).join(',')));
  ok(tasks.join(' ') == 'T001:T001.1,T001.2 T002:', 'tasks and item IDs made: ' + tasks.join(' '));
  await page.screenshot({ path: out + '/h_delegate.png' });
  const feed = await page.evaluate(() => JSON.parse(Object.values(window.__mockFs.files).find(x => /delegate-feed\.json$/i.test(x.path)).text));
  ok(feed.length == 2 && feed[0].who == 'Anna, Ben', 'feed for the Tracker written');
  // send
  await f.click('#bSend'); await f.check('#sSi'); await f.check('#sAll'); await f.click('#sOk'); await page.waitForTimeout(400);
  const files = await page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path).filter(p => /\\Delegate\\/.test(p)).sort());
  console.log('   files:', files.map(p => p.split('\\').pop()).join(', '));
  ok(files.length == 9, '9 files: Excel + simple + pack for Anna, Ben, Everyone');
  // Ben's sheet has only his item of T001
  const benXl = files.find(p => /Tasks_Ben_.*\d\.xlsx$/.test(p));
  const ben = await page.evaluate(p => JSON.parse(window.__mockFs.files[p.toLowerCase()].text.substring(6)), benXl);
  const ids = Object.entries(ben[0].cells).filter(([k]) => k.endsWith(',1')).map(([k, v]) => v.show).filter(v => /^T\d/.test(v));
  ok(ids.join(',') == 'T001,T001.2,T002', "Ben's sheet: only his item (" + ids.join(',') + ')');
  ok(ben[2].name == '_lt' && ben[2].visible == 2, 'hidden _lt sheet with export ID');
  // Anna fills in her Excel sheet: T001.1 Completed + notes, a new item under T001, a NEW task
  const annaXl = files.find(p => /Tasks_Anna_.*\d\.xlsx$/.test(p));
  await page.evaluate(p => { const f = window.__mockFs.files[p.toLowerCase()], wb = JSON.parse(f.text.substring(6)), c = wb[0].cells;
    let row = r => Object.entries(c).find(([k, v]) => k.endsWith(',1') && v.show == r)[0].split(',')[0];
    const r1 = row('T001.1'); c[r1 + ',6'] = { show: 'Completed' }; c[r1 + ',8'] = { show: 'Done, sent to Lew' };
    const r2 = row('T002'); c[r2 + ',6'] = { show: 'In progress' };
    const nw = row('NEW'); c[nw + ',2'] = { show: 'Section B-B drawings' }; c[(+nw + 1) + ',2'] = { show: 'Section drawing' }; c[(+nw + 1) + ',6'] = { show: 'Not started' };
    f.text = 'MOCKXL' + JSON.stringify(wb); }, annaXl);
  const n1 = await f.evaluate(p => applyReplies([readFile(p)]), annaXl);
  ok(n1 == 4, 'Excel reply: 4 changes (status, notes, status, new task) - got ' + n1);
  ok(await f.evaluate(() => { var t = findTask('T001'), n = findTask('T003'); return t.subs[0].status == 'Completed' && t.subs[0].updated.indexOf('Anna') > 0 && n && n.subs.length == 1 && n.who == 'Anna'; }), 'applied, from Anna (found by the file\'s export ID), new task T003 with its item');
  ok(await f.evaluate(p => applyReplies([readFile(p)]), annaXl) == 0, 'loading the same file again changes nothing');
  // HTML pack in a real browser page
  const packPath = files.find(p => /Tasks_Anna_.*\.html$/.test(p));
  const html = await page.evaluate(p => window.__mockFs.files[p.toLowerCase()].text, packPath);
  ok(/^[\x00-\x7f]*$/.test(html), 'pack file is plain ASCII');
  fs.writeFileSync('/tmp/claude-0/pack-hta.html', html);
  const pg = await page.context().newPage(); const perr = []; pg.on('pageerror', e => perr.push(e.message));
  await pg.goto('file:///tmp/claude-0/pack-hta.html'); await pg.waitForTimeout(800);
  const txt = await pg.textContent('body');
  ok(txt.includes('Sheet A-301') && txt.includes('Clash report') && perr.length == 0, 'pack opens in the browser and shows the tasks');
  await pg.click('[data-st="c:T001.2"][data-v="Completed"]');
  await pg.screenshot({ path: out + '/h_pack.png' });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act="reply"]')]);
  const replyText = fs.readFileSync(await dl.path(), 'utf8'); await pg.close();
  const n2 = await f.evaluate(t => applyReplies([parseReply(t)]), replyText);
  ok(n2 == 1 && await f.evaluate(() => findTask('T001').subs[1].status == 'Completed'), 'pack reply loaded: T001.2 Completed');
  await f.click('[data-v="team"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/h_team.png' });
  ok(await f.evaluate(() => document.querySelectorAll('#main tr').length == 3), 'team view: Anna and Ben');
};
