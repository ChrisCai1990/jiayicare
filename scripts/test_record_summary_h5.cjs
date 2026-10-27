// Local synthetic UI regression; not a real-device recording.
const { chromium } = require('playwright');
const express = require('express');
const path = require('node:path'), assert = require('node:assert/strict');
(async () => {
 const review = process.argv.includes('--review'), prefix = review ? '/mobile-preview/review/' : '/mobile-preview/';
 const app = express(); app.use(prefix, express.static(path.resolve(process.env.RECORD_SUMMARY_H5_BUILD, review ? 'dist-review' : 'dist')));
 const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
 const origin = `http://127.0.0.1:${server.address().port}`;
 let browser, page;
 const report = { period: '本周记录汇总', dateRange: '10/20 - 10/27', recordCount: 1, healthScore: 99, scoreDelta: 5,
  taskCompletion: { total: 1, completed: 1, rate: 100 }, highlights: [{ type: 'warning', text: '合成旧建议：建议就医' }], summary: [{ title: '旧判断', desc: '合成旧医疗判定' }],
  metrics: [{ type: 'bloodPressure', label: '血压', value: '130/85', unit: 'mmHg', status: 'danger', delta: '+10/+5', trend: 'up', count: 1 }] };
 try {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await context.addInitScript(({ review }) => localStorage.setItem((review ? 'review:' : '')+'jy_token', JSON.stringify({ data: 'synthetic-session' })), { review });
  await context.route('**/*', async route => {
   if (route.request().url().startsWith(origin+'/')) return route.continue();
   const url = new URL(route.request().url()); let data = [];
   if (url.pathname.endsWith('/user/me')) data = { _id: 'synthetic-user', name: '合成测试', healthScore: 99, healthScoreDetail: { grade: '优' } };
   else if (url.pathname.endsWith('/user/report')) data = report;
   else if (url.pathname.endsWith('/user/dashboard')) data = { has_any_health_data: true, scoreHistory: [{date:'10/27',score:99}], latestVitals: { bloodPressure: { status: 'high' } }, growth: { totalCheckinDays: 1 }, todayReminders: [] };
   else if (url.pathname.includes('/share/')) data = { reportData: report, userName: '合成用户', expiresAt: '2027-01-01T00:00:00Z' };
   else if (url.pathname.endsWith('/records')) data = [{ _id: 'synthetic-record', type: 'bloodPressure', value: '130/85', unit: 'mmHg', recordedAt: '2026-10-27T01:00:00Z', note: '原始报告中的医生结论（合成文本）' }];
   return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, total: Array.isArray(data) ? data.length : undefined }) });
  });
  page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+prefix+'#/pages/records/report/index');
  await page.getByText('130/85', { exact: true }).waitFor();
  assert.equal(await page.getByText('合成旧建议：建议就医').count(),0);
  assert.equal(await page.getByText('合成旧医疗判定').count(),0);
  assert.equal(await page.getByText('99', { exact: true }).count(),0);
  await page.getByText(/本期共记录/).click();
  await page.getByText('原始报告中的医生结论（合成文本）').waitFor();
  await page.screenshot({path:path.resolve('artifacts/record-summary-20261027/'+(review?'review':'normal')+'-synthetic-record-summary.png'),fullPage:true});
  await page.goto(origin+prefix+'#/pages/records/public-report/index?token=synthetic-token');
  await page.getByText('130/85',{exact:true}).waitFor();
  assert.equal(await page.getByText('合成旧建议：建议就医').count(),0);
  assert.equal(await page.getByText('99',{exact:true}).count(),0);
  await page.goto(origin+prefix+'#/pages/home/index');
  await page.getByText('记录汇总 ›',{exact:true}).waitFor();
  assert.equal(await page.getByText('健康评分 ›',{exact:true}).count(),0);
  await page.getByText('记录汇总 ›',{exact:true}).click();
  await page.getByText('健康记录汇总',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({variant:review?'review':'normal',passed:true,oldAssessmentHidden:true,originalReportTextPreserved:true,externalNetwork:'intercepted'}));
 } catch(e) { if(page) console.error(page.url(),await page.locator('body').innerText());throw e; }
 finally { if(browser) await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
