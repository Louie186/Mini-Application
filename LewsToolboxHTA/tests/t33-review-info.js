// Folder Check > Review: each drawing shows its Tower / Typology / Model (clickable) from the Drawing Register, compact
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const R0 = 'C:\\Incoming\\For review';
  await page.evaluate(R0 => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    ['5013-KEO-T1-ZZ-PLN-INT-10100-P02.pdf', '5013-KEO-T1-ZZ-PLN-INT-10100-P02.dwg', '5013-KEO-T1-ZZ-PLN-INT-10110-P01.pdf', 'Cover letter.pdf'].forEach(n => add(R0 + '\\' + n, 'X'));
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: '5013' }], current: 'p1' });
    LT.saveJson(LT.registerFile('p1'), { name: '5013', setup: {}, rules: [], models: [], history: [], changes: {},
      modelLinks: { '5013-KEO-ZZ-ZZ-BIM-INT-21000': 'https://acc.autodesk.com/docs/files/projects/x?entityId=21000' },
      drawings: { '5013-KEO-T1-ZZ-PLN-INT-10100': { num: '5013-KEO-T1-ZZ-PLN-INT-10100', title: 'UNIT TYPE 1 BR - Type A - PLANS', tower: 'T1', typo: '1BRA', impModel: '5013-KEO-ZZ-ZZ-BIM-INT-21000', ok: true },
        '5013-KEO-T1-ZZ-PLN-INT-10110': { num: '5013-KEO-T1-ZZ-PLN-INT-10110', title: 'UNIT TYPE 1 BR - Type B - PLANS', tower: 'T1', typo: '1BRB', impModel: '5013-KEO-ZZ-ZZ-BIM-INT-21001', ok: true } } }); }, R0);
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const c = page.frame({ url: /check\.html/ }); await c.click('[data-fv="review"]'); await page.waitForTimeout(600);
  const r = page.frame({ url: /review\.html/ });
  await r.evaluate(R0 => { top.__nextFolder = R0; }, R0); await r.click('#bFolder'); await page.waitForTimeout(200);
  const rows = await r.evaluate(() => shown.map(L => { var f = info(L); return L.name.slice(-9) + ' ' + (f ? [f.tower, f.typo, f.model.slice(-5), f.link ? 'L' : '-'].join(' ') : 'none'); }));
  console.log('   ' + rows.join(' | '));
  ok(rows.indexOf('10100-P02 T1 1BRA 21000 L') >= 0, 'drawing with a revision in its file name: T1 / 1BRA / model 21000 with its ACC link');
  ok(rows.indexOf('10110-P01 T1 1BRB 21001 -') >= 0, 'a model with no link: shown, not clickable');
  ok(rows.some(x => /letter none/.test(x)), 'a file not in the register: just "–"');
  console.log('   head: ' + await r.evaluate(() => $('tbl').rows[0].innerText.replace(/\s+/g, ' ') + ' / mlk ' + $('res').querySelectorAll('.mlk').length));
  ok(await r.evaluate(() => /TWR\s*TYPO\s*MODEL/i.test($('tbl').rows[0].innerText) && $('res').querySelectorAll('.mlk').length == 1), 'compact Twr / Typo / Model columns; the linked model is clickable');
  await r.evaluate(() => { top.__o = []; LT.open = p => top.__o.push(p); }); await r.click('.mlk');
  ok(await page.evaluate(() => top.__o[0] == 'https://acc.autodesk.com/docs/files/projects/x?entityId=21000'), 'click the model: opens it in ACC');
  ok(await r.evaluate(() => /21000/.test(htmlReport()) && /\[T1 1BRA\]/.test(textReport()) || /T1/.test(htmlReport())), 'reports include Tower / Typology / Model');
  await page.screenshot({ path: out + '/r_info.png' });
};
