// Folder Contents as a quick checklist check: finished / missing / lacking a file type / extra (made-up data)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const P = '5013-KEO-T1-ZZ-PLN-INT-';
    [P + '10100-T1.pdf', P + '10100-T1.dwg', P + '10101-T1.pdf', 'CAD\\' + P + '10110-T2.dwg', 'CAD\\' + P + '10110-T2.pdf', P + '19999-T1.pdf', '20261101_' + P + '10120-T1.pdf', '20261101_' + P + '10120-T1.dwg'].forEach(n => add('C:\\Sub\\' + n, 'x'));
  });
  await page.click('.nb[data-k="contents"]'); await page.waitForTimeout(400);
  const f = page.frame({ url: /contents\.html/ });
  await f.evaluate(() => { top.__nextFolder = 'C:\\Sub'; });
  await f.click('#bFolder'); await page.waitForTimeout(200);
  await f.click('#aPaste'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => $('pasteDlg').style.display == 'block'), 'Paste a list opens a box');
  await f.fill('#pText', 'Drawing No.\tTitle\n5013-KEO-T1-ZZ-PLN-INT-10100\tUnit 1BR A - setting out\n5013-KEO-T1-ZZ-PLN-INT-10101\tUnit 1BR A - finishes\n5013-KEO-T1-ZZ-PLN-INT-10110-T1  Unit 1BR B - setting out\n5013-KEO-T1-ZZ-PLN-INT-10120\n5013-KEO-T1-ZZ-PLN-INT-10130\tUnit 1BR D\n10140\n\n');
  await f.click('#pOk'); await page.waitForTimeout(300);
  const st2 = await f.evaluate(() => result.items.map(x => x.st).join(','));
  ok(st2 == 'done,done,done,done,missing,missing', 'any file is enough: 4 finished (incl. other revision, dated name), 2 missing: ' + st2);
  ok(await f.evaluate(() => $('show').value == 'left' && shown.length == 2 && /Missing/.test($('res').innerText)), 'opens on Remaining: the 2 missing');
  const prog = await f.evaluate(() => $('progTxt').innerText + ' | ' + $('chips').innerText);
  console.log('   ' + prog.replace(/\s+/g, ' '));
  ok(await f.evaluate(() => $('bar').offsetHeight > 5 && $('chips').offsetHeight > 10) && /4 of 6 finished \(66%\)/.test(prog) && /Remaining 2/.test(prog) && /Finished 4/.test(prog) && /not on the checklist 1/.test(prog), 'progress and buttons: 4 of 6, remaining 2, finished 4, extra 1');
  await page.screenshot({ path: out + '/m_check_left.png' });
  // needs pdf + dwg
  await f.fill('#need', 'pdf, dwg'); await f.press('#need', 'Tab'); await page.waitForTimeout(200);
  const st3 = await f.evaluate(() => result.items.map(x => x.st + (x.lack.length ? '(' + x.lack.join('+') + ')' : '')).join(','));
  ok(st3 == 'done,lacking(dwg),done,done,missing,missing', 'needs pdf + dwg: 10101 lacking dwg: ' + st3);
  ok(await f.evaluate(() => shown.length == 3 && /Lacking dwg/.test($('res').innerText)), 'Remaining shows missing + lacking (3)');
  await page.screenshot({ path: out + '/m_check_lacking.png' });
  await f.click('#chips [data-v="done"]'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => shown.length == 3 && $('show').value == 'done'), 'Finished button: 3 finished');
  await f.click('#chips [data-v="noref"]'); await page.waitForTimeout(100);
  ok(await f.evaluate(() => shown.length == 1 && /19999/.test(shown[0].base)), 'In the folder, not on the checklist: 19999');
  const txt = await f.evaluate(() => remainingText());
  ok(/3 of 6 finished, 3 remaining/.test(txt) && /MISSING \(2\)/.test(txt) && /10130 – Unit 1BR D/.test(txt) && /LACKING A FILE TYPE \(1\)/.test(txt) && /10101 – needs dwg/.test(txt), 'copy remaining: missing + lacking lists');
  await f.click('#chips [data-v="left"]');
  const csv = await f.evaluate(() => checklistOut().map(r => r.slice(0, 3).join('|')).join(' / '));
  ok(/2\|Lacking a file type\|5013-KEO-T1-ZZ-PLN-INT-10101/.test(csv) && /5\|Missing\|/.test(csv) && !/Finished/.test(csv), 'CSV of what is shown (remaining) with the checklist No.');
  // type in the box, then click a button straight away: both count
  await f.fill('#need', 'pdf'); await f.click('#chips [data-v="done"]'); await page.waitForTimeout(200);
  ok(await f.evaluate(() => $('show').value == 'done' && count('done') == 4 && shown.length == 4), 'type "pdf" then click Finished at once: 4 finished shown');
  await f.fill('#need', 'pdf, dwg'); await f.click('#chips [data-v="left"]'); await page.waitForTimeout(200);
  // remembered
  await f.evaluate(() => { load(); paths(); run(); });
  ok(await f.evaluate(() => result.items.length == 6 && $('show').value == 'left' && $('need').value == 'pdf, dwg'), 'pasted checklist, needs and view are remembered');
};
