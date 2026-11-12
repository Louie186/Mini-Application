// Setup > Import an existing drawing list: the Path column at the end makes each Model clickable (Lew's real MIDP list, as CSV)
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  if (!fs.existsSync('/tmp/claude-0/up/midp.csv')) { console.log('SKIP (needs the MIDP list as /tmp/claude-0/up/midp.csv)'); return; }   // the real list is not kept in the repository
  const csv = fs.readFileSync('/tmp/claude-0/up/midp.csv', 'utf8');
  await page.evaluate(csv => { const f = window.__mockFs; f.files['c:\\data\\20261112_midp_list.csv'] = { path: 'C:\\Data\\20261112_MIDP_LIST.csv', text: csv, time: Date.now() }; f.dirs['c:\\data'] = 'C:\\Data';
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: '5013' }], current: 'p1' });
    LT.saveJson(LT.registerFile('p1'), { name: '5013', setup: { sheet: 'INT', towerPart: 0 }, rules: [], models: [], history: [], changes: {}, drawings: {} }); }, csv);
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { loadAll(); LT.pickFile = cb => cb('C:\\Data\\20261112_MIDP_LIST.csv'); });
  await r.click('#bSetup'); await r.click('#sListImp'); await page.waitForTimeout(400);
  const cols = await r.evaluate(() => [$('iNum').value, $('iTitle').value, $('iTower').value, $('iTypo').value, $('iModel').value, $('iLink').value].join(' | '));
  console.log('   columns: ' + cols);
  ok(cols == 'DRAWING NUMBER | DESCRIPTION | TOWER | TYPOLOGY | MODEL | Path', 'every column found by itself, the Path column too');
  ok(/433 with a path/.test(await r.evaluate(() => $('impPrev').innerText)), 'the preview counts the rows with a path (433)');
  await page.screenshot({ path: out + '/p_import.png' });
  await r.click('#iOk'); await page.waitForTimeout(300);
  const st = await r.evaluate(() => { var n = 0, ml = Object.keys(P.modelLinks || {}).length; for (var k in P.drawings) n++; return [n, ml, $('toast').innerText]; });
  console.log('   ' + st.join(' | '));
  ok(st[0] > 1000 && st[1] == 66, 'imported: ' + st[0] + ' drawings, 66 models with their ACC link');
  await r.evaluate(() => { view = 'all'; render(); });
  const d = await r.evaluate(() => { var k = 'T1-ZZ-PLN-INT-10100'; for (var x in P.drawings) if (/T1-ZZ-PLN-INT-10100$/.test(x)) k = x; var d = P.drawings[k]; return [modelOf(d), modelLink(modelOf(d))]; });
  ok(d[0] == '5013-KEO-ZZ-ZZ-BIM-INT-21000' && /entityId=urn:adsk\.wipprod:dm\.lineage:81zCO7P5QXOSvWouL_K6Lw/.test(d[1]), 'drawing 10100: model 21000, its ACC link');
  ok(await r.evaluate(() => $('res').querySelectorAll('.mlk').length) > 100, 'the Model column in the register is clickable');
  // the List lookup
  await r.click('#views [data-v="look"]');
  await r.fill('#lkText', '5013-KEO-T1-ZZ-PLN-INT-10100\n5013-KEO-T1-ZZ-PLN-INT-10110\n5013-KEO-PD-ZZ-BIM-INT-10001'); await r.click('#lkGo'); await page.waitForTimeout(200);
  const lk = await r.evaluate(() => P.lookup.rows.map(x => x.model + ' ' + (x.link ? 'LINK' : '-')));
  console.log('   ' + lk.join(' / '));
  ok(lk[0] == '5013-KEO-ZZ-ZZ-BIM-INT-21000 LINK' && lk[1] == '5013-KEO-ZZ-ZZ-BIM-INT-21001 LINK', 'List lookup: models are links');
  await r.evaluate(() => { top.__o = []; LT.open = p => top.__o.push(p); }); await r.click('.mlk >> nth=0');
  ok(await page.evaluate(() => /^https:\/\/acc\.autodesk\.com\/docs\/files\/projects\//.test(top.__o[0] || '')), 'click the model: opens it in ACC');
  await page.screenshot({ path: out + '/p_lookup.png' });
};
