// Batch B: drawing status board (Register > Status) and the revision check in Transmittal
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('C:\\Issue\\T1-ZZ-DR-A-1001-C02.pdf', 'PDF'); add('C:\\Issue\\T1-ZZ-DR-A-1002-P01.pdf', 'PDF'); add('C:\\Issue\\T1-ZZ-DR-A-1003-C01.pdf', 'PDF'); add('C:\\Issue\\T1-ZZ-DR-A-1003-C02.pdf', 'PDF'); add('C:\\Issue\\T1-ZZ-DR-A-1004-C01.pdf', 'PDF');
    LT.saveJson(LT.dataPath('transmittals.json'), { next: 3, prefix: 'TR-', project: 'Tower 1', out: '', log: [
      { no: 'TR-001', date: '2026-10-01', to: 'Client', items: [{ number: 'T1-ZZ-DR-A-1001', rev: 'C01', title: 'GA L1' }, { number: 'T1-ZZ-DR-A-1002', rev: 'C01', title: 'GA L2' }, { number: 'T1-ZZ-DR-A-1004', rev: 'C01', title: 'GA L4' }] },
      { no: 'TR-002', date: '2026-10-20', to: 'Client', items: [{ number: 'T1-ZZ-DR-A-1001', rev: 'P05', title: 'GA L1' }] }] });
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Tower 1' }], current: 'p1' });
    var D = {}; ['1001', '1002', '1003', '1004', '1005'].forEach(n => { D['T1-ZZ-DR-A-' + n] = { num: 'T1-ZZ-DR-A-' + n, title: 'GA ' + n, rev: '', ok: true, typo: '-', tower: 'T1' }; });
    D['T1-ZZ-DR-A-1003'].st = 'In progress'; D['T1-ZZ-DR-A-1003'].stAt = '2026-11-01'; D['T1-ZZ-DR-A-1004'].st = 'Checked'; D['T1-ZZ-DR-A-1004'].stAt = '2026-11-05';
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower 1', setup: {}, rules: [], models: [], history: [], changes: {}, drawings: D }); });
  // revision order
  ok(await page.evaluate(() => { const t = document.createElement('script'); return true; }), 'setup');
  await page.click('.nb[data-k="transmittal"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const tr = page.frame({ url: /transmittal\.html/ });
  ok(await tr.evaluate(() => LT.revCmp('P05', 'C01') < 0 && LT.revCmp('C02', 'C01') > 0 && LT.revCmp('C10', 'C9') > 0 && LT.revCmp('A01', 'C05') > 0 && LT.revCmp('02', '01') > 0), 'revision order: P < C < A, then the number (C10 after C9)');
  await tr.evaluate(() => { load(); addFiles(['C:\\Issue\\T1-ZZ-DR-A-1001-C02.pdf', 'C:\\Issue\\T1-ZZ-DR-A-1002-P01.pdf', 'C:\\Issue\\T1-ZZ-DR-A-1003-C01.pdf', 'C:\\Issue\\T1-ZZ-DR-A-1004-C01.pdf']); });
  const rc = await tr.evaluate(() => docs.map(d => d.number.slice(-4) + ' ' + d.rev + ': ' + d.check.level + ' ' + d.check.text).join('\n'));
  console.log('   ' + rc.replace(/\n/g, '\n   '));
  ok(/1001 C02: ok ↑ from C01 \(TR-001\)/.test(rc), 'C02 after C01 (TR-001): fine (P05 later is lower than C01, so C01 counts)');
  ok(/1002 P01: bad ⚠ Lower than C01 already issued \(TR-001\)/.test(rc), 'P01 after C01 was issued: warning');
  ok(/1003 C01: bad ⚠ C02 is in the folder/.test(rc), 'a newer C02 is in the same folder: warning');
  ok(/1004 C01: warn Same rev as TR-001/.test(rc), 'same rev as already issued: "a re-issue?"');
  ok(/2 revision problems/.test(await tr.evaluate(() => $('cnt').innerText)), 'the count says: 2 revision problems');
  await page.screenshot({ path: out + '/b_revcheck.png' });
  const asked = await tr.evaluate(() => { var m = ''; window.confirm = x => { m = x; return false; }; $('hTo').value = 'Client'; make(); return m; });
  ok(/Revision check - 2 problem\(s\)/.test(asked) && /T1-ZZ-DR-A-1002 P01: Lower than C01/.test(asked), 'Make the transmittal: asks first, listing the problems');
  // Register > Status
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { loadAll(); }); await r.click('#views [data-v="status"]'); await page.waitForTimeout(100);
  const st = await r.evaluate(() => shown.map(k => k.slice(-4) + ':' + dStat(k, P.drawings[k]).st).join(' '));
  ok(st == '1001:Issued 1002:Issued 1003:In progress 1004:Checked 1005:Not started', 'statuses: issued from the transmittal log, set ones after the last issue win: ' + st);
  ok(/Issued P05 · TR-002/.test(await r.evaluate(() => $('res').innerText)), 'Issued shows the last rev, TR and date');
  ok(/Not started 1.*In progress 1.*Checked 1.*Issued 2.*40% issued/.test(await r.evaluate(() => $('sum').innerText)), 'summary: counts per status and % issued');
  await page.screenshot({ path: out + '/b_status.png' });
  await r.click('#sum [data-stf="Not started"]');
  ok(await r.evaluate(() => shown.length == 1 && shown[0].slice(-4) == '1005'), 'click a count: only those drawings');
  await r.click('#res td.st'); await page.waitForTimeout(100); await r.click('#menu .mi >> text=In progress');
  ok(await r.evaluate(() => P.drawings['T1-ZZ-DR-A-1005'].st == 'In progress' && P.drawings['T1-ZZ-DR-A-1005'].stAt == LT.today()), 'click the status: set to In progress (saved with the date)');
  await r.click('#views [data-v="midp"]');
  ok(await r.evaluate(() => !/In progress/.test($('res').querySelector('tr').innerText)), 'other views keep their columns');
};
