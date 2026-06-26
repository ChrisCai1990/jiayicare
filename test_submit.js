const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();
  const errors = [];
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('https://jiaycare.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  
  const title = await page.title();
  const url = page.url();
  console.log('title:', title, 'url:', url);
  
  // Check what JS bundle is loaded
  const scriptSrc = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return scripts.map(s => s.src);
  });
  console.log('scripts:', JSON.stringify(scriptSrc));
  
  // Check errors
  console.log('errors:', JSON.stringify(errors));
  console.log('logs:', JSON.stringify(logs.slice(0, 10)));
  
  await browser.close();
})();
