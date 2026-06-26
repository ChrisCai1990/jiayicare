const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('https://jiaycare.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Fill phone number
  const phoneInput = await page.$('input[placeholder*="手机"]') || await page.$('input[type="tel"]') || await page.$('input');
  if (phoneInput) {
    await phoneInput.fill('13800138000');
    console.log('filled phone');
  } else {
    // Try to find any input
    const inputs = await page.$$('input');
    console.log('inputs found:', inputs.length);
    if (inputs.length > 0) await inputs[0].fill('13800138000');
  }
  
  // Take snapshot to see what the page looks like
  const html = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log('page text:', html);
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
