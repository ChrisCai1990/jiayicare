const { chromium, webkit } = require('../../apple-ios-build3-20261019/node_modules/playwright');

const base = process.env.MOBILE_H5_URL || 'http://127.0.0.1:8765/mobile-preview/';
const user = { _id: 'smoke-user', name: '测试用户', careTeam: [{ kind: 'healthManager', name: '测试顾问' }], bodyCompHistory: process.env.SMOKE_CHART_LAYOUT ? [
  { weight: '51.1', measuredAt: '2026-01-21' }, { weight: '51.2', measuredAt: '2026-02-25' },
  { weight: '50.1', measuredAt: '2026-05-23' }, { weight: '48.5', measuredAt: '2026-10-22' },
] : process.env.SMOKE_RECENT_TRENDS ? [{ weight: '68.5', measuredAt: new Date().toISOString() }] : {} };
const record = (type, value, date, extra = {}) => ({ _id: `${type}-${date}`, type, value, recordedAt: date, extra });
const yesterdayNoonBeijing = new Date(Date.now() + 8 * 3600000);
yesterdayNoonBeijing.setUTCDate(yesterdayNoonBeijing.getUTCDate() - 1);
yesterdayNoonBeijing.setUTCHours(4, 10, 0, 0);
const records = [
  record('bloodPressure', '125/81', '2025-01-03T02:00:00.000Z', { sys: 125, dia: 81, arm: '左臂' }),
  record('weight', '68.5', '2025-01-04T02:00:00.000Z'),
  ...(process.env.SMOKE_RECENT_TRENDS ? [record('bloodPressure', '125/81', new Date().toISOString(), { sys: 125, dia: 81, arm: '左臂' }), record('weight', '68.5', new Date().toISOString())] : []),
  ...(process.env.SMOKE_CHART_LAYOUT ? [
    record('bloodPressure', '121/79', '2026-10-09T01:15:00.000Z', { sys: 121, dia: 79, arm: '右臂' }),
    record('bloodPressure', '122/84', '2026-10-09T01:16:00.000Z', { sys: 122, dia: 84, arm: '右臂' }),
    record('bloodPressure', '111/68', '2026-10-22T01:12:00.000Z', { sys: 111, dia: 68, arm: '右臂' }),
    record('bloodPressure', '118/76', new Date().toISOString(), { sys: 118, dia: 76 }),
    ...[7.5, 7.8, 8.5, 9.7].map((value, index) => record('sleep', String(value), `2026-10-${[22, 23, 24, 26][index]}T02:00:00.000Z`)),
  ] : []),
];
const notification = { _id: 'questionnaire-1', type: 'questionnaire', sender: '测试顾问', title: '问卷调查', content: '睡眠评估问卷，请按实际情况填写。', questionnaireId: 'form-1', createdAt: yesterdayNoonBeijing.toISOString(), unread: true };
const systemNotification = { _id: 'system-1', type: 'system', sender: '系统通知', title: '历史消息', content: '测试系统消息', createdAt: yesterdayNoonBeijing.toISOString(), unread: false };

async function run() {
  const browser = process.env.SMOKE_WEBKIT
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: process.env.SMOKE_CHART_LAYOUT ? 760 : 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(() => {
    localStorage.setItem('jy_token', 'smoke-token');
    localStorage.setItem('jy_user', JSON.stringify({ _id: 'smoke-user', name: '测试用户', careTeam: [{ kind: 'healthManager', name: '测试顾问' }], bodyCompHistory: {} }));
  });
  await context.route('https://jiaycare.com/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(4);
    let data = { success: true, data: [] };
    if (path === '/user/me') data = { success: true, data: user };
    else if (path === '/user/report') data = { success: true, data: {
      periodLabel: url.searchParams.get('period') === 'month' ? '本月记录汇总' : '本周记录汇总',
      dateRange: url.searchParams.get('period') === 'month' ? '10/11 - 11/10' : '11/3 - 11/10',
      recordCount: process.env.SMOKE_CHART_LAYOUT ? 6 : 2, taskCompletion: { total: 0, completed: 0, rate: 0 },
      metrics: [{ type: 'bloodPressure', label: '血压', value: '118/76', unit: 'mmHg', delta: '+7/+8' }],
    } };
    else if (path === '/guardian-children' || path === '/family-links') data = { success: true, data: [] };
    else if (path === '/records') {
      const type = url.searchParams.get('type');
      const days = Number(url.searchParams.get('days'));
      const selected = records.filter(row => (!type || row.type === type) && (!days || new Date(row.recordedAt).getTime() >= Date.now() - days * 86400000))
        .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
      data = { success: true, data: selected, total: selected.length, page: 1 };
    } else if (path.startsWith('/records/trend/')) {
      const now = new Date().toISOString();
      data = { success: true, data: process.env.SMOKE_CHART_LAYOUT && path.endsWith('/bloodPressure')
        ? [record('bloodPressure', '111/68', '2026-10-22T02:00:00.000Z', { sys: 111, dia: 68, arm: '右臂' }), record('bloodPressure', '118/76', new Date().toISOString(), { sys: 118, dia: 76 })]
        : process.env.SMOKE_CHART_LAYOUT && path.endsWith('/sleep')
          ? [7.5, 7.8, 8.5, 9.7].map((value, index) => record('sleep', String(value), `2026-10-${[22, 23, 24, 26][index]}T02:00:00.000Z`))
        : process.env.SMOKE_RECENT_TRENDS && path.endsWith('/bloodPressure')
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
  if (base.startsWith('http://127.0.0.1')) await context.route('**/mobile-preview/demo/entry.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
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
  await page.getByText('档案工具', { exact: true }).waitFor({ timeout: 10000 });
  if (await page.getByText('历史健康记录', { exact: true }).count()) throw new Error('Unexpected history section below the archive');
  if (process.env.SMOKE_CHART_LAYOUT) {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'output/chart-layout-webkit.png', fullPage: true });
    await page.getByText('睡眠', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'output/chart-layout-sleep-webkit.png', fullPage: true });
    console.log('chart screenshot saved');
  }
  if (process.env.SMOKE_CHART_DIAG) console.log('canvas diagnostics', await page.evaluate(() => [...document.querySelectorAll('canvas')].map(node => {
    const pixels = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
    let painted = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) painted++;
    return { canvasId: node.getAttribute('canvas-id'), width: node.width, height: node.height, rectWidth: node.getBoundingClientRect().width, painted };
  })));
  if (process.env.SMOKE_REPORT_LAYOUT) {
    await page.getByText('健康报告', { exact: true }).first().click();
    await page.getByText('近30天', { exact: true }).first().click();
    await page.getByText('近30天记录汇总').waitFor();
    await page.getByText('本时段该手臂仅有 1 次记录，暂无变化趋势').waitFor();
    if (process.env.SMOKE_CHART_LAYOUT) {
      await page.getByText('近30天血压记录：2 次').waitFor();
      await page.getByText('111/68 mmHg', { exact: true }).last().waitFor();
      await page.getByText('118/76 mmHg', { exact: true }).last().waitFor();
      await page.getByText('睡眠', { exact: true }).last().waitFor();
      await page.getByText('9.7').last().waitFor();
      await page.waitForTimeout(500);
      const painted = await page.evaluate(() => [...document.querySelectorAll('canvas[canvas-id^="trend-line"]')]
        .filter(node => node.closest('.taro_page')?.classList.contains('taro_page_show'))
        .map(node => {
          const data = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
          let count = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
          return count;
        }));
      if (!painted.some(count => count > 0)) throw new Error(`Report trend canvas is blank: ${painted}`);
      console.log('report trend pixels', painted);
    }
    if (await page.getByText('0/0 任务完成', { exact: false }).count()) throw new Error('Empty task progress is visible');
    await page.screenshot({ path: 'output/report-layout-webkit.png', fullPage: true });
    console.log('report layout', (await page.locator('body').innerText()).slice(0, 420));
    await browser.close();
    return;
  }
  if (process.env.SMOKE_RECENT_TRENDS) await page.getByText('收缩压 125 · 舒张压 81 mmHg').waitFor();
  if (process.env.SMOKE_RECENT_TRENDS) console.log('records-after-trends', (await page.locator('body').innerText()).slice(0, 800), errors);
  await page.getByText('体重', { exact: true }).last().click();
  await page.getByText(process.env.SMOKE_CHART_LAYOUT ? '48.5 kg' : '68.5 kg').last().waitFor();
  console.log('archive matches mini program layout');
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
