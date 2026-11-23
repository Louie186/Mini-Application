// Drawing Register > Model list: import keeps every column of the file, rows added / edited here, export in the same format (new rows included)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => { window.__excel = 1;
    const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    const xl = (p, name, rows) => { const cells = {}; rows.forEach((r, i) => r.forEach((v, j) => { if (v !== '') cells[(i + 1) + ',' + (j + 1)] = { show: '' + v }; })); add(p, 'MOCKXL' + JSON.stringify([{ name, visible: -1, cells }])); };
    xl('C:\\Lists\\Model_list.xlsx', 'Sheet3', [['Tower', 'Typology', 'Sheet location', 'Model number', 'Scope', 'Classification', 'Model type', 'path'],
      ['T1', '1BRA', 4, '9001-ABC-ZZ-ZZ-BIM-INT-21000', 'Residential apartment', '', 'container model', 'https://acc.example.com/m/21000'],
      ['T1', '1BRB', 4, '9001-ABC-ZZ-ZZ-BIM-INT-21001', 'Residential apartment', '', 'container model', 'https://acc.example.com/m/21001'],
      ['T2', '2BRC', 9, '9001-ABC-ZZ-ZZ-BIM-INT-22000', 'Hotel Apartment', 'Serviced apartment', 'variant model', 'https://acc.example.com/m/22000'],
      ['-', 'Interior Design Federated Model', '', '9001-ABC-ZZ-ZZ-BIM-INT-10100', '', '', '-', 'https://acc.example.com/m/10100']]);
    LT.saveJson(LT.dataPath('register.json'), { current: 'p1', projects: [{ id: 'p1', name: 'Tower Project' }] });
    LT.saveJson(LT.registerFile('p1'), { name: 'Tower Project', drawings: { '9001-ABC-T2-ZZ-PLN-INT-20200': { num: '9001-ABC-T2-ZZ-PLN-INT-20200', title: 'UNIT 3BR TYPE D - PLAN', tower: '', typo: '', inMidp: true } }, sets: [], filters: [], changes: {}, history: [], models: [] });
  });
  await page.click('.nb[data-k="register"]'); await page.waitForTimeout(500);
  const f = page.frame({ url: /register\.html/ }); await f.evaluate(() => { loadAll(); view = 'models'; render(); });
  ok(await f.evaluate(() => !!$('mlOpen')), 'Models view: a "Model list" button');
  await f.evaluate(() => { imp = { kind: 'models', path: 'C:\\Lists\\Model_list.xlsx', L: readModels('C:\\Lists\\Model_list.xlsx') }; impCols(true); });
  ok(await f.evaluate(() => imp.c.link == 'path' && imp.c.model == 'Model number'), 'the path column is the link (not "Sheet location")');
  await f.evaluate(() => impDo());
  ok(await f.evaluate(() => P.models.length == 4 && P.modelCols.join('|') == 'Tower|Typology|Sheet location|Model number|Scope|Classification|Model type|path' && P.modelSheet == 'Sheet3' && P.models[2].x['Classification'] == 'Serviced apartment'), 'import keeps every column, the sheet name and each cell');
  ok(await f.evaluate(() => { const m = P.models[3]; return m.tower == '-' && m.typo == '-' && m.desc == 'Interior Design Federated Model'; }), 'a general model (Tower "-") keeps its description, no fake typology');
  await f.click('#mlOpen'); await page.waitForTimeout(80);
  ok(await f.evaluate(() => $('ovML').style.display == 'block' && /Tower\s*Typology\s*Sheet location\s*Model number\s*Scope\s*Classification\s*Model type\s*path/.test($('mlTb').rows[0].innerText) && $('mlTb').rows.length == 5), 'the window shows the list in its own columns');
  // add a row and type in it
  await f.click('#mlAdd'); await page.waitForTimeout(50);
  const vals = ['T2', '3BRD', '9', '9001-ABC-ZZ-ZZ-BIM-INT-22010', 'Hotel Apartment', '', 'container model', 'https://acc.example.com/m/22010'];
  for (let i = 0; i < vals.length; i++) { if (!vals[i]) continue; await f.evaluate(([i, v]) => { const tr = $('mlTb').rows[$('mlTb').rows.length - 1], td = tr.cells[i + 1]; td.focus(); td.innerText = v; td.blur(); }, [i, vals[i]]); }
  ok(await f.evaluate(() => { const m = P.models[4]; return m.added && m.tower == 'T2' && m.typo == '3BRD' && m.model == '9001-ABC-ZZ-ZZ-BIM-INT-22010' && m.link == 'https://acc.example.com/m/22010' && m.x['Scope'] == 'Hotel Apartment' && m.x['Sheet location'] == '9'; }), 'a row added here: every cell kept (tagged ADDED)');
  ok(await f.evaluate(() => LT.readJson(LT.registerFile('p1')).models.length == 5), 'saved');
  // a second model for T1 · 1BRA is flagged
  await f.click('#mlAdd'); await f.evaluate(() => { const tr = $('mlTb').rows[$('mlTb').rows.length - 1]; [[1, 'T1'], [2, '1BRA'], [4, '9001-ABC-ZZ-ZZ-BIM-INT-29999']].forEach(([c, v]) => { const td = tr.cells[c]; td.focus(); td.innerText = v; td.blur(); }); });
  ok(await f.evaluate(() => /T1 · 1BRA has 2 models/.test($('mlTb').innerText)), 'a second model for T1 · 1BRA: flagged');
  await f.evaluate(() => { mlTick = {}; mlTick[5] = true; window.confirm = () => true; }); await f.click('#mlDel');
  ok(await f.evaluate(() => P.models.length == 5 && !/has 2 models/.test($('mlTb').innerText)), 'Delete ticked');
  await page.screenshot({ path: out + '/model_list.png' });
  // export: same format, the new row in it
  const file = await f.evaluate(() => mlExport());
  const back = await f.evaluate((p) => { const b = LT.readExcelAll(p), t = b.rows[b.names[0]]; return { sheet: b.names[0], head: t[0].join('|'), n: t.length, last: t[t.length - 1].join('|'), gen: t[4].join('|') }; }, file);
  ok(/\.xlsx$/.test(file) && back.sheet == 'Sheet3' && back.head == 'Tower|Typology|Sheet location|Model number|Scope|Classification|Model type|path' && back.n == 6, 'export: same sheet name and columns, 5 rows: ' + back.head);
  ok(back.last == 'T2|3BRD|9|9001-ABC-ZZ-ZZ-BIM-INT-22010|Hotel Apartment||container model|https://acc.example.com/m/22010', 'export: the row added here is in it');
  ok(back.gen == '-|Interior Design Federated Model||9001-ABC-ZZ-ZZ-BIM-INT-10100|||-|https://acc.example.com/m/10100', 'export: the general model row comes back exactly as in the file');
  // importing the old file again keeps the added row
  await f.evaluate(() => { imp = { kind: 'models', path: 'C:\\Lists\\Model_list.xlsx', L: readModels('C:\\Lists\\Model_list.xlsx') }; impCols(true); impDo(); });
  ok(await f.evaluate(() => P.models.length == 5 && P.models[4].model == '9001-ABC-ZZ-ZZ-BIM-INT-22010'), 'importing the file again: the row you added here stays');
  // Setup Save keeps the extra columns
  await f.evaluate(() => { $('ovML').style.display = 'none'; setupShow(); setupSave(); });
  ok(await f.evaluate(() => P.models[2].x['Classification'] == 'Serviced apartment' && P.models[4].added), 'Setup > Save keeps every column');
  // the edit window: a new model typed there joins the list
  await f.evaluate(() => { view = 'midp'; render(); edit(['9001-ABC-T2-ZZ-PLN-INT-20200'], 'tower'); $('edTowerS').value = 'T2'; edChanged('Tower'); $('edTypoS').value = '\u0001new'; edChanged('Typo'); $('edTypo').value = '3BRE'; edChanged('Typo'); $('edModelS').value = '\u0001new'; edChanged('Model'); $('edModel').value = '9001-ABC-ZZ-ZZ-BIM-INT-22020'; edCheck(); saveEdit(false); });
  ok(await f.evaluate(() => { const m = P.models[P.models.length - 1]; return P.models.length == 6 && m.added && m.tower == 'T2' && m.typo == '3BRE' && m.model == '9001-ABC-ZZ-ZZ-BIM-INT-22020'; }), 'a new model typed in the edit window joins the model list (so it exports too)');
  // the model list tab shows the general model by its description
  await f.evaluate(() => edit(['9001-ABC-T2-ZZ-PLN-INT-20200']));
  ok(await f.evaluate(() => [...document.querySelectorAll('#mlL .mlR')].some(r => /10100\s*Interior Design Federated Model/.test(r.innerText))), 'model list tab: the federated model shows with its description');
  // the window can be made bigger; names are never cut
  ok(await f.evaluate(() => [...document.querySelectorAll('#mlL .mlR b')].every(b => b.scrollWidth <= b.clientWidth + 1) && [...document.querySelectorAll('#mlL .mlR span')].every(x => x.scrollWidth <= x.clientWidth + 1)), 'model list rows: full model number, the description wraps (nothing cut)');
  const w0 = await f.evaluate(() => $('edCard').offsetWidth);
  await f.click('#edBig'); await page.waitForTimeout(50);
  ok(await f.evaluate((w0) => $('edCard').offsetWidth > w0 + 100 && LT.settings().edSize && LT.settings().edSize[0] > 700, w0), '⤢ makes the window bigger (and remembers it)');
  await page.screenshot({ path: out + '/edit_big.png' });
  await f.click('#edBig');
  ok(await f.evaluate((w0) => Math.abs($('edCard').offsetWidth - w0) < 4 && !LT.settings().edSize, w0), '⤢ again: back to normal');
  const g = await f.evaluate(() => { const r = $('edGrip').getBoundingClientRect(); return [r.left + 8, r.top + 8]; });
  const fr = await page.evaluate(() => { const r = document.querySelector('iframe[src*="register"]') || [...document.querySelectorAll('iframe')].find(x => /register/.test(x.src)); const b = r.getBoundingClientRect(); return [b.left, b.top]; });
  await page.mouse.move(fr[0] + g[0], fr[1] + g[1]); await page.mouse.down(); await page.mouse.move(fr[0] + g[0] + 120, fr[1] + g[1] + 60, { steps: 5 }); await page.mouse.up();
  ok(await f.evaluate((w0) => $('edCard').offsetWidth > w0 + 150 && LT.settings().edSize, w0), 'drag the corner: wider (both sides), remembered');
  await f.evaluate(() => { $('ovEdit').style.display = 'none'; edit(['9001-ABC-T2-ZZ-PLN-INT-20200']); });
  ok(await f.evaluate((w0) => $('edCard').offsetWidth > w0 + 150, w0), 'opening it again: the same size');
};
