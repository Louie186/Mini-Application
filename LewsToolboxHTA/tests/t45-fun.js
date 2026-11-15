// Fun tab: the basketball slingshot (pull back, shoot, score); your own files in the queue; optional copy into a folder; score kept
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    add('C:\\Plans\\A-1.pdf', 'ONE'); add('C:\\Other\\A-1.pdf', 'TWO'); fs.dirs['c:\\basket'] = 'C:\\Basket'; });
  ok(await page.evaluate(() => /Fun/.test(document.getElementById('tabs').innerText) && !!document.querySelector('.nb[data-k="fun"]')), 'a Fun tab in the menu (its own heading, above Settings)');
  await page.click('.nb[data-k="fun"]'); await page.mouse.move(900, 20); await page.waitForTimeout(900);
  const f = page.frame({ url: /fun\.html/ });
  ok(await f.evaluate(() => !!window.ltFun && document.getElementById('file').offsetWidth > 0 && /Fun corner/.test(document.body.innerText)), 'the game is there: the file, the hoop, the buttons');
  await page.screenshot({ path: out + '/fun_idle.png' });
  // pull back with the mouse: the aim dots show, let go: the file flies
  const b = await (await f.$('#file')).boundingBox(), x0 = b.x + b.width / 2, y0 = b.y + b.height / 2;
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x0 - 20, y0 + 60, { steps: 6 }); await page.mouse.move(x0 - 30, y0 + 110, { steps: 6 });
  ok(await f.evaluate(() => ltFun.state.mode == 'drag' && document.querySelectorAll('.dot').length > 0 && [].some.call(document.querySelectorAll('.dot'), d => d.style.display == 'block') && document.getElementById('aim').style.display == 'block'), 'pull the file back: the dotted path and the arrow show');
  await page.screenshot({ path: out + '/fun_aim.png' });
  await page.mouse.up(); await page.waitForTimeout(100);
  ok(await f.evaluate(() => ltFun.state.mode == 'flying' || ltFun.state.mode == 'returning'), 'let go: the file is shot');
  await page.waitForTimeout(4500);
  ok(await f.evaluate(() => ltFun.state.mode == 'idle'), 'after the shot the file is back at its place, ready for the next one');
  // a weak shot misses: the file lands on the floor, bounces and rolls, then lies there
  await f.evaluate(() => { ltFun.floor.length = 0; document.querySelectorAll('#world > div[style*="z-index: 2"]').forEach(e => e.parentNode.removeChild(e)); ltFun.launch(-350, -500, false); });
  await page.waitForTimeout(1800);
  const y1 = await f.evaluate(() => ltFun.floor.length ? ltFun.floor[ltFun.floor.length - 1].y : -1), x1 = await f.evaluate(() => ltFun.floor.length ? ltFun.floor[ltFun.floor.length - 1].x : -1);
  await page.waitForTimeout(2500);
  const o2 = await f.evaluate(() => { var o = ltFun.floor[ltFun.floor.length - 1]; return o ? { x: o.x, y: o.y, vx: o.vx, vy: o.vy } : null; });
  ok(y1 > 0 && o2 && Math.abs(o2.vx) < 5 && o2.vy === 0, 'a miss: the file stays on the floor - it bounced and rolled, then came to rest (x ' + Math.round(x1) + ' -> ' + (o2 && Math.round(o2.x)) + ')');
  ok(await f.evaluate(() => ltFun.state.mode == 'idle' && document.getElementById('file').style.opacity != '0'), 'the next file is ready at once while the missed one lies on the floor');
  await page.screenshot({ path: out + '/fun_floor.png' });
  await f.evaluate(() => { for (var i = 0; i < 9; i++) { ltFun.state.mode = 'flying'; ltFun.spill(); } });
  ok(await f.evaluate(() => ltFun.floor.length == 7 && document.querySelectorAll('#world > div[style*="z-index: 2"]').length <= 7), 'at most 7 files stay on the floor (the oldest goes)');
  await page.waitForTimeout(700);
  // a guaranteed shot scores
  await f.evaluate(() => ltFun.dunk()); await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/fun_score.png' });
  await page.waitForTimeout(1800);
  const r = await f.evaluate(() => ({ n: document.getElementById('count').innerText, st: LT.readJson(LT.dataPath('fun.json'), {}), items: document.querySelectorAll('#list .item').length, say: document.getElementById('status').innerText }));
  ok(r.n == '1' && r.st.total == 1 && r.st.best == 1 && r.items == 1 && /Swish/.test(r.say), 'a score: Scored 1, the all-time total and best streak are saved, an entry in the list');
  ok(await f.evaluate(() => ltFun.state.mode == 'idle' && document.getElementById('file').style.opacity != '0'), 'the file comes back for the next shot');
  // your own files + the optional copy
  await f.evaluate(() => { ltFun.addPaths(['C:\\Plans\\A-1.pdf', 'C:\\Other\\A-1.pdf', 'C:\\Nope\\x.pdf']); });
  ok(await f.evaluate(() => ltFun.queue.length == 2 && /A-1\.pdf/.test(document.getElementById('cap').innerText) && /2 files are ready/.test(document.getElementById('status').innerText)), 'your files in the queue (a missing one is skipped), its name under the file');
  await f.evaluate(() => { ltFun.st.copy = true; ltFun.st.copyTo = 'C:\\Basket'; ltFun.optShow(); ltFun.dunk(); }); await page.waitForTimeout(3200);
  await f.evaluate(() => ltFun.dunk()); await page.waitForTimeout(3200);
  const files = await F();
  ok(files.includes('C:\\Basket\\A-1.pdf') && files.includes('C:\\Basket\\A-1 (2).pdf'), 'optional copy: scored files are COPIED into the folder - the second A-1.pdf gets (2), nothing overwritten');
  ok(files.includes('C:\\Plans\\A-1.pdf') && files.includes('C:\\Other\\A-1.pdf') && (await page.evaluate(() => window.__mockFs.files['c:\\basket\\a-1.pdf'].text)) == 'ONE', 'the originals stay where they were');
  ok(await f.evaluate(() => /Copied to Basket/.test(document.getElementById('list').innerText) && LT.readJson(LT.dataPath('fun.json'), {}).total == 3 && LT.readJson(LT.dataPath('fun.json'), {}).best == 3), 'the list says "Copied to Basket"; total 3, best streak 3');
  // looks
  for (const th of ['glass', 'ember', 'emberlight']) { await page.evaluate(t => { var s = LT.settings(); s.theme = t; LT.saveSettings(s); LTMain.themeChanged(); }, th); await page.waitForTimeout(300); }
  ok(await f.evaluate(() => /rgb\(.*\)|#/.test(getComputedStyle(document.getElementById('zone')).backgroundColor) && document.getElementById('board').getAttribute('stroke').length > 3), 'follows the look in use (colours change with the theme)');
  await page.evaluate(() => { var s = LT.settings(); s.theme = 'glass'; LT.saveSettings(s); LTMain.themeChanged(); }); await page.waitForTimeout(400); await page.screenshot({ path: out + '/fun_glass.png' });
};
