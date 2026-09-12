// Local-only end-to-end verification. Uses a disposable Mongo database and synthetic
// usage entries, never launches the production backend or a model request.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.AI_BUDGET_UI_OUTPUT || path.join(root, '../..', 'inbox', 'ai-budget-review'));

async function main() {
  const uri = process.env.AI_BUDGET_TEST_MONGO;
  assert.match(uri || '', /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/);
  const dbName = `jiayicare_ai_budget_test_${randomUUID().replace(/-/g, '')}`;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 3000 });
  let server, vite, browser;
  try {
    require('express-async-errors');
    process.env.JWT_SECRET = randomUUID();
    const { collection } = require('../backend/src/utils/aiBudgetStore');
    const { DEFAULT_POLICY, periodKeys } = require('../backend/src/utils/aiBudgetPolicy');
    const { day, month } = periodKeys();
    const adminId = new mongoose.Types.ObjectId(), reportId = new mongoose.Types.ObjectId();
    await collection('admins').insertOne({ _id: adminId, role: 'superadmin', name: '本地验收' });
    await collection('ai_control').insertOne({ _id: 'policy', ...DEFAULT_POLICY, revision: 0 });
    await collection('ai_budget_counters').insertMany([
      { _id: `day:${day}`, tokens: 328000, calls: 26, micros: 1280000 },
      { _id: `month:${month}`, tokens: 2360000, calls: 184, micros: 9250000 },
      { _id: `business:ocr:${day}`, tokens: 302000, calls: 22, micros: 1180000 },
      { _id: `business:other:${day}`, tokens: 26000, calls: 4, micros: 100000 },
    ]);
    await collection('ai_circuits').insertOne({ _id: 'qwen:qwen-vl-max', failures: 5, paused: true });
    await collection('medicalreports').insertOne({ _id: reportId, aiStatus: 'failed', parseJob: { status: 'paused', message: '第 3 页累计预算不足，已暂停。请管理员调整额度后继续', pausedAt: new Date(), progress: { version: 2, nextPage: 3 } } });
    await collection('ai_usage').insertMany([
      { _id: randomUUID(), createdAt: new Date(), reportId: String(reportId), page: 3, business: 'ocr', stage: 'evidence', provider: 'qwen', model: 'qwen-vl-max', status: 'unknown', reservedTokens: 26000, actualTokens: null, costMicros: null, durationMs: 45000 },
      { _id: randomUUID(), createdAt: new Date(Date.now() - 60000), reportId: String(reportId), page: 2, business: 'ocr', stage: 'recognize', provider: 'qwen', model: 'qwen-vl-plus', status: 'success', inputTokens: 12000, outputTokens: 2000, actualTokens: 14000, costMicros: 28000, durationMs: 12400 },
    ]);
    // Queue dispatch is explicitly replaced: resume UI must never invoke real OCR in this test.
    const staffPath = require.resolve('../backend/src/routes/staff');
    let scheduled = '';
    require.cache[staffPath] = { id: staffPath, filename: staffPath, loaded: true, exports: { scheduleReportParse: id => { scheduled = String(id); } } };
    const express = require('express'), app = express();
    app.use(require('cors')({ origin: 'http://localhost:5186' })); app.use(express.json());
    app.get('/api/admin/feedback', (req, res) => res.json({ success: true, data: [] }));
    app.use('/api/admin/ai-control', require('../backend/src/routes/aiControl'));
    app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
    server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
    vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '5186', '--strictPort'], {
      cwd: path.join(root, 'admin'), env: { ...process.env, VITE_API_URL: `http://127.0.0.1:${server.address().port}/api` }, windowsHide: true, stdio: 'pipe',
    });
    let viteOutput = ''; vite.stdout.on('data', data => { viteOutput += data; }); vite.stderr.on('data', data => { viteOutput += data; });
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => { if (viteOutput.includes('Local:')) { clearInterval(timer); clearTimeout(deadline); resolve(); } }, 100);
      const deadline = setTimeout(() => { clearInterval(timer); reject(new Error('Vite did not start: ' + viteOutput)); }, 15000);
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const token = require('jsonwebtoken').sign({ type: 'admin', id: String(adminId) }, process.env.JWT_SECRET);
    await page.addInitScript(({ token, id }) => { localStorage.setItem('jy_admin_token', token); localStorage.setItem('jy_admin_info', JSON.stringify({ _id: id, role: 'superadmin', name: '本地验收' })); }, { token, id: String(adminId) });
    await page.goto('http://localhost:5186/settings/ai-usage');
    await page.getByText('预算保护运行中', { exact: true }).waitFor();
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'overview.png'), fullPage: true });
    await page.getByRole('button', { name: '暂停 OCR', exact: true }).click();
    await page.getByText('OCR 已暂停', { exact: true }).waitFor();
    assert.equal((await collection('ai_control').findOne({ _id: 'policy' })).ocrPaused, true);
    await page.getByRole('button', { name: '解除 OCR 暂停', exact: true }).click();
    await page.getByText('预算保护运行中', { exact: true }).waitFor();
    await page.getByRole('button', { name: '查看 / 追加额度' }).click();
    await page.getByRole('cell', { name: /用量待核对/ }).waitFor();
    await page.screenshot({ path: path.join(output, 'usage.png'), fullPage: true });
    await page.getByRole('button', { name: '追加额度', exact: true }).click();
    await page.getByText('追加额度已生效', { exact: true }).waitFor();
    assert.equal((await collection('ai_budget_counters').findOne({ _id: `report:${reportId}` })).extraTokens, 100000);
    await page.getByRole('tab', { name: '额度设置' }).click();
    const field = page.getByLabel('每日总 Token', { exact: true });
    await field.fill('2400000');
    await page.getByRole('button', { name: '保存并生效' }).click();
    await page.getByText('设置已生效，新调用将使用更新后的限额。', { exact: true }).waitFor();
    assert.equal((await collection('ai_control').findOne({ _id: 'policy' })).dailyTokens, 2400000);
    await page.screenshot({ path: path.join(output, 'policy.png'), fullPage: true });
    await page.getByRole('tab', { name: '用量总览' }).click();
    await page.getByRole('button', { name: '解除模型暂停' }).click();
    await page.getByText('模型已解除暂停，报告任务需单独恢复。', { exact: true }).waitFor();
    assert.equal((await collection('ai_circuits').findOne({ _id: 'qwen:qwen-vl-max' })).paused, false);
    await page.getByRole('button', { name: '恢复识别', exact: true }).click();
    await page.getByText('任务已恢复排队', { exact: true }).waitFor();
    assert.equal(scheduled, String(reportId));
    assert.equal((await collection('medicalreports').findOne({ _id: reportId })).parseJob.progress.nextPage, 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().right <= 0);
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), syntheticData: true, actualModelCalls: 0, checks: ['pause OCR', 'resume OCR', 'usage filter', 'additional allowance', 'save policy', 'reset circuit', 'resume with checkpoint', 'mobile overflow', 'no page errors'] }, null, 2));
    console.log('AI_BUDGET_UI_VERIFIED ' + output);
  } finally {
    if (browser) await browser.close();
    if (vite) vite.kill();
    if (server) await new Promise(resolve => server.close(resolve));
    assert.match(mongoose.connection.name, /^jiayicare_ai_budget_test_[a-f\d]{32}$/);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
