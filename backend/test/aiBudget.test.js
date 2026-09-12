const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_POLICY, validatePolicy, periodKeys, estimateTokens, actualUsage, budgetScopes } = require('../src/utils/aiBudgetPolicy');
const { createBudgetRunner, withAiContext } = require('../src/utils/aiBudget');

test('policy rejects disabled token limits, malformed prices and invalid warning thresholds', () => {
  assert.deepEqual(validatePolicy(DEFAULT_POLICY), DEFAULT_POLICY);
  for (const patch of [{ pageCalls: 0 }, { dailyTokens: '100' }, { prices: { 'bad.model': { input: 1, output: 1 } } }, { warningPercent: 100 }, { prices: { qwen: { input: 1, output: '' } } }]) {
    assert.throws(() => validatePolicy({ ...DEFAULT_POLICY, ...patch }));
  }
  assert.equal(actualUsage({ total_tokens: 100 }), null);
  assert.equal(actualUsage({ prompt_tokens: 20, completion_tokens: 30 }).total, 50);
});

test('budget periods use Shanghai time and report/page budgets survive day and job changes', () => {
  assert.deepEqual(periodKeys(new Date('2026-09-30T16:00:00Z')), { day: '2026-10-01', month: '2026-10' });
  const ctx = { business: 'ocr', reportId: 'report', page: 3 };
  const a = budgetScopes(DEFAULT_POLICY, ctx, new Date('2026-09-01'));
  const b = budgetScopes(DEFAULT_POLICY, { ...ctx, attemptId: 'new' }, new Date('2026-10-01'));
  assert.deepEqual(a.slice(-2), b.slice(-2));
  assert.ok(estimateTokens([{ content: [{ type: 'image_url' }, { type: 'text', text: '中文' }] }], 100).total > 16384);
});

test('Mongo integration: concurrent reservations, timeout accounting, circuits and management permissions', { skip: !process.env.AI_BUDGET_TEST_MONGO }, async t => {
  // Only an explicitly requested local server and a newly named disposable DB may be used.
  const uri = process.env.AI_BUDGET_TEST_MONGO;
  assert.match(uri, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/);
  const mongoose = require('mongoose');
  const dbName = `jiayicare_ai_budget_test_${require('crypto').randomUUID().replace(/-/g, '')}`;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 3000 });
  const { store, collection } = require('../src/utils/aiBudgetStore');
  const date = new Date('2026-09-12T04:00:00Z');
  const run = createBudgetRunner(store, () => date);
  const options = { provider: 'qwen', model: 'qwen-vl-plus', messages: [{ role: 'user', content: 'test' }], maxTokens: 100, context: { business: 'ocr', reportId: 'a'.repeat(24), page: 1 } };
  const success = () => Promise.resolve({ usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 }, choices: [{ message: { content: '{"items":[]}' }, finish_reason: 'stop' }] });
  const reset = async patch => {
    for (const name of ['ai_control', 'ai_budget_counters', 'ai_usage', 'ai_circuits', 'ai_control_audit']) await collection(name).deleteMany({});
    await collection('ai_control').insertOne({ _id: 'policy', ...DEFAULT_POLICY, revision: 0, ...patch });
  };
  try {
    await t.test('twenty simultaneous calls cannot overspend a page call limit', async () => {
      await reset({ pageCalls: 3 });
      let sent = 0;
      const results = await Promise.allSettled(Array.from({ length: 20 }, () => run(options, async () => { sent++; return success(); })));
      assert.equal(sent, 3);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
      const page = await collection('ai_budget_counters').findOne({ _id: `page:${options.context.reportId}:1` });
      const day = await collection('ai_budget_counters').findOne({ _id: 'day:2026-09-12' });
      assert.equal(page.calls, 3); assert.equal(page.tokens, 150);
      assert.equal(day.calls, 3); assert.equal(day.tokens, 150);
      assert.equal(await collection('ai_usage').countDocuments(), 3);
    });
    await t.test('timeouts retain reservations and trip persistent model circuit', async () => {
      await reset({ failureThreshold: 2 });
      let sent = 0;
      const send = async () => { sent++; const error = new Error('sensitive provider echo'); error.code = 'AI_TIMEOUT'; throw error; };
      await assert.rejects(run(options, send)); await assert.rejects(run(options, send));
      await assert.rejects(createBudgetRunner(store, () => date)(options, send), error => error.code === 'AI_CIRCUIT_PAUSED');
      assert.equal(sent, 2);
      const day = await collection('ai_budget_counters').findOne({ _id: 'day:2026-09-12' });
      assert.equal(day.tokens, estimateTokens(options.messages, options.maxTokens).total * 2);
      const rows = await collection('ai_usage').find().toArray();
      assert.ok(rows.every(r => r.status === 'unknown' && r.actualTokens === null));
      assert.ok(!JSON.stringify(rows).includes('sensitive'));
      await store.outcome('qwen:qwen-vl-plus', false, 2);
      assert.equal((await store.circuit('qwen:qwen-vl-plus')).paused, true);
    });
    await t.test('daily global token ceiling is atomic and blocks before send', async () => {
      await reset({ dailyTokens: 1000 });
      let sent = 0, release, arrivals = 0;
      const gate = new Promise(resolve => { release = resolve; });
      const arrived = () => { if (++arrivals === 12) release(); };
      const calls = Array.from({ length: 12 }, () => run(options, async () => { sent++; arrived(); await gate; return success(); }).catch(error => { arrived(); throw error; }));
      const results = await Promise.allSettled(calls);
      assert.ok(sent <= 2); assert.ok(sent > 0);
      assert.ok(results.some(row => row.status === 'rejected'));
    });
    await t.test('known usage settles against snapshotted price; unknown price blocks money budgets', async () => {
      await reset({ dailyYuan: 10, prices: {} });
      await assert.rejects(run(options, success), /未配置单价/);
      assert.equal(await collection('ai_usage').countDocuments(), 0);
      await reset({ dailyYuan: 10, prices: { 'qwen-vl-plus': { input: 2, output: 8 } } });
      await run(options, success);
      const row = await collection('ai_usage').findOne({});
      assert.equal(row.costMicros, 160);
      assert.equal((await collection('ai_budget_counters').findOne({ _id: 'day:2026-09-12' })).micros, 160);
    });
    await t.test('OCR malformed responses count toward circuit and successful missing usage remains reserved', async () => {
      await reset({ failureThreshold: 1 });
      await assert.rejects(run(options, async () => ({ ...(await success()), choices: [{ message: { content: 'invalid JSON' } }] })));
      await assert.rejects(run(options, success), /连续异常/);
      await reset({});
      await run(options, async () => ({ choices: [{ message: { content: '{"items":[]}' } }] }));
      assert.equal((await collection('ai_usage').findOne({})).status, 'unknown');
    });
    await t.test('pause blocks OCR only; deadline and database failure prevent provider requests', async () => {
      await reset({ ocrPaused: true });
      await assert.rejects(run(options, success), /暂停/);
      await run({ ...options, context: { business: 'other' } }, success);
      await reset({});
      await assert.rejects(run({ ...options, context: { ...options.context, deadline: date.getTime() - 1 } }, success), /时限/);
      let sent = false;
      const unavailable = createBudgetRunner({ ...store, policy: async () => { throw new Error('DB down'); } });
      await assert.rejects(unavailable(options, async () => { sent = true; return success(); }), /核验不可用/);
      assert.equal(sent, false);
    });
    await t.test('async context separates reports and counts evidence and supplement toward same page', async () => {
      await reset({});
      const base = { ...options, context: {} };
      await Promise.all(['b', 'c'].map(char => withAiContext({ business: 'ocr', reportId: char.repeat(24), page: 2, stage: 'supplement' }, () => run(base, success))));
      await withAiContext({ business: 'ocr', reportId: 'b'.repeat(24), page: 2, stage: 'evidence' }, () => run(base, success));
      assert.equal((await collection('ai_budget_counters').findOne({ _id: `page:${'b'.repeat(24)}:2` })).calls, 2);
      assert.equal((await collection('ai_budget_counters').findOne({ _id: `page:${'c'.repeat(24)}:2` })).calls, 1);
    });
    await t.test('management API enforces roles, version conflicts, allowance and resume preserves progress', async () => {
      await reset({});
      require('express-async-errors');
      const express = require('express');
      const jwt = require('jsonwebtoken');
      const Admin = require('../src/models/Admin');
      const MedicalReport = require('../src/models/MedicalReport');
      const previousSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'isolated-ai-budget-integration-test-only';
      const adminId = new mongoose.Types.ObjectId(), staffId = new mongoose.Types.ObjectId(), tenantAdminId = new mongoose.Types.ObjectId();
      await Admin.collection.insertMany([{ _id: adminId, role: 'superadmin' }, { _id: staffId, role: 'healthManager' }, { _id: tenantAdminId, role: 'superadmin', tenantId: new mongoose.Types.ObjectId() }]);
      const app = express(); app.use(express.json()); app.use('/api/admin/ai-control', require('../src/routes/aiControl'));
      app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
      const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
      const base = `http://127.0.0.1:${server.address().port}/api/admin/ai-control`;
      const request = (path = '', body, actor = adminId, method = body ? 'POST' : 'GET') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ type: 'admin', id: String(actor) }, process.env.JWT_SECRET)}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const staffPath = require.resolve('../src/routes/staff');
      const previousStaff = require.cache[staffPath];
      let scheduled;
      require.cache[staffPath] = { id: staffPath, filename: staffPath, loaded: true, exports: { scheduleReportParse: id => { scheduled = id; } } };
      try {
        assert.equal((await fetch(base)).status, 401);
        assert.equal((await request('', null, staffId)).status, 403);
        assert.equal((await request('', null, tenantAdminId)).status, 403);
        assert.equal((await request()).status, 200);
        assert.equal((await request('/policy', { policy: { ...DEFAULT_POLICY, paused: true }, revision: 0 }, adminId, 'PUT')).status, 200);
        assert.equal((await request('/policy', { policy: DEFAULT_POLICY, revision: 0 }, adminId, 'PUT')).status, 409);
        const reportId = new mongoose.Types.ObjectId();
        const progress = { version: 2, nextPage: 9, allItems: [{ name: 'test', value: '1' }] };
        await MedicalReport.collection.insertOne({ _id: reportId, aiStatus: 'failed', parseJob: { status: 'paused', progress } });
        assert.equal((await request(`/reports/${reportId}/allowance`, { tokens: 10000, calls: 2 })).status, 200);
        assert.equal((await request(`/reports/${reportId}/resume`, {})).status, 200);
        assert.equal(scheduled, String(reportId));
        const resumed = await MedicalReport.collection.findOne({ _id: reportId });
        assert.deepEqual(resumed.parseJob.progress, progress);
        assert.equal(resumed.aiStatus, 'processing');
        assert.equal((await request(`/reports/${reportId}/resume`, {})).status, 409);
        assert.equal((await collection('ai_budget_counters').findOne({ _id: `report:${reportId}` })).extraTokens, 10000);
      } finally {
        if (previousStaff) require.cache[staffPath] = previousStaff; else delete require.cache[staffPath];
        if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
        await new Promise(resolve => server.close(resolve));
      }
    });
  } finally {
    assert.match(mongoose.connection.name, /^jiayicare_ai_budget_test_[a-f\d]{32}$/);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
