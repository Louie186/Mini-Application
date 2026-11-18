// Delegate: collapsible tasks; Work outline (Tasks + Delegate task window) -> numbered 1. a. i. in the task pack and the Excel sheet
const fs = require('fs');
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const OUT = 'RCP printing with FF&E stamp\n\tMake sure the decorative lights are tagged and with dimension\n\tAll lights must have a reference line with dimensions\n\tUpdate the legend for decorative light, use 60012\n\tNo clouds\nFF&E printing with FF&E stamp (serviced apartment)\n\tUpdate all the furniture families\n\tNo clouds\n\tUpdate the legend follow the below reference number:\n\t\tFurniture seating and Beds: 62004\n\t\tFurniture tables: 62005\n\t\tFurniture Accessories and Mats/Rugs: 62006';
  // the outline numbers itself (also from text pasted with its own numbers)
  const o = await page.evaluate(t => LT.outline(t).map(x => x.label + ' ' + x.text), OUT);
  ok(o[0] == '1. RCP printing with FF&E stamp' && o[1] == 'a. Make sure the decorative lights are tagged and with dimension' && o[4] == 'd. No clouds' && o[5] == '2. FF&E printing with FF&E stamp (serviced apartment)' && o[9] == 'i. Furniture seating and Beds: 62004' && o[11] == 'iii. Furniture Accessories and Mats/Rugs: 62006', 'Tab = one level in: 1. / a. / i. numbering by itself');
  const o2 = await page.evaluate(() => LT.outline('1. RCP printing\na. Lights tagged\nb. No clouds\n2. FF&E printing\na. Update legend\ni. Seating: 62004\nii. Tables: 62005').map(x => x.lv + x.label));
  ok(o2.join() == '01.,1a.,1b.,02.,1a.,2i.,2ii.', 'pasted with its own 1. a. i.: the levels come from the numbers');
  await page.evaluate(() => { LT.saveJson(LT.dataPath('delegate.json'), { seq: 2, groups: [], tasks: [
    { id: 'a', code: 'T006', title: 'PSPC FF&E + RCP', who: 'Ana', due: '', status: 'Not started', subs: [{ code: 'T006.1', title: 'Sheet 1', who: '', due: '', status: 'Not started', notes: '' }, { code: 'T006.2', title: 'Sheet 2', who: '', due: '', status: 'Not started', notes: '' }], history: [] },
    { id: 'b', code: 'T007', title: 'Other', who: 'Ben', due: '', status: 'Not started', subs: [{ code: 'T007.1', title: 'X', who: '', due: '', status: 'Not started', notes: '' }], history: [] }] }); });
  await page.click('.nb[data-k="delegate"]'); await page.waitForTimeout(700);
  const d = page.frame({ url: /delegate\.html/ }); await d.evaluate(() => { load(); view = 'list'; render(); });
  const rows = () => d.evaluate(() => document.querySelectorAll('#main tr[data-r]').length);
  ok(await rows() == 5, 'the list: 2 tasks + 3 items');
  await d.click('[data-tog="T006"]'); await page.waitForTimeout(100);
  ok(await rows() == 3 && await d.evaluate(() => findTask('T006').collapsed === true && /2 items/.test($('main').innerText)), 'click ▾ on a task: its items fold away ("2 items"), remembered');
  await d.click('#bColAll'); await page.waitForTimeout(100); ok(await rows() == 2, 'Collapse all: only the tasks');
  await d.click('#bExpAll'); await page.waitForTimeout(100); ok(await rows() == 5, 'Expand all: everything');
  // the outline in the task window
  await d.evaluate(() => edit(findTask('T006'))); await page.waitForTimeout(100);
  await d.evaluate(t => { $('eOutline').value = t; $('eOutline').onkeyup(); }, OUT);
  const pv = await d.evaluate(() => $('eOutPrev').innerText);
  ok(/1\.\s*RCP printing/.test(pv) && /c\.\s*Update the legend for decorative light, use 60012/.test(pv) && /ii\.\s*Furniture tables: 62005/.test(pv), 'Delegate task window: Work outline + the numbered preview beside it');
  await d.evaluate(() => { var ta = $('eOutline'); ta.value = 'A\nB'; ta.selectionStart = ta.selectionEnd = 3; var e = document.createEvent('Event'); e.initEvent('keydown', true, true); e.keyCode = 9; ta.dispatchEvent(e); });
  ok(await d.evaluate(() => $('eOutline').value == 'A\n\tB'), 'Tab in the box = one level in');
  await d.evaluate(t => { $('eOutline').value = t; saveEdit(); }, OUT); await page.waitForTimeout(100);
  ok(await d.evaluate(() => /RCP printing/.test(findTask('T006').outline) && !!document.querySelector('[data-olc="T006"]')), 'saved with the task; the list shows "📋 outline" (hover = the outline, click = edit)');
  await page.screenshot({ path: out + '/delegate_outline.png' });
  // the task pack
  await d.evaluate(() => { LT.mkdirs('C:\\Out'); buildPack('C:\\Out\\P.html', [findTask('T006')], 'Akala', 'Lew', 'Ana', 'Ana', 'X', [], {}); });
  fs.writeFileSync('/tmp/claude-0/pack-ol.html', await page.evaluate(() => window.__mockFs.files['c:\\out\\p.html'].text));
  const pg = await page.context().newPage(); await pg.setViewportSize({ width: 1200, height: 800 }); await pg.goto('file:///tmp/claude-0/pack-ol.html'); await pg.waitForTimeout(600);
  const ptx = await pg.evaluate(() => document.querySelector('.olx') ? document.querySelector('.olx').innerText : '');
  ok(/1\.\s*RCP printing/.test(ptx) && /d\.\s*No clouds/.test(ptx) && /iii\.\s*Furniture Accessories and Mats\/Rugs: 62006/.test(ptx), 'task pack: the Work outline under the task, numbered 1. a. i.');
  await pg.screenshot({ path: out + '/pack_outline.png' });
  await pg.click('[data-olt="T006"]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => !document.querySelector('.olx') && !!document.querySelector('.olt')), '... it can be folded away');
  await pg.close();
  // the Excel task sheet
  await page.evaluate(() => { top.__excel = 1; });
  await d.evaluate(() => { buildPlan('C:\\Out\\Plan.xlsx', [findTask('T006')], 'Akala', 'Lew', 'Ana', 'X', []); });
  const xl = await page.evaluate(() => { var k = Object.keys(window.__mockFs.files).filter(p => /plan\.xlsx$/i.test(p))[0]; return k ? window.__mockFs.files[k].text : 'NOFILE'; });
  ok(/WORK OUTLINE/.test(xl) && /1\.  RCP printing/.test(xl) && /i\.  Furniture seating and Beds: 62004/.test(xl) && /see the Guide sheet/.test(xl), 'Excel task sheet: the Work outline on the Guide sheet (the Tasks sheet says so; replies read the same)');
  // Tasks tab: the same box, carried over when delegated
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500);
  const tk = page.frame({ url: /tracker\.html/ });
  await tk.evaluate(t => { var x = blank(); x.title = 'Print set'; x.who = 'Ben'; x.outline = t; addTask(x); save(); render(); edit(x); }, 'Print\n\tNo clouds');
  ok(/1\.\s*Print[\s\S]*a\.\s*No clouds/.test(await tk.evaluate(() => $('eOutPrev').innerText)), 'Tasks task window: the same Work outline box');
  await tk.evaluate(() => { $('dlg').style.display = 'none'; delegate(data.tasks[data.tasks.length - 1]); }); await page.waitForTimeout(1000);
  ok(await d.evaluate(() => /No clouds/.test(data.tasks[data.tasks.length - 1].outline || '')), 'delegated from Tasks: the outline comes along');
};
