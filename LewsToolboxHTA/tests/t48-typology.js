// Drawing Register > Models: Typology -> model lookup (type or paste typologies, pick a tower) + Ctrl+K finds a model by its typology
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Akala' }], current: 'p1' });
    var D = {}; ['1BR-A', '1BR-A', '2BR-B', 'Studio'].forEach((t, i) => { var k = 'T1-ZZ-DR-A-' + (5000 + i); D[k] = { num: k, title: 'Unit ' + i, ok: true, tower: 'T1', typo: t }; });
    D['T2-ZZ-DR-A-6000'] = { num: 'T2-ZZ-DR-A-6000', title: 'T2 unit', ok: true, tower: 'T2', typo: '1BR-A' };
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', setup: {}, rules: [], history: [], changes: {}, drawings: D, sets: [],
      models: [{ tower: 'T1', typo: '1BR-A', model: 'AKL-T1-1BRA-M3D' }, { tower: 'T1', typo: '2BR-B', model: 'AKL-T1-2BRB-M3D' }, { tower: 'T2', typo: '1BR-A', model: 'AKL-T2-1BRA-M3D' }, { tower: 'T1', typo: 'Studio', model: 'AKL-T1-STU-M3D' }] }); });
  await page.click('.nb[data-k="register"]'); await page.mouse.move(900, 690); await page.waitForTimeout(800);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { view = 'models'; render(); }); await page.waitForTimeout(150);
  ok(await r.evaluate(() => !!$('tlIn') && /typology → model pairs known/i.test($('tlRes').innerText)), 'Models view has a Typology → model lookup');
  const type = async (t, tw) => { await r.evaluate(([t, tw]) => { $('tlIn').value = t; if (tw != null) $('tlTw').value = tw; $('tlIn').onkeyup(); }, [t, tw]); await page.waitForTimeout(80); return r.evaluate(() => $('tlRes').innerText); };
  let t = await type('1BR-A', '');
  ok(/AKL-T1-1BRA-M3D/.test(t) && /AKL-T2-1BRA-M3D/.test(t) && !/2BRB/.test(t), 'type a typology: its model in every tower');
  ok(await r.evaluate(() => typoLook('1BR-A').filter(x => x.tower == 'T1')[0].n == 2), 'and how many drawings use it');
  t = await type('1BR-A', 'T2');
  ok(/AKL-T2-1BRA-M3D/.test(t) && !/AKL-T1-1BRA/.test(t), 'pick a tower: only that tower');
  t = await type('1bra\n2BR B\nstudio\n3BR', '');
  ok(/AKL-T1-1BRA-M3D/.test(t) && /AKL-T1-2BRB-M3D/.test(t) && /AKL-T1-STU-M3D/.test(t), 'paste a list: one row each - case, spaces and dashes don\'t matter');
  ok(/3BR\s+No model for this typology/.test(t), 'a typology with no model says so');
  t = await type('2BR', '');
  ok(/AKL-T1-2BRB-M3D/.test(t) && /close match/.test(t), 'part of a name: the close matches, marked "close match"');
  await r.click('#tlCopy'); const clip = await page.evaluate(() => top.__clip);
  ok(/^Typology\tTower\tModel/.test(clip) && /2BR\tT1\tAKL-T1-2BRB-M3D/.test(clip), 'Copy (for Excel): typology, tower, model in columns');
  await page.screenshot({ path: out + '/typology_lookup.png' });
  await r.evaluate(() => { render(); });
  ok(await r.evaluate(() => $('tlIn').value == '2BR' && JSON.parse(LT.readText(LT.registerFile('p1'))).tlook.text == '2BR'), 'what you typed is kept with the project');
  await r.click('#tlClr'); ok(/pairs known/.test(await r.evaluate(() => $('tlRes').innerText)), 'Clear empties it');
  // Ctrl+K: a typology finds its model
  await page.evaluate(() => { LTMain.search(); LT.$('qsIn').value = 'studio'; qsFind(); });
  ok(/Model\s*Studio\s*AKL-T1-STU-M3D/.test(await page.evaluate(() => LT.$('qsRes').innerText)), 'Ctrl+K: type a typology - the model comes up');
  await r.evaluate(() => { view = 'midp'; render(); });
  await page.evaluate(() => { var i = qsHits.findIndex(x => x.kind == 'Model'); qsGo(i); }); await page.waitForTimeout(400);
  ok(await r.evaluate(() => view == 'models' && $('tlIn').value == 'Studio' && /AKL-T1-STU-M3D/.test($('tlRes').innerText)), '... and opens the lookup with it');
};
