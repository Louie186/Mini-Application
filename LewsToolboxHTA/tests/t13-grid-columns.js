// Result tables: frozen first column, drag-to-resize, wrapped text, widths remembered
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(700);
  const f = page.frame({ url: /delegate\.html/ });
  await f.evaluate(() => {
    var long = 'Coordinate the level 16 ceiling void services with the structural transfer beams and update the sections';
    data.tasks = [];
    for (var i = 1; i <= 12; i++) data.tasks.push({ id: 'x' + i, code: '5013-KEO-T1-ZZ-DR-A-1010' + i, title: (i == 1 ? long : 'Sheet ' + i), group: 'Drawings', project: '', who: 'Anna', due: '', status: 'Not started', notes: i == 2 ? long : '', subs: [], history: [] });
    save(); view = 'list'; render();
  });
  await page.waitForTimeout(300);
  const info = await f.evaluate(() => { var tb = document.querySelector('#main table.grid'); return { fit: / fit/.test(tb.className), cols: tb.getElementsByTagName('col').length, fz: tb.rows[1].cells[0].className, fz2: tb.rows[1].cells[1].className, grips: tb.querySelectorAll('th .rz').length, th: tb.rows[0].cells.length }; });
  ok(info.fit && info.cols == info.th, 'table gets fixed column widths (' + info.cols + ' columns)');
  ok(/fz fzl/.test(info.fz) && !/fz/.test(info.fz2), 'column A (drawing / document number) is frozen, the rest are not');
  ok(info.grips == info.th - 1, 'every other column has a resize grip (' + info.grips + ')');
  // wrapped text
  ok(await f.evaluate(() => { var r = document.querySelector('#main table.grid').rows; return r[1].offsetHeight > r[3].offsetHeight + 8; }), 'long text wraps onto more lines');
  ok(await f.evaluate(() => { var c = document.querySelector('#main table.grid').rows[1].cells[0]; return getComputedStyle(c).whiteSpace == 'nowrap' && c.scrollHeight <= c.offsetHeight + 2; }), 'drawing number does not wrap');
  // drag "Task / item" edge wider
  const g = await f.evaluate(() => { var th = document.querySelector('#main table.grid').rows[0].cells[1], r = th.querySelector('.rz').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2, w: th.offsetWidth }; });
  await page.mouse.move(g.x + 0, g.y + 0);
  const fr = await (await page.$('#f_delegate')).boundingBox();
  await page.mouse.move(fr.x + g.x, fr.y + g.y); await page.mouse.down(); await page.mouse.move(fr.x + g.x + 120, fr.y + g.y, { steps: 5 }); await page.mouse.up();
  const w2 = await f.evaluate(() => document.querySelector('#main table.grid').rows[0].cells[1].offsetWidth);
  ok(w2 >= g.w + 110, 'drag the heading edge: column wider (' + g.w + ' → ' + w2 + 'px)');
  ok(await f.evaluate(() => { var s = LT.settings().gridCols || {}; return s['delegate|Task / item'] > 0; }), 'width saved for this tab');
  await f.evaluate(() => render()); await page.waitForTimeout(200);
  ok(Math.abs(await f.evaluate(() => document.querySelector('#main table.grid').rows[0].cells[1].offsetWidth) - w2) < 3, 'width kept after the list redraws');
  await page.screenshot({ path: out + '/g_resized.png' });
  // frozen while scrolling sideways
  const before = await f.evaluate(() => { var r = document.querySelector('#main table.grid').rows[1]; return [r.cells[0].getBoundingClientRect().left, r.cells[2].getBoundingClientRect().left]; });
  await f.evaluate(() => { $('main').scrollLeft = 300; $('main').dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(100);
  const after = await f.evaluate(() => { var r = document.querySelector('#main table.grid').rows[1]; return [r.cells[0].getBoundingClientRect().left, r.cells[2].getBoundingClientRect().left, $('main').scrollLeft]; });
  ok(after[2] > 0 && Math.abs(after[0] - before[0]) < 2 && after[1] < before[1] - 50, 'scroll sideways: column A stays, other columns move (scrolled ' + after[2] + 'px)');
  await page.screenshot({ path: out + '/g_scrolled.png' });
  await f.evaluate(() => { $('main').scrollLeft = 0; $('main').dispatchEvent(new Event('scroll')); });
  // double-click = back to normal
  await page.mouse.dblclick(fr.x + g.x + 120, fr.y + g.y); await page.waitForTimeout(100);
  ok(await f.evaluate(() => !(LT.settings().gridCols || {})['delegate|Task / item']), 'double-click the edge: saved width cleared');
  // other tabs get it too (Tracker list: tick box + Task frozen)
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(600);
  const tr = page.frame({ url: /tracker\.html/ });
  await tr.evaluate(() => { data.tasks.push({ id: 'z', title: 'Check RFI drawings', project: 'Tower 1', due: LT.today(), priority: 'Normal', status: 'To do', notes: '', log: [] }); save(); data.view = 'open'; render(); });
  await page.waitForTimeout(300);
  ok(await tr.evaluate(() => { var tb = document.querySelector('#main table.grid'); return tb && / fit/.test(tb.className) && /fz/.test(tb.rows[1].cells[0].className) && /fzl/.test(tb.rows[1].cells[1].className); }), 'Tracker list: tick box + Task frozen');
  await page.setViewportSize({ width: 1180, height: 700 });
};
