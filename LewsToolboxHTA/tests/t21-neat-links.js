// References show a short neat name (no long paths / links); "Show as" and ✎ rename; the full link stays on hover and opens on click
module.exports = async ({ page, out }) => {
  const ok = (c, w) => console.log((c ? 'PASS ' : 'FAIL ') + w);
  await page.click('.nb[data-k="tracker"]'); await page.waitForTimeout(500); await page.mouse.move(900, 600);
  const t = page.frame({ url: /tracker\.html/ });
  await t.click('#bDetail'); await t.fill('#eTitle', 'Roof kitchen update');
  const add = async (kind, val, as) => { await t.selectOption('#eRefs .rfk', kind); await t.fill('#eRefs .rfnew', val); if (as != null) await t.fill('#eRefs .rfas', as); await t.click('#eRefs .rfa'); };
  await add('link', 'https://keo.sharepoint.com/sites/Tower1/Shared%20Documents/03%20PUBLISHED/Drawings/Roof%20Kitchen%20Equipment%20Schedule.xlsx?web=1');
  await add('link', 'https://acc.autodesk.com/docs/files/projects/7c1e0b6a-1234-4f00-9abc-0123456789ab?folderUrn=urn%3Aadsk.wipprod%3Afs.folder%3Aco.abc', 'ACC - Tower 1 model');
  await add('file', 'P:\\5013 Tower 1\\03 WIP\\01 Architecture\\Roof\\Kitchen\\Markups\\2026-11-10\\A-501 Roof kitchen markup rev B.pdf');
  const rows = await t.evaluate(() => [].map.call(document.querySelectorAll('#eRefs .rf'), r => [r.querySelector('.rfn').innerText, r.querySelector('.rfw').innerText, r.querySelector('.rfn').title.length]));
  console.log('   ' + rows.map(r => r.slice(0, 2).join('  |  ')).join('\n   '));
  ok(rows[0][0] == 'Roof Kitchen Equipment Schedule.xlsx' && rows[0][1] == 'keo.sharepoint.com', 'a long SharePoint link shows as its file name + the site');
  ok(rows[1][0] == 'ACC - Tower 1 model' && rows[1][1] == 'acc.autodesk.com', '"Show as" gives your own short name');
  ok(rows[2][0] == 'A-501 Roof kitchen markup rev B.pdf' && rows[2][1] == '…\\Markups\\2026-11-10', 'a deep path shows the file name + only the last two folders');
  ok(rows.every(r => r[2] > 60), 'the full link / path is still there on hover');
  ok(await t.evaluate(() => !document.querySelector('#eRefs .rf .rfv')), 'no long text boxes in the list');
  // rename with ✎
  await t.click('#eRefs .rf:nth-child(1) .rfe'); await t.fill('#eRefs .rf:nth-child(1) .rfl', 'Equipment schedule'); await t.press('#eRefs .rf:nth-child(1) .rfl', 'Enter');
  ok(await t.evaluate(() => work.refs[0].label == 'Equipment schedule' && document.querySelector('#eRefs .rf .rfn').innerText == 'Equipment schedule'), '✎ rename: Enter saves the short name');
  await page.screenshot({ path: out + '/s_neat_refs.png', clip: { x: 200, y: 0, width: 980, height: 700 } });
  // the name opens the link
  const opened = await t.evaluate(() => { var o = null, k = LT.open; LT.open = function (p) { o = p; }; document.querySelector('#eRefs .rf:nth-child(2) .rfn').click(); LT.open = k; return o; });
  ok(/^https:\/\/acc\.autodesk\.com\/docs/.test(opened || ''), 'clicking the name opens the full link');
  await t.click('#eOk');
  ok(await t.evaluate(() => /Equipment schedule/.test($('main').innerText) && !/sharepoint\.com\/sites/.test($('main').innerText)), 'the task list shows the short names only');
};
