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
  const info = await f.evaluate(() => { var tb = document.querySelector('#main table.grid:not(.fhcopy)'); return { fit: / fit/.test(tb.className), cols: tb.getElementsByTagName('col').length, rn: tb.rows[1].cells[0].className + '=' + tb.rows[1].cells[0].innerText, fz: tb.rows[1].cells[1].className, fz2: tb.rows[1].cells[2].className, grips: tb.querySelectorAll('th .rz').length, th: tb.rows[0].cells.length }; });
  ok(info.fit && info.cols == info.th, 'table gets fixed column widths (' + info.cols + ' columns)');
  ok(/rn/.test(info.rn) && /fz/.test(info.rn) && /=1$/.test(info.rn), 'row number column (No.) first, frozen, starts at 1');
  ok(/fz fzl/.test(info.fz) && !/fz/.test(info.fz2), 'drawing / document number column frozen next to it, the rest are not');
  ok(info.grips == info.th - 2, 'every other column has a resize grip (' + info.grips + ')');
  // wrapped text
  ok(await f.evaluate(() => { var r = document.querySelector('#main table.grid:not(.fhcopy)').rows; return r[1].offsetHeight > r[3].offsetHeight + 8; }), 'long text wraps onto more lines');
  ok(await f.evaluate(() => { var c = document.querySelector('#main table.grid:not(.fhcopy)').rows[1].cells[1]; return getComputedStyle(c).whiteSpace == 'nowrap' && c.scrollHeight <= c.offsetHeight + 2; }), 'drawing number does not wrap');
  // heading row stays on top when scrolling down
  await f.evaluate(() => { for (var i = 13; i <= 60; i++) data.tasks.push({ id: 'y' + i, code: 'T' + i, title: 'Extra ' + i, group: '', project: '', who: 'Ben', due: '', status: 'Not started', notes: '', subs: [], history: [] }); save(); render(); });
  await page.waitForTimeout(300);
  const h0 = await f.evaluate(() => document.querySelector('#main table.grid:not(.fhcopy)').rows[0].getBoundingClientRect().top);
  await f.evaluate(() => { $('main').scrollTop = 600; $('main').dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(100);
  const hs = await f.evaluate(() => { var tb = document.querySelector('#main table.grid:not(.fhcopy)'), cp = document.querySelector('#main .fhc'), th = cp && cp.querySelector('th:nth-child(3)');
    return [th ? th.getBoundingClientRect().top : -1, $('main').getBoundingClientRect().top, $('main').scrollTop, tb.rows[tb.rows.length - 1].cells[0].innerText, th ? th.textContent : '', cp ? getComputedStyle(cp).display : '', cp ? cp.querySelector('th').getBoundingClientRect().left - tb.rows[0].cells[0].getBoundingClientRect().left : -1]; });
  ok(hs[2] > 500 && hs[5] == 'block' && Math.abs(hs[0] - hs[1]) < 3 && /Task/.test(hs[4]) && Math.abs(hs[6]) < 2, 'scroll down: the column titles stay at the top, lined up with the columns (scrolled ' + hs[2] + 'px)');
  // sideways while scrolled down: the No. / ID titles stay too
  await f.evaluate(() => { $('main').scrollLeft = 200; $('main').dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(100);
  ok(await f.evaluate(() => { var cp = document.querySelector('#main .fhc'), a = cp.querySelector('th.fz').getBoundingClientRect().left, b = $('main').getBoundingClientRect().left; return Math.abs(a - b) < 3; }), 'scroll down and right: No. title stays at the left');
  // drag a column edge on the floating titles = resizes the real column
  const gg = await f.evaluate(() => { var r = document.querySelector('#main .fhc th:nth-child(4) .rz').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2, w: document.querySelector('#main table.grid:not(.fhcopy)').rows[0].cells[3].offsetWidth }; });
  const frm = await (await page.$('#f_delegate')).boundingBox();
  await page.mouse.move(frm.x + gg.x, frm.y + gg.y); await page.mouse.down(); await page.mouse.move(frm.x + gg.x + 60, frm.y + gg.y, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(100);
  ok(await f.evaluate(w => { var tb = document.querySelector('#main table.grid:not(.fhcopy)'), cp = document.querySelector('#main .fhc th:nth-child(4)'); return tb.rows[0].cells[3].offsetWidth >= w + 50 && Math.abs(cp.offsetWidth - tb.rows[0].cells[3].offsetWidth) < 2; }, gg.w), 'drag an edge on the floating titles: real column wider, titles stay lined up');
  await f.evaluate(() => { $('main').scrollLeft = 0; $('main').dispatchEvent(new Event('scroll')); });
  ok(hs[3] == '60', 'rows numbered 1 to 60');
  await page.screenshot({ path: out + '/g_scrolled_down.png' });
  await f.evaluate(() => { $('main').scrollTop = 0; $('main').dispatchEvent(new Event('scroll')); });
  // drag "Task / item" edge wider
  const g = await f.evaluate(() => { var th = document.querySelector('#main table.grid:not(.fhcopy)').rows[0].cells[2], r = th.querySelector('.rz').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2, w: th.offsetWidth }; });
  await page.mouse.move(g.x + 0, g.y + 0);
  const fr = await (await page.$('#f_delegate')).boundingBox();
  await page.mouse.move(fr.x + g.x, fr.y + g.y); await page.mouse.down(); await page.mouse.move(fr.x + g.x + 120, fr.y + g.y, { steps: 5 }); await page.mouse.up();
  const w2 = await f.evaluate(() => document.querySelector('#main table.grid:not(.fhcopy)').rows[0].cells[2].offsetWidth);
  ok(w2 >= g.w + 110, 'drag the heading edge: column wider (' + g.w + ' → ' + w2 + 'px)');
  ok(await f.evaluate(() => { var s = LT.settings().gridCols || {}; return s['delegate|Task / item'] > 0; }), 'width saved for this tab');
  await f.evaluate(() => render()); await page.waitForTimeout(200);
  ok(Math.abs(await f.evaluate(() => document.querySelector('#main table.grid:not(.fhcopy)').rows[0].cells[2].offsetWidth) - w2) < 3, 'width kept after the list redraws');
  await page.screenshot({ path: out + '/g_resized.png' });
  // frozen while scrolling sideways
  const before = await f.evaluate(() => { var r = document.querySelector('#main table.grid:not(.fhcopy)').rows[1]; return [r.cells[1].getBoundingClientRect().left, r.cells[3].getBoundingClientRect().left]; });
  await f.evaluate(() => { $('main').scrollLeft = 300; $('main').dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(100);
  const after = await f.evaluate(() => { var r = document.querySelector('#main table.grid:not(.fhcopy)').rows[1]; return [r.cells[1].getBoundingClientRect().left, r.cells[3].getBoundingClientRect().left, $('main').scrollLeft]; });
  ok(after[2] > 0 && Math.abs(after[0] - before[0]) < 2 && after[1] < before[1] - 50, 'scroll sideways: column A stays, other columns move (scrolled ' + after[2] + 'px)');
  await page.screenshot({ path: out + '/g_scrolled.png' });
  await f.evaluate(() => { $('main').scrollLeft = 0; $('main').dispatchEvent(new Event('scroll')); });
  // double-click = back to normal
  await f.evaluate(() => { var th = document.querySelector('#main table.grid:not(.fhcopy)').rows[0].cells[2]; $('main').scrollLeft = th.offsetLeft - 150; $('main').dispatchEvent(new Event('scroll')); });
  const g2 = await f.evaluate(() => { var r = document.querySelector('#main table.grid:not(.fhcopy)').rows[0].cells[2].querySelector('.rz').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; });
  await page.mouse.dblclick(fr.x + g2.x, fr.y + g2.y); await page.waitForTimeout(100);
  ok(await f.evaluate(() => !(LT.settings().gridCols || {})['delegate|Task / item']), 'double-click the edge: saved width cleared');
  // other tabs get it too (Tracker list: tick box + Task frozen)
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(600);
  const tr = page.frame({ url: /tracker\.html/ });
  await tr.evaluate(() => { data.tasks.push({ id: 'z', title: 'Check RFI drawings', project: 'Tower 1', due: LT.today(), priority: 'Normal', status: 'To do', notes: '', log: [] }); save(); data.view = 'open'; render(); });
  await page.waitForTimeout(300);
  ok(await tr.evaluate(() => { var tb = document.querySelector('#main table.grid:not(.fhcopy)'); return tb && / fit/.test(tb.className) && /fz/.test(tb.rows[1].cells[1].className) && /fzl/.test(tb.rows[1].cells[2].className); }), 'Tracker list: No. + tick box + Task frozen');
  await page.setViewportSize({ width: 1180, height: 700 });
};
