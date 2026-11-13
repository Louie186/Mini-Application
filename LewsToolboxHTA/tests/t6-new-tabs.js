// the 8 new tabs in the pretend Windows
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const D = 'tmp\\claude-0\\hta-run\\LewsToolbox-data\\';
  await page.evaluate((D) => {
    const add = (p, t, time) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: time || Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    add(D + 'tracker.json', JSON.stringify({ view: 'today', tasks: [
      { id: 'a', title: 'Update clash report', project: 'Tower 1', due: iso(-1), priority: 'High', status: 'To do', log: [] },
      { id: 'b', title: 'Sheet index', project: 'Podium', due: iso(0), status: 'Done', doneOn: iso(0), log: [{ date: iso(0), hours: 2 }] },
      { id: 'c', title: 'IFC issue', project: 'Podium', due: iso(3), status: 'To do', log: [] }] }));
    add(D + 'delegate.json', JSON.stringify({ seq: 2, project: 'Tower 1', issued: [], imports: [], tasks: [
      { id: 't1', code: 'T001', title: 'Level 3 GA', who: 'Anna', due: iso(-2), status: 'Not started', history: [], subs: [
        { code: 'T001.1', title: 'A-301', who: 'Anna', status: 'Completed', doneOn: iso(0) }, { code: 'T001.2', title: 'A-302', who: 'Ben', status: 'In progress', due: iso(2) }] },
      { id: 't2', code: 'T002', title: 'Clash fixes', who: 'Ben', due: iso(8), status: 'Not started', history: [], subs: [] }] }));
    add(D + 'workload.json', JSON.stringify({ people: [{ name: 'Anna', hours: 37.5 }, { name: 'Ben', hours: 20 }], estimates: { 'T001.2': 16, 'T002': 30 }, defaultHours: 0, weeks: 4 }));
    // files
    ['5013-KEO-T1-ZZ-DR-A-10101-P01.pdf', '5013-KEO-T1-ZZ-DR-A-10101-P02.pdf', '5013-KEO-T1-ZZ-DR-A-10101-C01.pdf', '5013-KEO-T1-ZZ-DR-A-10102-P01.pdf', '5013-keo-T1-ZZ-XX-A-1010-P01.pdf', 'notes.pdf'].forEach(n => add('C:\\Print\\' + n, 'x'));
    ['5013-KEO-T1-ZZ-DR-A-10101-P01.pdf', '5013-KEO-T1-ZZ-DR-A-10102-P01.pdf', '5013-KEO-T1-ZZ-DR-A-10103-P01.pdf'].forEach(n => add('C:\\Sub1\\' + n, 'aa'));
    ['5013-KEO-T1-ZZ-DR-A-10101-P02.pdf', '5013-KEO-T1-ZZ-DR-A-10102-P01.pdf', '5013-KEO-T1-ZZ-DR-A-10104-P01.pdf'].forEach(n => add('C:\\Sub2\\' + n, n.indexOf('10102') > 0 ? 'bbbb' : 'aa'));
    window.__mockFs.dirs['c:\\projects'] = 'C:\\Projects';
  }, D);
  const go = async k => { if (/^(find|superseded|report)$/.test(k)) { await page.evaluate(k => LTMain.show(k), k); await page.waitForTimeout(1200); } else { await page.click('.nb[data-k="' + k + '"]'); await page.waitForTimeout(500); } return page.frame({ url: new RegExp(k + '\\.html') }); };   // find / superseded / report now live inside Folder Check / Home
  console.log('   menu: ' + (await page.$$eval('.nb', b => b.map(x => x.textContent.trim()))).join(' | '));
  // Home
  let f = await go('home');
  ok(await f.evaluate(() => $('today').innerText.includes('Update clash report') && $('wait').innerText.includes('Ben') && $('next').innerText.includes('IFC issue') && $('teamBox').style.display == ''), 'Home: today, waiting on others, next 2 weeks, team');
  await page.screenshot({ path: out + '/h_home.png' });
  await f.fill('#quick', 'Call client tomorrow #Tower1'); await f.click('#bAdd'); await page.waitForTimeout(800);
  const tf = page.frame({ url: /tracker\.html/ });
  ok(tf && await tf.evaluate(() => data.tasks.some(t => t.title == 'Call client' && t.project == 'Tower1')), 'Home: task handed to the Tracker');
  // Folders
  f = await go('folders');
  await f.evaluate(() => { window.top.__nextFolder = 'C:\\Projects'; }); await f.click('#bWhere'); await f.fill('#proj', '5013 Tower 1'); await f.evaluate(() => preview());
  await f.click('#bMake'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!window.__mockFs.dirs['c:\\projects\\5013 tower 1\\01 wip\\coordination\\clash reports']), 'Folders: project tree created');
  ok(await f.evaluate(() => $('bMake').disabled), 'Folders: nothing left to make the second time');
  // Naming
  await go('check'); await page.mouse.move(900, 600); await page.frame({ url: /check\.html/ }).click('[data-fv="naming"]'); await page.waitForTimeout(700); f = page.frame({ url: /naming\.html/ });   // a view inside Folder Check
  await f.evaluate(() => { folder = 'C:\\Print'; }); await f.click('#bRun');
  const nm = await f.evaluate(() => results.map(r => r.name + ': ' + (r.probs.join(' / ') || 'OK')));
  console.log('   ' + nm.join('\n   '));
  ok(await f.evaluate(() => results.filter(r => r.probs.length).length == 2), 'Naming: 2 wrong (bad type/number/case, and "notes")');
  await page.screenshot({ path: out + '/h_naming.png' });
  // Superseded
  f = await go('superseded');
  await f.evaluate(() => { cfg.folder = 'C:\\Print'; }); await f.click('#bLook');
  ok(await f.evaluate(() => groups.length == 1 && groups[0].files[0].rev == 'C01' && groups[0].files.filter(x => x.move).length == 2), 'Superseded: C01 kept, P01 + P02 to move');
  await f.click('#bRun'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!window.__mockFs.files['c:\\print\\superseded\\5013-kei-t1-zz-dr-a-10101-p01.pdf'.replace('kei', 'keo')] && !!window.__mockFs.files['c:\\print\\5013-keo-t1-zz-dr-a-10101-c01.pdf']), 'Superseded: old ones moved, latest stays');
  await f.click('#bUndo'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!window.__mockFs.files['c:\\print\\5013-keo-t1-zz-dr-a-10101-p01.pdf']), 'Superseded: undo puts them back');
  // Compare
  await go('check'); await page.mouse.move(900, 600); await page.frame({ url: /check\.html/ }).click('[data-fv="compare"]'); await page.waitForTimeout(700); f = page.frame({ url: /compare\.html/ });   // a view inside Folder Check
  await f.evaluate(() => { cfg.a = { kind: 'folder', path: 'C:\\Sub1' }; cfg.b = { kind: 'folder', path: 'C:\\Sub2' }; paths(); }); await f.click('#bRun');
  const cmp = await f.evaluate(() => result.map(r => r.base.slice(-5) + ':' + r.st).join(' '));
  console.log('   ' + cmp);
  ok(cmp == '10101:Revised 10102:Same rev, file changed 10103:Removed 10104:New', 'What changed: revised, same rev but changed, removed, new');
  await page.screenshot({ path: out + '/h_compare.png' });
  // Transmittal (with pretend Excel)
  await page.evaluate(() => { window.__excel = 1; });
  f = await go('transmittal');
  await f.evaluate(() => { addFiles(['C:\\Sub2\\5013-KEO-T1-ZZ-DR-A-10101-P02.pdf', 'C:\\Sub2\\5013-KEO-T1-ZZ-DR-A-10102-P01.pdf']); });
  await f.fill('#hTo', 'Client Ltd'); await f.check('#copyFiles'); await f.click('#bMake'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => Object.keys(window.__mockFs.files).some(k => /transmittals\\tr-001\\tr-001_client_ltd_.*\.xlsx$/.test(k)) && Object.keys(window.__mockFs.files).some(k => /tr-001\\5013-keo-t1-zz-dr-a-10101-p02\.pdf$/.test(k))), 'Transmittal: TR-001 made, files copied');
  ok(await f.evaluate(() => store.next == 2 && store.log[0].items.length == 2 && store.log[0].items[0].rev == 'P02'), 'Transmittal: logged, next is TR-002');
  // Workload
  await go('delegate'); await page.frame({ url: /delegate\.html/ }).click('[data-v="workload"]'); await page.waitForTimeout(700); f = page.frame({ url: /workload\.html/ });   // Workload now lives inside Delegate
  ok(await f.evaluate(() => { var it = items.filter(x => x.who[0] == 'Ben'), s = 0; for (var w = 0; w < weeks.length; w++) s += hoursFor('Ben', w).h; var a = it.find(x => x.code == 'T001.2'); return s == 46 && hoursFor('Ben', a.week).h >= 16; }), 'Workload: Ben 46h across the weeks, each task in its due week');
  await page.screenshot({ path: out + '/h_workload.png' });
  // Weekly report
  f = await go('report');
  const rep = await f.evaluate(() => { build(); return text; }); console.log(rep.replace(/\r/g, '').split('\n').map(l => '   | ' + l).join('\n'));
  ok(/Sheet index/.test(rep) && /Anna: 1 completed this week/.test(rep) && /TR-001/.test(rep) && /Ben: .* of 20 h next week/.test(rep), 'Weekly report: my work, delegated, sent, team load');
  await page.screenshot({ path: out + '/h_report.png' });
};
