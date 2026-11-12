// Tasks: drawings from the MIDP (Drawing Register) as checklist items; update from a newer MIDP; check a folder against the list
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add;
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Tower 1' }], current: 'p1' });
    var D = {}, put = (n, title, cat, typo, inMidp) => { D[n] = { num: n, title: title, cat: cat, tower: 'T1', typo: typo, ok: true, inMidp: inMidp !== false }; };
    put('T1-ZZ-DR-A-2101', 'Serviced Apartment 1BR Type A - Plan', 'SERVICED APARTMENTS', '1BRA'); put('T1-ZZ-DR-A-2102', 'Serviced Apartment 1BR Type A - RCP', 'SERVICED APARTMENTS', '1BRA');
    put('T1-ZZ-DR-A-2103', 'Serviced Apartment 1BR Type A - Elevations', 'SERVICED APARTMENTS', '1BRA'); put('T1-ZZ-DR-A-2201', 'Serviced Apartment 2BR Type B - Plan', 'SERVICED APARTMENTS', '2BRB');
    put('T1-ZZ-DR-A-1001', 'GA Level 1', 'GENERAL ARRANGEMENT', '-'); put('T1-ZZ-DR-A-2199', 'Old 1BRA detail', 'SERVICED APARTMENTS', '1BRA', false);
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower 1', setup: {}, rules: [], models: [], history: [], changes: {}, drawings: D });
    ['T1-ZZ-DR-A-2101-P02.pdf', 'T1-ZZ-DR-A-2103_P01.pdf', 'T1-ZZ-DR-A-21011-P01.pdf'].forEach(n => add('C:\\Prints\\' + n, 'PDF')); });
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.click('#bDetail'); await t.click('#eMidp'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => $('mp').style.display == 'block' && /Tower 1/.test($('mpProj').innerText) && /5 drawings in the current MIDP/.test($('mpProj').innerText)), 'From the MIDP: opens on the current MIDP (Tower 1, 5 drawings - the removed one left out)');
  await t.fill('#mpQ', '1BRA'); await t.press('#mpQ', 'A'); await t.press('#mpQ', 'Backspace'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => mpRows.map(d => d.number.slice(-4)).join() == '2101,2102,2103' && /3 ticked/.test($('mpN').innerText)), '"1BRA" finds the 3 drawings of that typology');
  await t.fill('#mpQ', 'serviced apartment'); await t.press('#mpQ', 't'); await t.press('#mpQ', 'Backspace'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => mpRows.length == 4), '"serviced apartment" finds all 4 serviced apartment drawings');
  await t.selectOption('#mpTypo', '1BRA'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => mpRows.length == 3), 'words + Typology 1BRA together: 3');
  await t.click('[data-mp="1"]');
  ok(/2 ticked/.test(await t.evaluate(() => $('mpN').innerText)), 'untick one: 2 ticked');
  await page.screenshot({ path: out + '/m_midp.png' });
  await t.click('#mpAll'); await t.click('#mpOk'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => work.subs.length == 3 && work.subs[0].dwg == 'T1-ZZ-DR-A-2101' && /Serviced Apartment 1BR Type A - Plan/.test(work.subs[0].title) && work.subs[0].refs[0].kind == 'drawing' && work.midp.typo == '1BRA' && $('eTitle').value == 'serviced apartment drawings'), 'added as 3 checklist items (number - title, drawing reference); the task remembers the pick');
  ok(await t.evaluate(() => $('eMpUp').style.display == '' && $('eChk').style.display == ''), 'Update from the MIDP and Check a folder appear');
  await t.fill('#eTitle', 'Print 1BRA set'); await t.click('#eOk');
  ok(await t.evaluate(() => { var x = byCode('TL-001'); return x && x.subs.length == 3 && x.subs[2].code == 'TL-001.3' && x.midp; }), 'saved: TL-001.1 ... TL-001.3');
  // a newer MIDP: one added, one removed
  await page.evaluate(() => { var P = LT.readJson(LT.registerFile('p1')); P.drawings['T1-ZZ-DR-A-2104'] = { num: 'T1-ZZ-DR-A-2104', title: 'Serviced Apartment 1BR Type A - Sections', cat: 'SERVICED APARTMENTS', tower: 'T1', typo: '1BRA', ok: true }; P.drawings['T1-ZZ-DR-A-2102'].inMidp = false; LT.saveJson(LT.registerFile('p1'), P); });
  await t.evaluate(() => { edit(byCode('TL-001')); }); await t.click('#eMpUp'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => work.subs.length == 4 && work.subs[3].dwg == 'T1-ZZ-DR-A-2104' && /not in the MIDP/.test(work.subs[1].title)), 'Update from the MIDP: 2104 added, 2102 flagged "(not in the MIDP)"');
  // check a folder
  await t.evaluate(() => { top.__nextFolder = 'C:\\Prints'; }); await t.click('#eChk'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => work.subs.filter(s => s.status == 'Done').map(s => s.dwg.slice(-4)).join() == '2101,2103'), 'Check a folder: 2101 (-P02) and 2103 (_P01) found and ticked; not fooled by 21011');
  await t.click('#eOk');
  ok(await t.evaluate(() => /Checked a folder: 2 of 4 found/.test(JSON.stringify(byCode('TL-001').events))), 'noted on the timeline');
  // as a template: comes up to date with the MIDP when used
  await t.evaluate(() => { window.prompt = () => 'Print 1BRA'; saveTemplate(byCode('TL-001')); });
  await page.evaluate(() => { var P = LT.readJson(LT.registerFile('p1')); P.drawings['T1-ZZ-DR-A-2105'] = { num: 'T1-ZZ-DR-A-2105', title: 'Serviced Apartment 1BR Type A - Details', cat: 'SERVICED APARTMENTS', tower: 'T1', typo: '1BRA', ok: true }; LT.saveJson(LT.registerFile('p1'), P); });
  await t.evaluate(() => { fromTemplate(data.templates[0]); });
  ok(await t.evaluate(() => work.subs.some(s => s.dwg == 'T1-ZZ-DR-A-2105') && work.subs.every(s => s.status == 'To do')), 'a template made from the pick: brings in drawings added to the MIDP since');
};
