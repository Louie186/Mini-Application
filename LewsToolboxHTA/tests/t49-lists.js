// Typology lookup -> "My list" (drag, your order, reorder) -> task checklist / set; My sets keep your order (drop before, reorder) -> task checklist
module.exports = async ({ page, out, drag }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { LT.mkdirs(LT.dataPath('register')); LT.saveJson(LT.dataPath('register.json'), { projects: [{ id: 'p1', name: 'Akala' }], current: 'p1' });
    var D = {}, add = (k, tw, ty) => { D[k] = { num: k, title: 'Unit ' + k.slice(-4), ok: true, tower: tw, typo: ty }; };
    add('T1-ZZ-DR-A-5001', 'T1', '1BR-A'); add('T1-ZZ-DR-A-5002', 'T1', '1BR-A'); add('T2-ZZ-DR-A-6001', 'T2', '1BR-A'); add('T3-ZZ-DR-A-7001', 'T3', '1BR-A'); add('T1-ZZ-DR-A-5100', 'T1', '2BR-B');
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', setup: {}, rules: [], history: [], changes: {}, drawings: D, sets: [],
      models: [{ tower: 'T1', typo: '1BR-A', model: 'M-T1-1BRA' }, { tower: 'T2', typo: '1BR-A', model: 'M-T2-1BRA' }, { tower: 'T3', typo: '1BR-A', model: 'M-T3-1BRA' }, { tower: 'T1', typo: '2BR-B', model: 'M-T1-2BRB' }] }); });
  await page.click('.nb[data-k="register"]'); await page.mouse.move(900, 690); await page.waitForTimeout(800);
  const r = page.frame({ url: /register\.html/ });
  await r.evaluate(() => { window.confirm = () => true; window.prompt = (m, d) => d; view = 'models'; render(); $('tlIn').value = '1bra'; $('tlIn').onkeyup(); }); await page.waitForTimeout(150);
  const bag = () => r.evaluate(() => tlList().map(x => x.model).join(','));
  ok(await r.evaluate(() => document.querySelectorAll('#tlRes .dragme').length == 3 && /My list/.test($('tlBag').innerText)), 'search 1bra: 3 results on the left, "My list" on the right');
  await drag(r, '#tlRes [data-tl="1"]', '#tlBag'); await page.waitForTimeout(100);
  await drag(r, '#tlRes [data-tl="0"]', '#tlBag'); await page.waitForTimeout(100);
  ok(await bag() == 'M-T2-1BRA,M-T1-1BRA', 'drag results to the right: they line up in the order you drop them');
  ok(await r.evaluate(() => document.querySelectorAll('#tlRes .ins').length == 2), 'what is already in the list is dimmed on the left');
  await drag(r, '#tlRes [data-tl="2"]', '#tlBag [data-li="0"]'); await page.waitForTimeout(100);
  ok(await bag() == 'M-T3-1BRA,M-T2-1BRA,M-T1-1BRA', 'drop on an item: it goes before that one');
  await drag(r, '#tlBag [data-li="2"]', '#tlBag [data-li="1"]'); await page.waitForTimeout(100);
  ok(await bag() == 'M-T3-1BRA,M-T1-1BRA,M-T2-1BRA', 'drag inside the list: reorder');
  await r.evaluate(() => { $('tlIn').value = '2BR'; $('tlIn').onkeyup(); }); await page.waitForTimeout(80);
  await r.evaluate(() => { var e = document.createEvent('MouseEvents'); e.initEvent('dblclick', true, true); document.querySelector('#tlRes [data-tl="0"]').dispatchEvent(e); }); await page.waitForTimeout(80);
  ok(await bag() == 'M-T3-1BRA,M-T1-1BRA,M-T2-1BRA,M-T1-2BRB', 'a new search keeps the list: add more (double-click adds to the end)');
  await drag(r, '#tlBag [data-li="3"]', '#tlRes'); await page.waitForTimeout(100);
  ok(await bag() == 'M-T3-1BRA,M-T1-1BRA,M-T2-1BRA', 'drag back to the left: taken out');
  ok(await r.evaluate(() => JSON.parse(LT.readText(LT.registerFile('p1'))).tlook.list.length == 3), 'the list is kept with the project');
  await page.screenshot({ path: out + '/my_list.png' });
  await r.click('#tlSet'); await page.waitForTimeout(150);
  ok(await r.evaluate(() => { var s = P.sets[P.sets.length - 1]; return s.keys.join(',') == 'T3-ZZ-DR-A-7001,T1-ZZ-DR-A-5001,T1-ZZ-DR-A-5002,T2-ZZ-DR-A-6001'; }), 'Save as a set: the models\' drawings, model by model in your order');
  await r.evaluate(() => { view = 'models'; render(); }); await r.click('#tlTask'); await page.waitForTimeout(900);
  const tk = page.frame({ url: /tracker\.html/ });
  const t1 = await tk.evaluate(() => { var t = data.tasks[data.tasks.length - 1]; return { title: t.title, subs: t.subs.map(x => x.title), codes: t.subs.map(x => x.code), ref: (t.subs[0].refs[0] || {}).kind, proj: t.project }; });
  ok(/Check models – 1BR-A \+2/.test(t1.title) && t1.subs.join('|') == 'M-T3-1BRA (T3 · 1BR-A)|M-T1-1BRA (T1 · 1BR-A)|M-T2-1BRA (T2 · 1BR-A)' && t1.proj == 'Akala', 'Task checklist: a new task in Tasks, its checklist in your order');
  ok(t1.codes[0] && /\.1$/.test(t1.codes[0]) && await page.evaluate(() => document.querySelector('.nb.on').getAttribute('data-k') == 'tracker') && await tk.evaluate(() => $('ovEdit') ? $('ovEdit').style.display != 'none' : true), 'Tasks opens the new task to set the date and who');
  await tk.evaluate(() => { var o = document.querySelectorAll('.ov'); for (var i = 0; i < o.length; i++) o[i].style.display = 'none'; });

  // ---------- My sets: your order ----------
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(400);
  await r.evaluate(() => { P.sets = [{ id: 's1', name: 'Serviced units', keys: [], made: LT.today() }]; curSet = 's1'; saveP(); view = 'sets'; render(); }); await page.waitForTimeout(150);
  const keys = () => r.evaluate(() => setOf('s1').keys.join(','));
  const L = k => '.pl[data-pane="L"] [data-key="' + k + '"]', R = k => '.pl[data-pane="R"] [data-key="' + k + '"]';
  await drag(r, L('T2-ZZ-DR-A-6001'), '.pl[data-pane="R"]'); await page.waitForTimeout(150);
  await drag(r, L('T1-ZZ-DR-A-5001'), '.pl[data-pane="R"]'); await page.waitForTimeout(150);
  ok(await keys() == 'T2-ZZ-DR-A-6001,T1-ZZ-DR-A-5001' && await r.evaluate(() => [...document.querySelectorAll('.pl[data-pane="R"] .dr')].map(d => d.getAttribute('data-key')).join(',')) == 'T2-ZZ-DR-A-6001,T1-ZZ-DR-A-5001', 'My sets: the set shows the drawings in the order you dropped them (not by number)');
  await drag(r, L('T3-ZZ-DR-A-7001'), R('T2-ZZ-DR-A-6001')); await page.waitForTimeout(150);
  ok(await keys() == 'T3-ZZ-DR-A-7001,T2-ZZ-DR-A-6001,T1-ZZ-DR-A-5001', 'drop on a drawing in the set: it goes before that one');
  await drag(r, R('T1-ZZ-DR-A-5001'), R('T3-ZZ-DR-A-7001')); await page.waitForTimeout(150);
  ok(await keys() == 'T1-ZZ-DR-A-5001,T3-ZZ-DR-A-7001,T2-ZZ-DR-A-6001', 'drag inside the set: reorder');
  await page.screenshot({ path: out + '/set_order.png' });
  await r.click('#stTask'); await page.waitForTimeout(900);
  const t2 = await tk.evaluate(() => { var t = data.tasks[data.tasks.length - 1]; return { title: t.title, subs: t.subs.map(x => x.title + '/' + x.dwg) }; });
  ok(t2.title == 'Serviced units' && t2.subs.join('|') == 'T1-ZZ-DR-A-5001 – Unit 5001/T1-ZZ-DR-A-5001|T3-ZZ-DR-A-7001 – Unit 7001/T3-ZZ-DR-A-7001|T2-ZZ-DR-A-6001 – Unit 6001/T2-ZZ-DR-A-6001', 'My sets > Task checklist: one item per drawing, in the set\'s order (linked to the drawing)');
};
