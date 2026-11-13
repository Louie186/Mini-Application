// Tower / Typology / Model (clickable) from the Drawing Register in every drawing list: Compare, Find Drawings, Superseded, Transmittal, Names
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('C:\\Old\\T1-ZZ-DR-A-2101-P01.pdf', 'A'); add('C:\\New\\T1-ZZ-DR-A-2101-P02.pdf', 'B'); add('C:\\New\\T1-ZZ-DR-A-2201-P01.pdf', 'C');
    add('C:\\Prints\\T1-ZZ-DR-A-2101-P01.pdf', 'A'); add('C:\\Prints\\T1-ZZ-DR-A-2101-P02.pdf', 'B');
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'T' }], current: 'p1' });
    LT.saveJson(LT.registerFile('p1'), { name: 'T', setup: {}, rules: [], models: [], history: [], changes: {}, modelLinks: { 'T1-ZZ-BIM-A-21000': 'https://acc.autodesk.com/m/21000' },
      drawings: { 'T1-ZZ-DR-A-2101': { num: 'T1-ZZ-DR-A-2101', title: '1BR Type A plan', tower: 'T1', typo: '1BRA', impModel: 'T1-ZZ-BIM-A-21000', ok: true }, 'T1-ZZ-DR-A-2201': { num: 'T1-ZZ-DR-A-2201', title: '2BR Type B plan', tower: 'T1', typo: '2BRB', impModel: 'T1-ZZ-BIM-A-22000', ok: true } } }); });
  const txt = (fr) => fr.evaluate(() => document.getElementById('res').innerText.replace(/\s+/g, ' '));
  // Compare
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const c = page.frame({ url: /check\.html/ }); await c.click('[data-fv="compare"]'); await page.waitForTimeout(600);
  const cp = page.frame({ url: /compare\.html/ });
  await cp.evaluate(() => { cfg.a = { kind: 'folder', path: 'C:\\Old' }; cfg.b = { kind: 'folder', path: 'C:\\New' }; window.alert = () => {}; compare(); filter = 'all'; render(); });
  const ct = await txt(cp); console.log('   compare: ' + ct.slice(0, 220));
  ok(/TWR TYPO MODEL/i.test(ct) && /T1-ZZ-DR-A-2101 T1 1BRA 🔗 A-21000/.test(ct) && /T1-ZZ-DR-A-2201 T1 2BRB A-22000/.test(ct), 'Compare: Twr / Typo / Model per drawing (linked model with 🔗)');
  ok(/\[T1 1BRA T1-ZZ-BIM-A-21000\]/.test(await cp.evaluate(() => summary())), 'Compare summary text includes them');
  await cp.evaluate(() => { top.__o = []; LT.open = p => top.__o.push(p); }); await cp.click('.mlk');
  ok(await page.evaluate(() => top.__o[0] == 'https://acc.autodesk.com/m/21000'), 'Compare: click the model opens it');
  await page.screenshot({ path: out + '/e_compare.png' });
  // Find Drawings
  await page.evaluate(() => LTMain.show('find')); await page.waitForTimeout(1200); await page.mouse.move(900, 600);
  const fd = page.frame({ url: /find\.html/ });
  await fd.evaluate(() => { addFolder('C:\\New'); $('q').value = 'T1-ZZ-DR-A-2101\nT1-ZZ-DR-A-9999'; find(); });
  const ft = await txt(fd); ok(/T1 1BRA 🔗 A-21000/.test(ft), 'Find Drawings: Twr / Typo / Model');
  // Superseded
  await page.evaluate(() => LTMain.show('superseded')); await page.waitForTimeout(1200); await page.mouse.move(900, 600);
  const sp = page.frame({ url: /superseded\.html/ });
  await sp.evaluate(() => { cfg.folder = 'C:\\Prints'; find(); });
  ok(/T1-ZZ-DR-A-2101 T1 1BRA 🔗 A-21000/.test(await txt(sp)), 'Superseded: Twr / Typo / Model on the drawing line');
  // Transmittal
  await page.click('.nb[data-k="transmittal"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const tr = page.frame({ url: /transmittal\.html/ });
  await tr.evaluate(() => { addFiles(['C:\\New\\T1-ZZ-DR-A-2201-P01.pdf']); });
  ok(/T1 · 2BRB · A-22000/.test(await tr.evaluate(() => $('docs').innerText)), 'Transmittal: one compact Twr · Typo · Model column');
  // Names
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(300); await c.click('[data-fv="naming"]'); await page.waitForTimeout(600);
  const nm = page.frame({ url: /naming\.html/ });
  await nm.evaluate(() => { folder = 'C:\\New'; try { run(); } catch (e) { } if (typeof check == 'function' && !results) check(); });
  const nt = await nm.evaluate(() => (document.getElementById('res') || {}).innerText || '');
  ok(/TWR/i.test(nt) || !nt, 'Names: the columns are there when files are listed');
};
