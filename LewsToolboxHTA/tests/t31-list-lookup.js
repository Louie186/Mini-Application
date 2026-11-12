// Drawing Register > List lookup: paste / load numbers (+ descriptions) -> Tower, Typology, Model (clickable), export for checking
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('M:\\Models\\Tower 1\\T1-1BRA-Unit Model.rvt', 'RVT'); add('M:\\Models\\Tower 1\\T1-1BRA-Unit Model.0001.rvt', 'BAK');
    LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Tower 1' }], current: 'p1' });
    var D = {}, put = (n, title, typo, ok) => { D[n] = { num: n, title: title, cat: 'UNITS', tower: 'T1', typo: typo, ok: ok !== false }; };
    put('T1-ZZ-DR-A-2101', 'UNIT TYPE 1 BR - TYPE A - PLAN', '1BRA'); put('T1-ZZ-DR-A-2201', 'UNIT TYPE 2 BR - TYPE B - PLAN', '2BRB');
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower 1', setup: { towerPart: 0 }, rules: [{ find: 'Unit Type {n} BR - Type {x}', typo: '{n}BR{x}' }], history: [], changes: {}, drawings: D,
      models: [{ tower: 'T1', typo: '1BRA', model: 'T1-1BRA-Unit Model', link: '' }, { tower: 'T1', typo: '2BRB', model: 'T1-2BRB-Unit Model', link: 'https://acc.example.com/models/2brb' }] }); });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { loadAll(); });
  // Setup: models folder
  await r.click('#bSetup'); await r.evaluate(() => { top.__nextFolder = 'M:\\Models'; }); await r.click('#sModDirB');
  ok(/T1-2BRB-Unit Model \| https:\/\/acc\.example\.com\/models\/2brb/.test(await r.evaluate(() => $('sModels').value)), 'Setup: models table has a 4th column for the link');
  await r.click('#sOk');
  await r.click('#views [data-v="look"]'); await page.waitForTimeout(100);
  await r.fill('#lkText', 'T1-ZZ-DR-A-2101-P02\tUnit plan\nT1-ZZ-DR-A-2201\nT1-ZZ-DR-A-2301\tUnit Type 1 BR - Type A - Enlarged kitchen\nT1-ZZ-DR-A-9999');
  await r.click('#lkGo'); await page.waitForTimeout(150);
  const rows = await r.evaluate(() => P.lookup.rows.map(x => [x.num.split('-A-')[1], x.tower, x.typo, x.model, x.src, x.link ? 'L' : '-'].join(' ')));
  console.log('   ' + rows.join('\n   '));
  ok(/^2101-P02 T1 1BRA T1-1BRA-Unit Model register L$/.test(rows[0]), 'in the register (the revision ignored): T1 / 1BRA / model - linked to the .rvt in the models folder');
  ok(/^2201 T1 2BRB T1-2BRB-Unit Model register L$/.test(rows[1]), 'model link from the models table (ACC)');
  ok(/^2301 T1 1BRA T1-1BRA-Unit Model guess: like T1-ZZ-DR-A-2101/.test(rows[2]), 'not in the register, but described: guessed (1BRA) from the description');
  ok(/9999.*not found/.test(rows[3]), 'unknown, no description: "not found"');
  ok(await r.evaluate(() => P.lookup.rows[0].link == 'M:\\Models\\Tower 1\\T1-1BRA-Unit Model.rvt'), 'the .rvt itself, not its backup (.0001.rvt)');
  ok(await r.evaluate(() => $('res').querySelectorAll('.mlk').length == 3 && /1 guessed/.test($('sum').innerText) && /1 not in the register/.test($('sum').innerText)), 'result: models clickable, guesses and unknowns counted');
  await page.screenshot({ path: out + '/l_lookup.png' });
  // remembered + click opens
  await r.evaluate(() => { loadAll(); view = 'look'; render(); top.__opened = []; LT.open = p => top.__opened.push(p); });
  await r.click('.mlk[data-ml="T1-2BRB-Unit Model"]');
  ok(await page.evaluate(() => top.__opened[0] == 'https://acc.example.com/models/2brb'), 'remembered; clicking a model opens it');
  // exports (no Excel here: CSV with HYPERLINK; HTML with links)
  await r.evaluate(() => { lookExcel(); lookHtml(); });
  const ex = await page.evaluate(() => Object.values(window.__mockFs.files).filter(f => /Drawing list_Tower 1_/.test(f.path)).map(f => f.path + '\n' + f.text));
  ok(ex.some(t => /\.csv\n/.test(t) && /=HYPERLINK\(""file:\/\/\/M:\/Models\/Tower 1\/T1-1BRA-Unit Model\.rvt"",""T1-1BRA-Unit Model""\)/.test(t) && /Checked/.test(t)), 'Excel / CSV for checking: model as a link, Checked + Comments columns');
  ok(ex.some(t => /\.html\n/.test(t) && /<a href="https:\/\/acc\.example\.com\/models\/2brb">T1-2BRB-Unit Model<\/a>/.test(t) && /type="checkbox"/.test(t)), 'HTML page: clickable models, a tick box per drawing');
  // the other views still work after My sets
  await r.click('#views [data-v="sets"]'); await r.click('#views [data-v="midp"]');
  await r.click('#res tr[data-k] td.tk'); 
  ok(await r.evaluate(() => Object.keys(ticked).length == 1), 'after My sets, ticking rows in the list still works');
  // the models list with a Path column (ACC): imported, ACC paths found through the Desktop Connector folder, the lookup's links follow
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('C:\\Users\\lew\\DC\\ACCDocs\\KEO\\5013 Tower\\Project Files\\03 WIP\\ARC\\T1-2BRB-Unit Model.rvt', 'RVT');
    add('C:\\Data\\Models.csv', 'Tower,Typology,Model,Path\r\nT1,1BRA,T1-1BRA-Unit Model,https://acc.autodesk.com/docs/files/projects/abc?entityId=1bra\r\nT1,2BRB,T1-2BRB-Unit Model,5013 Tower/Project Files/03 WIP/ARC/T1-2BRB-Unit Model.rvt\r\nT1,3BRC,T1-3BRC-Unit Model,Project Files/03 WIP/ARC/missing.rvt\r\n'); });
  await r.click('#views [data-v="look"]'); await r.click('#bSetup');
  await r.evaluate(() => { top.__nextFile = 'C:\\Data\\Models.csv'; LT.pickFile = cb => cb(top.__nextFile); }); await r.click('#sModImp'); await page.waitForTimeout(150);
  ok(await r.evaluate(() => $('iLinkF').style.display == '' && $('iLink').value == 'Path' && /T1-2BRB-Unit Model\.rvt/.test($('impPrev').innerText)), 'models import: the Path column is picked by itself and previewed');
  await r.click('#iOk');
  ok(/T1-2BRB-Unit Model \| 5013 Tower\/Project Files/.test(await r.evaluate(() => $('sModels').value)), 'the paths are in the models table (4th part)');
  await r.evaluate(() => { top.__nextFolder = 'C:\\Users\\lew\\DC\\ACCDocs\\KEO'; }); await r.click('#sAccB'); await r.click('#sOk'); await page.waitForTimeout(100);
  const L2 = await r.evaluate(() => P.lookup.rows.map(x => x.model + ' => ' + x.link));
  console.log('   ' + L2.join('\n   '));
  ok(L2[0] == 'T1-1BRA-Unit Model => https://acc.autodesk.com/docs/files/projects/abc?entityId=1bra', 'a web link from the Path column: the model opens it in ACC');
  ok(L2[1] == 'T1-2BRB-Unit Model => C:\\Users\\lew\\DC\\ACCDocs\\KEO\\5013 Tower\\Project Files\\03 WIP\\ARC\\T1-2BRB-Unit Model.rvt', 'an ACC path: found through the Desktop Connector folder; the List lookup updated by itself');
  ok(await r.evaluate(() => $('res').querySelectorAll('.mlk').length >= 3), 'the models in the lookup are links');
};
