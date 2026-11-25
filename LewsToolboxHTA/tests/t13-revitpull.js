// Pull from Revit: paste drawings, send the request, read Revit's result back
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const go = async k => { await page.click('.nb[data-k="' + k + '"]'); await page.waitForTimeout(500); return page.frame({ url: new RegExp(k + '\\.html') }); };
  const f = await go('revitpull');
  ok(!!f, 'tab found in the menu');
  await f.fill('#paste', '5013-KEO-T1-ZZ-PLN-INT-10200-T2\n5013-KEO-T1-ZZ-PLN-INT-10201-T2.pdf\nC:\\Sub\\5013-KEO-T1-ZZ-SEC-INT-30200-T1.dwg\n10202\n5013-KEO-T1-ZZ-PLN-INT-10200-T2');
  await f.click('#bAdd'); await page.waitForTimeout(200);
  const rows = await f.evaluate(() => cfg.rows.map(r => r.code + '|' + r.rev + '|' + r.seq));
  console.log('   ' + rows.join('\n   '));
  ok(rows.length == 4 && rows[0] == '5013-KEO-T1-ZZ-PLN-INT-10200|T2|10200' && rows[2] == '5013-KEO-T1-ZZ-SEC-INT-30200|T1|30200', 'codes split from revisions, file names and paths cleaned, duplicate ignored');
  ok(await f.evaluate(() => cfg.rows[3].note.indexOf('MIDP') > 0), 'bare number flagged (needs MIDP in Revit)');
  await f.evaluate(() => { const i = document.querySelectorAll('input.mod')[0]; i.value = 'T1-ARC'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await f.evaluate(() => { cfg.out = 'C:\\Sub'; cfg.dwg = false; sumLine(); });
  await f.click('#bSend'); await page.waitForTimeout(200);
  const req = await page.evaluate(() => Object.values(window.__mockFs.files).filter(x => /\\bimexport\\requests\\toolbox_.*\.csv$/i.test(x.path)));
  ok(req.length == 1, 'request file written to %APPDATA%\\BIMExport\\Requests');
  const txt = req.length ? req[0].text.replace(/^\uFEFF/, '') : '';
  console.log('   ' + txt.split('\r\n').join('\n   '));
  ok(/^DrawingNumber,ExpectedRev,Title,Model,OutputFolder,Formats,RequestedOn/.test(txt) && txt.indexOf('5013-KEO-T1-ZZ-PLN-INT-10200-T2,T2,,T1-ARC,C:\\Sub,PDF,') > 0, 'request columns + first row (rev, model, folder, PDF only)');
  ok(await f.evaluate(() => $('res').innerText.indexOf('WAITING') >= 0), 'shows the request as waiting');
  // Revit's answer
  const name = req[0].path.replace(/^.*\\/, '').replace(/\.csv$/i, '');
  await page.evaluate((name) => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const R = 'C:\\Users\\lew\\AppData\\Roaming\\BIMExport\\Requests\\';
    const old = R + name + '.csv'; fs.files[(R + 'Done\\' + name + '.csv').toLowerCase()] = Object.assign({}, fs.files[old.toLowerCase()], { path: R + 'Done\\' + name + '.csv' }); delete fs.files[old.toLowerCase()];
    add(R + 'Done\\' + name + '.result.csv', '\uFEFF"DrawingNumber","SheetNumber","ExpectedRev","RevitRev","Model","Status","PDFFile","DWGFile","Note","DoneOn"\r\n' +
      '"5013-KEO-T1-ZZ-PLN-INT-10200-T2","10200","T2","T2","T1-ARC","PRINTED","C:\\Sub\\5013-KEO-T1-ZZ-PLN-INT-10200-T2.pdf","","5013-KEO-T1-ZZ-PLN-INT-10200-T2","now"\r\n' +
      '"5013-KEO-T1-ZZ-PLN-INT-10201-T2","10201","T2","T1","T1-ARC","BLOCKED","","","Toolbox expects T2, Revit has T1 - add the T2 revision","now"\r\n'); }, name);
  await f.click('#bRef'); await page.waitForTimeout(200);
  const res = await f.evaluate(() => $('res').innerText);
  ok(res.indexOf('1 of 2 printed') >= 0 && res.indexOf('BLOCKED') >= 0 && res.indexOf('WAITING') < 0, 'result read back: 1 printed, 1 blocked');
  await page.screenshot({ path: out + '/h_revitpull.png' });
};
