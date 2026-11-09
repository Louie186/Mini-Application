module.exports = async ({ page, out }) => {
  const f = n => page.frame({ url: new RegExp(n) });
  console.log('nav:', (await page.$$eval('.nb', bs => bs.map(b => b.textContent.trim()))).join(' | '));
  const lf = f('launcher.html'); console.log('launcher frame:', !!lf, lf && (await lf.$('#bAdd')) ? 'has + Add' : 'missing');
  await page.screenshot({ path: out + '/h_launcher.png' });
  await page.click('.nb[data-k="settings"]'); await page.waitForTimeout(800);
  const sf = f('settings.html'); await sf.click('[data-theme="console"]'); await page.waitForTimeout(500);
  await page.screenshot({ path: out + '/h_settings.png' });
  await page.click('.nb[data-k="launcher"]'); await page.waitForTimeout(400);
  console.log('launcher theme now:', await f('launcher.html').evaluate(() => store.theme));
  await page.screenshot({ path: out + '/h_launcher2.png' });
  console.log('log:', (await page.evaluate(() => window.__fsLog.slice(0, 12))).join('\n  '));
};
