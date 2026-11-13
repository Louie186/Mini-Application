module.exports = async ({ page, out }) => {
  await page.evaluate(() => {
    const iso = n => LT.iso(new Date(Date.now() + n * 864e5));
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: '5013 Tower 1' }], current: 'p1' });
    var D = {}; for (var i = 0; i < 60; i++) { var k = 'T1-ZZ-DR-A-' + (2000 + i); D[k] = { num: k, title: 'Drawing ' + i, ok: true, st: i < 14 ? 'In progress' : i < 22 ? 'Checked' : '', stAt: iso(-1) }; }
    LT.saveJson(LT.registerFile('p1'), { name: '5013 Tower 1', setup: {}, rules: [], models: [], history: [], changes: {}, drawings: D });
    var items = []; for (var j = 40; j < 60; j++) items.push({ number: 'T1-ZZ-DR-A-' + (2000 + j), rev: 'C01' });
    LT.saveJson(LT.dataPath('transmittals.json'), { next: 4, prefix: 'TR-', log: [{ no: 'TR-001', date: iso(-12), to: 'Client', purpose: 'For information', items: items.slice(0, 8), package: 'log' }, { no: 'TR-002', date: iso(-5), to: 'MEP consultant', purpose: 'For coordination', items: items.slice(8, 14), package: 'zip', source: 'Check all' }, { no: 'TR-003', date: iso(-1), to: 'Client', purpose: 'For construction', items: items.slice(14), package: 'zip', source: 'Drawing Register list' }] });
    LT.saveJson(LT.dataPath('tracker.json'), { view: 'today', seq: 6, tasks: [
      { id: 'a', code: 'TL-001', title: 'Update clash report L16', project: 'Tower 1', due: iso(-1), priority: 'High', status: 'To do', log: [] },
      { id: 'b', code: 'TL-002', title: 'Print 1BRA set for client', project: 'Tower 1', due: iso(0), status: 'Doing', log: [] },
      { id: 'c', code: 'TL-003', title: 'IFC issue Podium', project: 'Podium', due: iso(3), status: 'To do', log: [] },
      { id: 'd', code: 'TL-004', title: 'Sheet index', status: 'Done', doneOn: iso(-1), log: [] }, { id: 'e', code: 'TL-005', title: 'RFI 21 reply', status: 'Done', doneOn: iso(-3), log: [] }, { id: 'f', code: 'TL-006', title: 'Model audit', status: 'Done', doneOn: iso(0), log: [] }] });
    LT.saveJson(LT.dataPath('delegate.json'), { seq: 2, tasks: [{ code: 'T001', title: 'Level 3 GA', who: 'Anna', due: iso(-2), status: 'Not started', subs: [{ code: 'T001.1', title: 'A-301', who: 'Anna', status: 'Completed', doneOn: iso(-2) }, { code: 'T001.2', title: 'A-302', who: 'Ben', status: 'In progress', due: iso(2) }] }, { code: 'T002', title: 'Clash fixes', who: 'Ben', due: iso(-1), status: 'Not started', subs: [] }, { code: 'T003', title: 'Door schedule', who: 'Kim', due: iso(5), status: 'In progress', subs: [] }] });
    LT.saveJson(LT.dataPath('workload.json'), { people: [{ name: 'Anna', hours: 37.5 }, { name: 'Ben', hours: 20 }, { name: 'Kim', hours: 37.5 }], estimates: { 'T001.2': 16, 'T002': 12, 'T003': 20 }, defaultHours: 4 });
    var s = LT.settings(); s.userName = 'Lew Orinia'; LT.saveSettings(s); LTMain.dataChanged(); });
  await page.click('.nb[data-k="home"]'); await page.waitForTimeout(800); await page.mouse.move(600, 650);
  await page.screenshot({ path: out + '/n_home.png' });
  await page.click('#themeB'); await page.waitForTimeout(500); await page.screenshot({ path: out + '/n_home_dark.png' });
  await page.click('#themeB'); await page.waitForTimeout(300);
  const h = page.frame({ url: /home\.html/ }); await h.click('#bRep'); await page.waitForTimeout(800); await page.screenshot({ path: out + '/n_report.png' });
  await page.evaluate(() => LTMain.show('check')); await page.waitForTimeout(800); await page.screenshot({ path: out + '/n_check.png' });
};
