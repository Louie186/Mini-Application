// Folder Check > Contents and Checklist: My set as the checklist (direct button), and the result per Tower > Typology > Model (done / missing per group, arrows open a group)
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    LT.saveJson(LT.dataPath('register.json'), { current: 'p1', projects: [{ id: 'p1', name: 'Akala' }] });
    const D = {}, keys = [], mk = (n, tw, ty, md, t) => { const k = '5013-KEO-' + tw + '-ZZ-PLN-INT-' + n; D[k] = { num: k, title: t, rev: 'T1', inMidp: true, tower: tw, typo: ty, model: md, ok: true }; keys.push(k); };
    mk('10100', 'T1', '1BRA', 'INT-21000', 'UNIT 1BR TYPE A - PLAN'); mk('10101', 'T1', '1BRA', 'INT-21000', 'UNIT 1BR TYPE A - ELEVATIONS'); mk('10110', 'T1', '1BRB', 'INT-21001', 'UNIT 1BR TYPE B - PLAN');
    mk('20100', 'T2', '2BRC', 'INT-22000', 'UNIT 2BR TYPE C - PLAN'); mk('20101', 'T2', '2BRC', 'INT-22000', 'UNIT 2BR TYPE C - ELEVATIONS');
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', drawings: D, sets: [{ id: 's1', name: 'Lot 1 apartments', keys: keys }], models: [] });
    ['5013-KEO-T1-ZZ-PLN-INT-10100-T1.pdf', '5013-KEO-T1-ZZ-PLN-INT-10101-T1.pdf', '5013-KEO-T2-ZZ-PLN-INT-20100-T1.pdf'].forEach(n => add('C:\\Sub\\' + n, 'X')); });
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500);
  const c = page.frame({ url: /check\.html/ }); await c.evaluate(() => setView('contents')); await page.waitForTimeout(600);
  const k = page.frame({ url: /contents\.html/ });
  // My set as the checklist - straight from the button
  await k.evaluate(() => { cfg.folder = 'C:\\Sub'; save(); paths(); });
  await k.click('#bSetQ'); await page.waitForTimeout(60);
  ok(/Lot 1 apartments\s*5 drawings/.test(await k.evaluate(() => document.getElementById('menu').innerText)), 'Contents: "My set ▾" lists the sets');
  await k.evaluate(() => { [...document.querySelectorAll('#menu .mi')].find(m => /Lot 1/.test(m.innerText)).click(); }); await page.waitForTimeout(150);
  ok(await k.evaluate(() => cfg.refKind == 'set' && result && result.items && result.items.length == 5), 'the set is the checklist (5 drawings)');
  await k.evaluate(() => { $('show').value = 'chk'; $('gBy').value = 'tower,typo,model'; $('gBy').onchange(); });
  const grows = () => k.evaluate(() => [...document.querySelectorAll('#res tr.grow')].filter(r => r.style.display != 'none').map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  let g = await grows();
  ok(g.length == 2 && /Tower T1 3 drawings ✔ 2 ✖ 1/.test(g[0]) && /Tower T2 2 drawings ✔ 1 ✖ 1/.test(g[1]), 'grouped: one line per tower with finished / missing: ' + g.join(' | '));
  await k.click('#res tr.grow'); g = await grows();
  ok(g.length == 4 && /Typology 1BRA 2 drawings ✔ 2/.test(g[1]) && /Typology 1BRB 1 drawing ✔ 0 ✖ 1/.test(g[2]), 'click T1: its typologies (1BRB is the one missing)');
  await k.click('#gOpen');
  const vis = await k.evaluate(() => [...document.querySelectorAll('#res tr:not(.grow)')].filter(r => r.style.display != 'none' && /5013/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')));
  ok(vis.length == 5 && vis.some(v => /10110 ✖ Missing/.test(v)), 'Open all: every drawing with its status under its model');
  await page.screenshot({ path: out + '/contents_grouped.png' });
  await k.evaluate(() => { $('show').value = 'left'; render(); }); await k.click('#gShut'); g = await grows();
  ok(g.length == 2 && /T1 1 drawing ✔ 0 ✖ 1/.test(g[0]) && /T2 1 drawing/.test(g[1]), 'Remaining, grouped: what is missing per tower');
  ok(await k.evaluate(() => LT.readJson(LT.dataPath('contents.json')).gBy == 'tower,typo,model'), 'the grouping is kept');
  // Checklist (Check all)
  await c.evaluate(() => setView('checkall')); await page.waitForTimeout(600);
  const a = page.frame({ url: /checkall\.html/ });
  await a.click('#bSetQ'); await page.waitForTimeout(60);
  await a.evaluate(() => { [...document.querySelectorAll('#menu .mi')].find(m => /Lot 1/.test(m.innerText)).click(); cfg.f2 = 'C:\\Sub'; save(); show(); });
  ok(await a.evaluate(() => cfg.src && cfg.src.kind == 'set' && cfg.src.id == 's1'), 'Checklist: "My set ▾" sets the checklist');
  await a.click('#bRun'); await page.waitForTimeout(200);
  await a.evaluate(() => { $('gBy').value = 'tower,typo'; $('gBy').onchange(); });
  g = await a.evaluate(() => [...document.querySelectorAll('#res tr.grow')].filter(r => r.style.display != 'none').map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  ok(g.length == 2 && /Tower T1 3 drawings ✔ 2 ✖ 1/.test(g[0]) && /Tower T2 2 drawings ✔ 1 ✖ 1/.test(g[1]), 'Checklist grouped Tower › Typology: OK / missing per group: ' + g.join(' | '));
  await a.click('#gOpen');
  ok(await a.evaluate(() => [...document.querySelectorAll('#res tr.grow')].filter(r => r.style.display != 'none').length == 5 && /1BRB 1 drawing ✔ 0 ✖ 1/.test($('res').innerText.replace(/\s+/g, ' '))), 'Open all: the typologies too (1BRB missing)');
  await page.screenshot({ path: out + '/checklist_grouped.png' });
};
