const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('https://jiaycare.com', { waitUntil: 'networkidle', timeout: 20000 });
  console.log(JSON.stringify(errors.slice(0, 20)));
  await browser.close();
})();
