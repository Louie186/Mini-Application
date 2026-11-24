// Folder Check > Groups > Copy into folders: Tower / Typology / Model folders (renamable, kept), copy or move, latest revision only, Others, Undo; Bulk Files link
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.evaluate(() => {
    const add = (p, t) => { const fs = window.__mockFs; fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    LT.saveJson(LT.dataPath('register.json'), { current: 'p1', projects: [{ id: 'p1', name: 'Akala' }] });
    const D = {}, mk = (n, tw, ty, md, t) => { const k = '5013-KEO-' + tw + '-ZZ-PLN-INT-' + n; D[k] = { num: k, title: t, rev: 'T1', inMidp: true, tower: tw, typo: ty, model: md }; };
    mk('10100', 'T1', '1BRA', 'INT-21000', 'UNIT 1BR TYPE A - PLAN'); mk('10101', 'T1', '1BRA', 'INT-21000', 'UNIT 1BR TYPE A - ELEVATIONS'); mk('20100', 'T2', '2BRC', 'INT-22000', 'UNIT 2BR TYPE C - PLAN');
    LT.saveJson(LT.registerFile('p1'), { name: 'Akala', drawings: D, sets: [] });
    ['5013-KEO-T1-ZZ-PLN-INT-10100-T1.pdf', '5013-KEO-T1-ZZ-PLN-INT-10100-T2.pdf', '5013-KEO-T1-ZZ-PLN-INT-10100-T2.dwg', '5013-KEO-T1-ZZ-PLN-INT-10101-T1.pdf', 'Sub\\5013-KEO-T2-ZZ-PLN-INT-20100-T1.pdf', 'Notes from Sam.pdf'].forEach(n => add('C:\\Grp\\' + n, 'X'));
    window.__fsList = () => Object.values(window.__mockFs.files).map(f => f.path).sort(); });
  const F = (re) => page.evaluate((s) => window.__fsList().filter(p => new RegExp(s, 'i').test(p)), re);
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500);
  const c = page.frame({ url: /check\.html/ }); await c.evaluate(() => setView('groups')); await page.waitForTimeout(600);
  const g = page.frame({ url: /groups\.html/ });
  await g.evaluate(() => { ltReceive('open-folder', 'C:\\Grp'); window.confirm = () => true; window.alert = m => { window.__al = m; }; LT.pickFolder = () => 'C:\\Sorted'; LT.open = () => {}; });
  await g.click('#bCopy'); await page.waitForTimeout(80);
  ok(await g.evaluate(() => $('cf').style.display == 'block' && /4 drawings · 6 files/.test($('cfN').innerText)), 'Copy into folders: a window with 4 drawings / 6 files');
  const tree = () => g.evaluate(() => [...document.querySelectorAll('#cfTree input')].map(i => i.value + '@' + i.parentNode.style.paddingLeft).join(' | '));
  ok(/^T1@0px \| 1BRA@26px \| INT-21000@52px \| T2@0px \| 2BRC@26px \| INT-22000@52px \| Others@0px$/.test(await tree()), 'the folder tree follows the grouping, Others for drawings not in the MIDP: ' + await tree());
  // rename T1 and the model folder
  await g.evaluate(() => { const set = (k, v) => { const i = document.querySelector('#cfTree input[data-nm="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }; set('tower:T1', 'Tower 1'); set('model:INT-21000', '21000 - 1BR Type A'); });
  ok(/^Tower 1@.*21000 - 1BR Type A@/.test(await tree()) && await g.evaluate(() => LT.readJson(LT.dataPath('groups.json')).names['tower:T1'] == 'Tower 1'), 'rename a folder: kept for next time');
  await g.selectOption('#cfRev', 'last');
  ok(/4 drawings · 5 files/.test(await g.evaluate(() => $('cfN').innerText)), 'The latest only: 10100-T1.pdf left out (5 files)');
  await g.click('#cfDest'); await page.waitForTimeout(50);
  await page.screenshot({ path: out + '/copy_into_folders.png' });
  await g.click('#cfRun'); await page.waitForTimeout(150);
  const made = await F('^C:\\\\Sorted\\\\');
  ok(made.includes('C:\\Sorted\\Tower 1\\1BRA\\21000 - 1BR Type A\\5013-KEO-T1-ZZ-PLN-INT-10100-T2.pdf') && made.includes('C:\\Sorted\\Tower 1\\1BRA\\21000 - 1BR Type A\\5013-KEO-T1-ZZ-PLN-INT-10100-T2.dwg') && made.includes('C:\\Sorted\\T2\\2BRC\\INT-22000\\5013-KEO-T2-ZZ-PLN-INT-20100-T1.pdf') && made.includes('C:\\Sorted\\Others\\Notes from Sam.pdf') && made.length == 5, 'copied into Tower / Typology / Model folders with the new names: ' + made.length + ' files');
  ok((await F('^C:\\\\Grp\\\\')).length == 6, 'Copy: the originals stay');
  // run again: nothing overwritten
  await g.click('#cfRun'); await page.waitForTimeout(100);
  ok(/already in/.test(await g.evaluate(() => window.__al || '')) && (await F('^C:\\\\Sorted\\\\')).length == 5, 'again: files already there are skipped (never overwritten)');
  // undo
  await g.evaluate(() => { cfg.cfLast = []; }); 
  // move + undo
  await g.evaluate(() => { cfg.names = {}; }); await g.click('#cfMove'); await g.selectOption('#cfRev', 'all');
  await g.evaluate(() => { LT.pickFolder = () => 'C:\\Moved'; }); await g.click('#cfDest'); await g.click('#cfRun'); await page.waitForTimeout(150);
  ok((await F('^C:\\\\Moved\\\\')).length == 6 && (await F('^C:\\\\Grp\\\\')).length == 0, 'Move: all 6 files moved out of the folder');
  await g.click('#cfUndo'); await page.waitForTimeout(150);
  ok((await F('^C:\\\\Moved\\\\')).length == 0 && (await F('^C:\\\\Grp\\\\')).length == 6 && await g.evaluate(() => !window.top.__mockFs.dirs['c:\\moved\\t1\\1bra\\int-21000']), 'Undo: moved back, the empty folders it made are gone');
  // from Bulk Files
  await g.evaluate(() => { $('cf').style.display = 'none'; });
  await page.click('.nb[data-k="files"]'); await page.waitForTimeout(500);
  const b = page.frame({ url: /files\.html/ }); await b.evaluate(() => { folder = 'C:\\Grp'; });
  await b.click('#bSortTT'); await page.waitForTimeout(900);
  ok(await g.evaluate(() => $('cf').style.display == 'block' && cfg.folder == 'C:\\Grp'), 'Bulk Files: "Sort into Tower / Typology / Model folders" opens Folder Check > Groups with the window');
};
