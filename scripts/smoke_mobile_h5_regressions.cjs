const { chromium, webkit } = require('../../apple-ios-build3-20261019/node_modules/playwright');

const base = process.env.MOBILE_H5_URL || 'http://127.0.0.1:8765/mobile-preview/';
const user = { _id: 'smoke-user', name: '测试用户', careTeam: [{ kind: 'healthManager', name: '测试顾问' }], bodyCompHistory: process.env.SMOKE_RECENT_TRENDS ? [{ weight: '68.5', measuredAt: new Date().toISOString() }] : {} };
const record = (type, value, date, extra = {}) => ({ _id: `${type}-${date}`, type, value, recordedAt: date, extra });
const yesterdayNoonBeijing = new Date(Date.now() + 8 * 3600000);
yesterdayNoonBeijing.setUTCDate(yesterdayNoonBeijing.getUTCDate() - 1);
yesterdayNoonBeijing.setUTCHours(4, 10, 0, 0);
const records = [
  record('bloodPressure', '125/81', '2025-01-03T02:00:00.000Z', { sys: 125, dia: 81, arm: '左臂' }),
  record('weight', '68.5', '2025-01-04T02:00:00.000Z'),
];
const notification = { _id: 'questionnaire-1', type: 'questionnaire', sender: '测试顾问', title: '问卷调查', content: '睡眠评估问卷，请按实际情况填写。', questionnaireId: 'form-1', createdAt: yesterdayNoonBeijing.toISOString(), unread: true };
const systemNotification = { _id: 'system-1', type: 'system', sender: '系统通知', title: '历史消息', content: '测试系统消息', createdAt: yesterdayNoonBeijing.toISOString(), unread: false };

async function run() {
  const browser = process.env.SMOKE_WEBKIT
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(() => {
    localStorage.setItem('jy_token', 'smoke-token');
    localStorage.setItem('jy_user', JSON.stringify({ _id: 'smoke-user', name: '测试用户', careTeam: [{ kind: 'healthManager', name: '测试顾问' }], bodyCompHistory: {} }));
  });
  await context.route('https://jiaycare.com/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(4);
    let data = { success: true, data: [] };
    if (path === '/user/me') data = { success: true, data: user };
    else if (path === '/guardian-children' || path === '/family-links') data = { success: true, data: [] };
    else if (path === '/records') {
      const type = url.searchParams.get('type');
      const selected = type ? records.filter(row => row.type === type) : records;
      data = { success: true, data: selected, total: selected.length, page: 1 };
    } else if (path.startsWith('/records/trend/')) {
      const now = new Date().toISOString();
      data = { success: true, data: process.env.SMOKE_RECENT_TRENDS && path.endsWith('/bloodPressure')
        ? [record('bloodPressure', '125/81', now, { sys: 125, dia: 81, arm: '左臂' })]
        : process.env.SMOKE_RECENT_TRENDS && path.endsWith('/weight') ? [record('weight', '68.5', now)] : [] };
    }
    else if (path === '/ibd/status') data = { success: true, data: { enabled: false } };
    else if (path === '/messages') data = { success: true, data: [notification, systemNotification] };
    else if (path === '/messages/thread/manager') data = { success: true, data: [] };
    else if (path === '/messages/unread-count') data = { success: true, count: 1 };
    else if (path === '/questionnaire/pending') data = { success: true, data: [{ _id: 'form-1', assignmentId: 'questionnaire-1' }] };
    else if (path === '/auth/session/activity') data = { success: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('requestfailed', request => errors.push(`request failed ${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  if (process.env.SMOKE_RECORDS_LOOP) {
    for (let attempt = 1; attempt <= Number(process.env.SMOKE_RECORDS_LOOP); attempt++) {
      await page.getByText('健康档案', { exact: true }).last().click();
      await page.waitForTimeout(1800);
      const state = await page.evaluate(() => ({ route: location.hash, text: document.body.innerText.slice(0, 250), pages: [...document.querySelectorAll('.taro_page')].map(node => ({ id: node.id, className: node.className, text: node.innerText.slice(0, 100) })), diagnostic: window.__h5DiagnosticErrors }));
      console.log('records loop', attempt, JSON.stringify(state), errors);
      if (!state.text.includes('当前健康档案')) break;
      await page.getByText('首页', { exact: true }).last().click();
      await page.waitForTimeout(200);
    }
    await browser.close();
    return;
  }
  await page.getByText('健康档案', { exact: true }).last().click();
  if (process.env.SMOKE_WEBKIT) { await page.waitForTimeout(1800); console.log('records debug', (await page.locator('body').innerText()).slice(0, 500), errors, await page.evaluate(() => ({appHtml:document.getElementById('app')?.innerHTML.slice(0,1300), bodyChildren:[...document.body.children].map(node=>[node.tagName,node.id,node.className]).slice(0,10)}))); }
  await page.getByText('历史健康记录').waitFor({ timeout: 10000 });
  await page.getByText('125/81 mmHg').last().waitFor();
  if (process.env.SMOKE_RECENT_TRENDS) console.log('records-after-trends', (await page.locator('body').innerText()).slice(0, 800), errors);
  await page.getByText('体重', { exact: true }).last().click();
  await page.getByText('68.5 kg').last().waitFor();
  console.log('records history visible');
  await page.getByText('健康管家', { exact: true }).last().click();
  await page.locator('taro-text-core:visible').filter({ hasText: '测试顾问' }).first().click();
  await page.getByText('发送消息，您的健管专员会在工作时间内回复您').waitFor({ timeout: 10000 });
  console.log('conversation loaded');
  await page.getByText('返回', { exact: false }).first().click();
  await page.getByText('待填问卷').first().click();
  await page.getByText('睡眠评估问卷，请按实际情况填写。').first().click();
  const button = page.getByText('填写问卷', { exact: true });
  await button.waitFor();
  const buttonBox = await button.boundingBox();
  const tabBox = await page.getByText('健康管家', { exact: true }).last().boundingBox();
  if (!buttonBox || !tabBox || buttonBox.y + buttonBox.height > tabBox.y) throw new Error('questionnaire button covered by tab bar');
  console.log('questionnaire action visible above tab bar');
  await page.getByText('关闭', { exact: true }).last().click();
  await page.getByText('系统通知', { exact: true }).last().click();
  await page.getByText('昨天 12:10', { exact: true }).waitFor();
  console.log('notification shows yesterday 12:10');
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  await browser.close();
}

run().catch(error => { console.error(error); process.exitCode = 1; });
