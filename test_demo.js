const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('https://jiaycare.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Click 演示体验
  await page.click('text=演示体验');
  await page.waitForTimeout(3000);
  
  const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('after demo login:', text);
  
  // Navigate to questionnaire - look for the tab
  const questBtn = await page.$('text=随访') || await page.$('text=任务') || await page.$('text=问卷');
  if (questBtn) {
    await questBtn.click();
    await page.waitForTimeout(2000);
  }
  
  // Find questionnaire entry
  const allText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('tabs text:', allText);
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
