const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  // Use domcontentloaded instead of networkidle (font CDN might hang)
  await page.goto('https://jiaycare.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('errors:', JSON.stringify(errors.slice(0, 10)));
  const title = await page.title();
  console.log('title:', title);
  await browser.close();
})();
