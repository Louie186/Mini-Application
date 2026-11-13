// Stage 2: rename to the naming rule (+ undo), what's new since the last issue, the Issue wizard, saved checks in Check all
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  const F = () => page.evaluate(() => Object.values(window.__mockFs.files).map(x => x.path));
  const quiet = fr => fr.evaluate(() => { window.confirm = () => true; window.alert = m => { window.__al = m; }; window.prompt = (q, d) => window.__answer != null ? window.__answer : d; });
  await page.evaluate(() => { const fs = window.__mockFs, add = (p, t) => { fs.files[p.toLowerCase()] = { path: p, text: t, time: Date.now() }; let d = p.substring(0, p.lastIndexOf('\\')); while (d) { fs.dirs[d.toLowerCase()] = d; d = d.substring(0, d.lastIndexOf('\\')); } };
    window.__add = add;
    // names: 3 can be fixed, 1 can't, 1 is fine
    ['prj_keo_t1_zz_dr_a_101_p1.pdf', 'PRJ KEO T1 ZZ DR A 10102 P01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10103.dwg', 'Notes from Sam.pdf', 'PRJ-KEO-T1-ZZ-DR-A-10104-P02.pdf'].forEach(n => add('C:\\Names\\' + n, 'X'));
    add('C:\\Names\\PRJ-KEO-T1-ZZ-DR-A-10102-P01.pdf', 'ALREADY');   // the fixed name of #2 is taken - must be skipped, not overwritten
    LT.saveJson(LT.dataPath('naming.json'), { last: 0, rules: [{ name: 'Project rule', sep: '-', revOptional: true, parts: [{ name: 'Project', kind: 'list', val: 'PRJ' }, { name: 'Orig', kind: 'letters', val: '3' }, { name: 'Vol', kind: 'any' }, { name: 'Lvl', kind: 'any' }, { name: 'Type', kind: 'list', val: 'DR,SH' }, { name: 'Role', kind: 'letters', val: '1' }, { name: 'Number', kind: 'digits', val: '5' }, { name: 'Rev', kind: 'rev' }] }] });
    // issue folder + an earlier transmittal to Client
    ['A-101-P02.pdf', 'A-101-P02.dwg', 'A-102-P01.pdf', 'A-103-C01.pdf', 'A-104-P01.pdf'].forEach(n => add('C:\\Issue\\' + n, 'X'));
    LT.saveJson(LT.dataPath('transmittals.json'), { next: 2, prefix: 'TR-', project: 'Tower 1', log: [{ no: 'TR-001', date: LT.today(), to: 'Client', purpose: 'For information', items: [{ number: 'A-101', rev: 'P01' }, { number: 'A-102', rev: 'P01' }, { number: 'A-104', rev: 'P02' }] }, { no: 'TR-001b', date: LT.today(), to: 'MEP', items: [{ number: 'A-103', rev: 'C01' }] }] });
    var s = LT.settings(); s.askLog = false; LT.saveSettings(s);
    const wsh = new ActiveXObject('WScript.Shell'), run = wsh.Run; wsh.Run = function (cmd, a, b) { var m = /-DestinationPath '([^']+)'/.exec(cmd); if (m) add(m[1].replace(/''/g, "'"), 'ZIP'); return run.call(this, cmd, a, b); }; LT.wsh = wsh; });

  // ---------- rename to the rule ----------
  ok(await page.evaluate(() => { const r = LT.nameRule(); return LT.nameFix('prj_keo_t1_zz_dr_a_101_p1', r) == 'PRJ-KEO-T1-ZZ-DR-A-00101-P01' && LT.nameFix('PRJ KEO T1 ZZ DR A 10102 P01', r) == 'PRJ-KEO-T1-ZZ-DR-A-10102-P01' && LT.nameFix('Notes from Sam', r) == null && LT.nameFix('PRJ-KEO-T1-ZZ-DR-A-10104-P02', r) == null; }),
    'nameFix: wrong separators, lower case, short number (101 -> 00101), P1 -> P01; nothing for a name it can\'t guess or one already right');
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(500);
  const c = page.frame({ url: /check\.html/ }); await c.click('[data-fv="naming"]'); await page.waitForTimeout(600);
  const nm = page.frame({ url: /naming\.html/ }); await quiet(nm);
  await nm.evaluate(() => ltReceive('open-folder', 'C:\\Names')); await page.waitForTimeout(150);
  ok(await nm.evaluate(() => /Rename to the rule \(2\)/.test($('bRen').innerText) && $('res').querySelectorAll('.fx').length == 2 && /by hand/.test($('res').innerText)), 'Names: a "Rename to" column with the fixed name ticked; "by hand" where it can\'t be guessed; button Rename to the rule (2)');
  await page.screenshot({ path: out + '/s2_names.png' });
  await nm.click('#bRen'); await page.waitForTimeout(150);
  let files = await F();
  ok(files.includes('C:\\Names\\PRJ-KEO-T1-ZZ-DR-A-00101-P01.pdf') && !files.includes('C:\\Names\\prj_keo_t1_zz_dr_a_101_p1.pdf'), 'renamed in the same folder, extension kept');
  ok(files.includes('C:\\Names\\PRJ KEO T1 ZZ DR A 10102 P01.pdf') && (await page.evaluate(() => window.__mockFs.files['c:\\names\\prj-keo-t1-zz-dr-a-10102-p01.pdf'].text)) == 'ALREADY' && /already there/.test(await nm.evaluate(() => window.__al)), 'a name already taken: skipped and told, nothing overwritten');
  ok(await nm.evaluate(() => $('bUndo').style.display == ''), '"Undo last rename" shows');
  await nm.click('#bUndo'); await page.waitForTimeout(150); files = await F();
  ok(files.includes('C:\\Names\\prj_keo_t1_zz_dr_a_101_p1.pdf') && !files.includes('C:\\Names\\PRJ-KEO-T1-ZZ-DR-A-00101-P01.pdf'), 'Undo: the old name is back');

  // ---------- what's new since the last issue ----------
  const g = await page.evaluate(() => { const d = [{ number: 'A-101', rev: 'P02' }, { number: 'A-102', rev: 'P01' }, { number: 'A-103', rev: 'C01' }, { number: 'A-104', rev: 'P01' }]; const r = LT.sinceLast(d, 'client'), x = r.groups; return [x.new, x.revised, x.same, x.older].map(a => a.map(i => i.number).join(',')).join(' | ') + ' / ' + r.last.no; });
  ok(g == 'A-103 | A-101 | A-102 | A-104 / TR-001', 'sinceLast to Client: A-103 new (only MEP had it), A-101 revised, A-102 already sent, A-104 lower; last = TR-001 (' + g + ')');

  // ---------- the Issue wizard (from + New) ----------
  await page.click('#newB'); await page.waitForTimeout(150); await page.click('[data-nw="tr"]'); await page.waitForTimeout(700);
  const t = page.frame({ url: /transmittal\.html/ }); await quiet(t);
  ok(await t.evaluate(() => $('wiz').style.display == 'flex' && /What goes out/.test($('wBody').innerText) && $('wSteps').children.length == 4), '+ New > Issue drawings opens the wizard: 4 steps, "What goes out?"');
  await t.evaluate(() => { LT.pickFolder = () => 'C:\\Issue'; }); await t.click('#wFolder'); await page.waitForTimeout(150);
  ok(await t.evaluate(() => docs.length == 4 && /4 document/.test($('wInfo').innerText)), 'step 1: from a folder - 4 drawings');
  await t.click('#wNext'); await t.fill('#wTo', 'Client'); await t.evaluate(() => $('wTo').onkeyup());
  ok(/Last sent to them: TR-001/.test(await t.evaluate(() => $('wLast').innerText)), 'step 2: shows what was last sent to that recipient');
  await t.selectOption('#wPurp', 'For construction'); await t.click('#wNext'); await page.waitForTimeout(100);
  const ch = await t.evaluate(() => $('wBody').innerText);
  ok(/since the last issue to Client/.test(ch) && /1 new/.test(ch) && /1 revised/.test(ch) && /1 already sent/.test(ch) && /1 lower/.test(ch), 'step 3: what\'s new since the last issue to Client (new / revised / already sent / lower)');
  ok(/Revisions/.test(ch) && /Names \(Project rule\)/.test(ch) && /Titles/.test(ch), 'step 3: revision, name and title checks as cards');
  await page.screenshot({ path: out + '/s2_wizard_checks.png' });
  await t.click('#wDrop'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => docs.length == 3 && !docs.some(d => d.number == 'A-102')), '"Leave these out": the already-sent A-102 is gone');
  await t.click('#wRm'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => docs.length == 2 && !docs.some(d => d.number == 'A-104')), '"Leave them out" for revision problems: the lower A-104 is gone');
  await t.click('#wNext'); await page.waitForTimeout(100);
  ok(await t.evaluate(() => document.querySelectorAll('.pk').length == 3 && document.querySelector('.pk.on').getAttribute('data-pk') == 'zip' && /TR-002 to Client/.test($('wBody').innerText)), 'step 4: package cards (zip chosen), "TR-002 to Client"');
  await page.screenshot({ path: out + '/s2_wizard_send.png' });
  await t.click('#wNext'); await page.waitForTimeout(300);
  const tr = await page.evaluate(() => LT.trLoad().log.pop());
  ok(tr.no == 'TR-002' && tr.to == 'Client' && tr.purpose == 'For construction' && tr.package == 'zip' && tr.items.map(i => i.number).sort().join() == 'A-101,A-103', 'made TR-002: to Client, For construction, zip, the 2 left');
  ok(/TR-002 is ready/.test(await t.evaluate(() => $('wBody').innerText)) && (await t.evaluate(() => $('wNext').innerText)) == 'Start another', 'done page: "TR-002 is ready" + Start another');
  await t.click('#wNext'); ok(await t.evaluate(() => wStep == 0 && !wDone), 'Start another: back to step 1');
  // the New view shows the since-last line too
  await t.evaluate(() => { setTv('new'); addFiles(['C:\\Issue\\A-101-P02.pdf', 'C:\\Issue\\A-102-P01.pdf']); $('hTo').value = 'Client'; render(); });
  ok(/since the last issue to Client: 0 new, 0 revised, 2 already sent/.test(await t.evaluate(() => $('cnt').innerText)), 'New transmittal view: "since the last issue to Client: … already sent" with leave them out');

  // ---------- saved checks (Check all) ----------
  ['PRJ-KEO-T1-ZZ-DR-A-20101-P01.pdf', 'PRJ-KEO-T1-ZZ-DR-A-20102-P01.pdf'].forEach(async n => await page.evaluate(n => window.__add('C:\\Sub2\\' + n, 'X'), n));
  await page.click('.nb[data-k="check"]'); await page.waitForTimeout(300); await c.click('[data-fv="checkall"]'); await page.waitForTimeout(600);
  const k = page.frame({ url: /checkall\.html/ }); await quiet(k);
  ok(/Saved checks/.test(await k.evaluate(() => $('saved').innerText)), 'Check all: a Saved checks row');
  await k.evaluate(() => { cfg.src = { kind: 'paste', lines: ['PRJ-KEO-T1-ZZ-DR-A-20101\tP01', 'PRJ-KEO-T1-ZZ-DR-A-20102\tP01', 'PRJ-KEO-T1-ZZ-DR-A-20103\tP01'] }; cfg.f2 = 'C:\\Sub2'; cfg.f1 = ''; LT.saveJson(FILE(), cfg); show(); });
  await k.click('#bRun'); await page.waitForTimeout(150);
  await k.evaluate(() => { window.__answer = 'Tower 1 IFC'; }); await k.click('#bSave'); await page.waitForTimeout(100);
  ok(await k.evaluate(() => cfg.saved.length == 1 && cfg.saved[0].name == 'Tower 1 IFC' && cfg.saved[0].f2 == 'C:\\Sub2' && /2 of 3 OK/.test($('saved').innerText)), 'saved "Tower 1 IFC" with its checklist, folders and last result (2 of 3 OK)');
  // something else, then one click brings it back and runs it
  await k.evaluate(() => { cfg.src = null; cfg.f2 = 'C:\\Issue'; cfg.cur = ''; LT.saveJson(FILE(), cfg); show(); R = null; render(); });
  await page.evaluate(() => window.__add('C:\\Sub2\\PRJ-KEO-T1-ZZ-DR-A-20103-P01.pdf', 'X'));
  await k.click('.sv[data-sv="0"]'); await page.waitForTimeout(150);
  ok(await k.evaluate(() => cfg.f2 == 'C:\\Sub2' && cfg.src.kind == 'paste' && R && R.rows.every(r => r.st == 'OK') && /3 of 3 OK/.test($('saved').innerText) && document.querySelector('.sv.on')), 'one click on the saved check: loads it, runs it, result updated (3 of 3 OK)');
  await page.screenshot({ path: out + '/s2_saved.png' });
  await k.click('.sv i[data-svx="0"]'); ok(await k.evaluate(() => cfg.saved.length == 0), 'the ✕ deletes a saved check');
};
