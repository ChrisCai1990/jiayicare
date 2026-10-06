const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('rejected duplicate requests cannot release the running generation lock', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf('const activeAIHealthSummaryJobs = new Set();');
  const end = source.indexOf('// 单项重新生成', start);
  let handler, finish, calls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const user = { _id: 'member', aiHealthSummary: {} };
  const query = { populate() { return this; }, then(resolve) { return Promise.resolve(user).then(resolve); } };
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, callback) { handler = callback; } }, staffAuth: () => {},
    User: { findById: () => query }, DOCTOR_KEYS: ['medical_priority'], LIFESTYLE_KEY: 'lifestyle_assessment',
    generateHealthSummarySections: async () => { calls++; return pending; },
    require: name => {
      if (name.endsWith('healthPriorityLinks')) return require('../src/utils/healthPriorityLinks');
      if (name.endsWith('packageFeatureEntitlements')) return { getAiEntitlements: async () => ({ aiHealthAnalysis: true }) };
      if (name.endsWith('serviceAccess')) return { resolveServiceAccess: async () => ({}) };
      if (name.endsWith('reportAuditGate')) return { checkReportAuditGate: async () => null };
      throw new Error(name);
    },
  });
  const req = { params: { id: 'member' }, body: { scope: 'doctor', year: '2026' }, staff: { role: 'familyDoctor' } };
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const first = response();
  const running = handler(req, first);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  for (let i = 0; i < 3; i++) {
    const duplicate = response(); await handler(req, duplicate);
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.body.generationInProgress, true);
    assert.equal(calls, 1);
  }
  finish({ failed: true }); await running;
  assert.equal(first.statusCode, 500);
  await handler(req, response());
  assert.equal(calls, 2, 'owner releases the lock after failure so an explicit retry can run');
});

test('gateway HTML timeout produces a readable error and preserves prerequisite flags', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/api.js'), 'utf8');
  const code = source.slice(source.indexOf('async function req('), source.indexOf('\nconst qs'));
  let reply;
  const context = { BASE: '', getToken: () => '', FormData: class {}, fetch: async () => reply };
  vm.createContext(context); vm.runInContext(code, context);
  reply = { status: 504, ok: false, json: async () => { throw new SyntaxError('HTML'); } };
  await assert.rejects(context.req('/test'), error => error.status === 504 && /等待超时/.test(error.message));
  reply = { status: 403, ok: false, json: async () => ({ message: '先审核', needReportAudit: true }) };
  await assert.rejects(context.req('/test'), error => error.needReportAudit === true);
});


test('generation cannot overwrite a concurrent review; successful generation supplies review tokens', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const activeAIHealthSummaryJobs = new Set();'), source.indexOf('// 单项重新生成'));
  let handler, matchedCount = 0, writeFilter;
  const user = { _id: 'member', aiHealthSummary: {} };
  const query = { populate() { return this; }, then(resolve) { return Promise.resolve(user).then(resolve); } };
  vm.runInNewContext(code, {
    router: { post(_path, _auth, callback) { handler = callback; } }, staffAuth() {},
    User: { findById: () => query, collection: { updateOne: async filter => { writeFilter = filter; return { matchedCount }; } } },
    DOCTOR_KEYS: ['medical_priority'], LIFESTYLE_KEY: 'lifestyle_assessment',
    withReviewTokens: require('../src/utils/summaryReviewVersion').withReviewTokens,
    generateHealthSummarySections: async () => ({ sections: { medical_priority: { summary: '合成结果' } }, failed: false }),
    require: name => {
      if (name.endsWith('healthPriorityLinks')) return require('../src/utils/healthPriorityLinks');
      if (name.endsWith('packageFeatureEntitlements')) return { getAiEntitlements: async () => ({ aiHealthAnalysis: true }) };
      if (name.endsWith('serviceAccess')) return { resolveServiceAccess: async () => ({}) };
      if (name.endsWith('reportAuditGate')) return { checkReportAuditGate: async () => null };
      throw new Error(name);
    },
  });
  const req = { params: { id: 'member' }, body: { scope: 'doctor', year: '2026' }, staff: { role: 'familyDoctor' } };
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const conflict = response(); await handler(req, conflict);
  assert.equal(conflict.statusCode, 409); assert.match(conflict.body.message, /原审核结果已保留/);
  assert.ok(writeFilter.$or, 'new/empty summary still has an atomic condition');
  matchedCount = 1;
  const success = response(); await handler(req, success);
  assert.equal(success.statusCode, 200, JSON.stringify(success.body));
  assert.match(success.body.data.byYear[2026].records[0]._reviewToken, /^[a-f0-9]{64}$/);
});

test('single-card correction refreshes the overview and invalidates its approval atomically', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const HEALTH_TREND_FIELDS ='), source.indexOf('// ── 4.4 AI健康汇总分析：审核/更新'));
  const { reviewToken, withReviewTokens } = require('../src/utils/summaryReviewVersion');
  const record = { scope: 'doctor', doctorApprovedAt: '2026-09-06', sections: {
    chronic_disease: { overview: { headline: '血糖由5.5%升至7.0%', attentionCount: 1 },
      items: [{ name: '血糖', status: 'abnormal', latest: 'HbA1c 7.0%' }, { name: '血压', status: 'normal', latest: '正常' }] },
    medical_priority: { items: [{ name: '糖化血红蛋白升高', current: '7.0%' }, { name: '胃炎', current: '需复查' }] },
  } };
  const original = { latestYear: '2026', sections: record.sections, byYear: { 2026: { ...record, records: [record] } } };
  const handlers = {};
  let saved, calls = 0;
  vm.runInNewContext(code, {
    router: { post(route, _auth, callback) { handlers[route] = callback; } }, staffAuth() {},
    User: { findById: async () => ({ _id: 'member', aiHealthSummary: original }),
      collection: { updateOne: async (filter, update) => { saved = update.$set.aiHealthSummary; assert.equal(filter.aiHealthSummary, original); return { matchedCount: 1 }; } } },
    MedicalReport: { find: () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) }) },
    reviewToken, withReviewTokens, Date, JSON,
    require: name => name.endsWith('healthPriorityLinks') ? require('../src/utils/healthPriorityLinks') : ({
      chat: async () => ++calls === 1
        ? JSON.stringify({ status: 'normal', latest: 'HbA1c 5.6%', trendStatus: 'stable' })
        : JSON.stringify({ headline: '血糖目前处于正常范围，继续监测。' }),
    }),
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handlers['/patients/:id/ai-health-summary/regenerate-item']({ params: { id: 'member' }, staff: { role: 'familyDoctor', name: '医生', _id: 'staff' },
    body: { year: '2026', sectionKey: 'chronic_disease', itemName: '血糖', instruction: '7%是误录，实际5.6%', expectedRecordToken: reviewToken(record) } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(calls, 2);
  assert.equal(saved.byYear[2026].records[0].sections.chronic_disease.items[0].latest, 'HbA1c 5.6%');
  assert.equal(saved.sections.chronic_disease.overview.headline, '血糖目前处于正常范围，继续监测。');
  assert.equal(saved.sections.chronic_disease.overview.attentionCount, 0);
  assert.deepEqual(Array.from(saved.sections.medical_priority.items, item => item.name), ['胃炎']);
  assert.equal(saved.doctorApprovedAt, null);
  assert.equal(saved.byYear[2026].records[0].sectionReviews.chronic_disease.status, 'draft');
  assert.equal(original.sections.chronic_disease.items[0].latest, 'HbA1c 7.0%', 'failed CAS would leave old data intact');
});

test('overview refresh updates an already corrected record without regenerating cards', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const HEALTH_TREND_FIELDS ='), source.indexOf('// ── 4.4 AI健康汇总分析：审核/更新'));
  const { reviewToken, withReviewTokens } = require('../src/utils/summaryReviewVersion');
  const doctor = { scope: 'doctor', doctorApprovedAt: '2026-09-06', sections: {
    chronic_disease: { overview: { headline: '血糖由5.5%升至7.0%', attentionCount: 1 },
      items: [{ name: '血糖', status: 'normal', latest: '2026-09-05 HbA1c 5.6%', trendStatus: 'stable' }] },
    medical_priority: { items: [{ name: '糖化血红蛋白升高', current: '7.0%' }, { name: '胃炎', current: '需复查' }] },
  } };
  const nutrition = { scope: 'nutrition', sections: { lifestyle_assessment: { summary: '已审核' } } };
  const original = { latestYear: '2026', sections: doctor.sections, byYear: { 2026: { ...nutrition, records: [nutrition, doctor] } } };
  const handlers = {};
  let saved, calls = 0;
  vm.runInNewContext(code, {
    router: { post(route, _auth, callback) { handlers[route] = callback; } }, staffAuth() {},
    User: { findById: async () => ({ _id: 'member', aiHealthSummary: original }),
      collection: { updateOne: async (_filter, update) => { saved = update.$set.aiHealthSummary; return { matchedCount: 1 }; } } },
    reviewToken, withReviewTokens, Date, JSON,
    require: name => name.endsWith('healthPriorityLinks') ? require('../src/utils/healthPriorityLinks')
      : { chat: async () => { calls++; return JSON.stringify({ headline: '血糖目前在正常范围，继续监测。' }); } },
  });
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const request = { params: { id: 'member' }, staff: { role: 'familyDoctor', name: '医生', _id: 'staff' },
    body: { year: '2026', recordIndex: 1, sectionKey: 'chronic_disease', expectedRecordToken: reviewToken(doctor) } };
  const res = response();
  await handlers['/patients/:id/ai-health-summary/refresh-overview'](request, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(calls, 1);
  assert.equal(saved.byYear[2026].records[1].sections.chronic_disease.items[0].latest, '2026-09-05 HbA1c 5.6%');
  assert.equal(saved.sections.chronic_disease.overview.headline, '血糖目前在正常范围，继续监测。');
  assert.deepEqual(Array.from(saved.sections.medical_priority.items, item => item.name), ['胃炎']);
  assert.equal(saved.byYear[2026].records[1].doctorApprovedAt, null);
  assert.equal(original.sections.chronic_disease.overview.headline, '血糖由5.5%升至7.0%');
  const stale = response();
  await handlers['/patients/:id/ai-health-summary/refresh-overview']({ ...request, body: { ...request.body, expectedRecordToken: 'stale' } }, stale);
  assert.equal(stale.statusCode, 409);
  assert.equal(calls, 1);
});

test('priority synchronization replaces only linked abnormal concerns', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const HEALTH_TREND_FIELDS ='), source.indexOf('async function buildHealthTrendOverview'));
  const context = { require: name => name.endsWith('healthPriorityLinks')
    ? require('../src/utils/healthPriorityLinks')
    : { chat: async () => JSON.stringify({ items: [{ sourceItemName: '血糖', name: '血糖需关注',
      current: 'HbA1c 7.2%', meaning: '较前次升高', action: '携带报告咨询医生', department: '', urgency: 'medium' }] }) },
  };
  vm.createContext(context);
  vm.runInContext(`${code}\nglobalThis.sync = syncMedicalPriorities;`, context);
  const record = { sections: { chronic_disease: { items: [{ name: '血糖', status: 'abnormal', latest: 'HbA1c 7.2%' }] },
    medical_priority: { items: [{ name: '糖化血红蛋白升高', current: '7.0%' }, { name: '胃炎', current: '需复查' }] } } };
  await context.sync(record, 'chronic_disease', { name: '医生', _id: 'staff' });
  const items = record.sections.medical_priority.items;
  assert.deepEqual(Array.from(items, item => item.name), ['胃炎', '血糖需关注']);
  assert.equal(items[1].current, 'HbA1c 7.2%');
  assert.equal(items[1].sourceItemName, '血糖');
  assert.equal(record.sectionReviews.medical_priority.status, 'draft');
});
