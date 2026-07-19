const puppeteer = require('puppeteer');
const path = require('path');

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage();

  // 设置视口宽度足够显示 1080px 海报
  await page.setViewport({ width: 1300, height: 900, deviceScaleFactor: 2 });

  const filePath = 'file://' + path.resolve(__dirname, 'poster.html').replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'networkidle0' });

  // 等待渲染
  await new Promise(r => setTimeout(r, 1000));

  // 获取 3 个 .poster 元素并截图
  const posters = await page.$$('.poster');
  const names = ['poster1-首页健康指标.png', 'poster2-健康档案.png', 'poster3-提醒与报告.png', 'poster4-ClaudeCode开发.png'];

  for (let i = 0; i < posters.length; i++) {
    const outPath = path.join(__dirname, names[i]);
    await posters[i].screenshot({ path: outPath });
    console.log(`✅ 已生成：${names[i]}`);
  }

  await browser.close();
  console.log('\n🎉 3 张海报已保存到 promo 文件夹');
}

main().catch(console.error);
