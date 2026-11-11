/* Test kit only: opens the Toolbox in Chromium with the pretend Windows, runs a test script, takes screenshots.
   node tests/run.js <test.js> [outdir]     (needs Playwright; NODE_PATH=$(npm root -g)) */
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const APP = path.resolve(__dirname, '..');
(async () => {
  const work = '/tmp/claude-0/hta-run'; fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const seed = {};
  (function copy(rel) {
    for (const n of fs.readdirSync(path.join(APP, rel))) {
      const r = path.join(rel, n), full = path.join(APP, r);
      if (r.startsWith('tests') || r.startsWith('tools')) continue;
      if (fs.statSync(full).isDirectory()) { fs.mkdirSync(path.join(work, r), { recursive: true }); copy(r); continue; }
      const out = path.join(work, r.replace(/\.hta$/, '.html')); fs.copyFileSync(full, out);
      if (/\.(html|hta|js)$/.test(n)) seed[(work.slice(1) + '/' + r).replace(/\//g, '\\')] = fs.readFileSync(full, 'latin1');
    }
  })('');
  const mock = fs.readFileSync(path.join(__dirname, 'mock-windows.js'), 'utf8');
  const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
  const ctx = await b.newContext({ viewport: { width: 1180, height: 700 } });
  await ctx.addInitScript('window.__SEED=' + JSON.stringify(seed) + ';\n' + mock);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { errors.push('DIALOG: ' + d.message().slice(0, 200)); d.accept(); });
  await page.goto('file://' + work + '/LewsToolbox.html'); await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = document.getElementById('wnOk'); if (b) b.click(); });   // the "What's new" note after an update
  const test = require(path.resolve(process.argv[2]));
  await test({ page, errors, work, out: process.argv[3] || '/tmp/claude-0' });
  console.log(errors.length ? 'PAGE ERRORS:\n  ' + errors.join('\n  ') : 'no page errors');
  await b.close();
})().catch(e => { console.error('RUN FAILED', e); process.exit(1); });
