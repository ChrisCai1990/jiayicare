const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://jiaycare.com', { waitUntil: 'networkidle', timeout: 20000 });
  await page.screenshot({ path: 'page_check.png', fullPage: true });
  const title = await page.title();
  console.log('title:', title);
  const html = await page.evaluate(() => document.body.innerHTML.slice(0, 500));
  console.log('body:', html);
  await browser.close();
})();
