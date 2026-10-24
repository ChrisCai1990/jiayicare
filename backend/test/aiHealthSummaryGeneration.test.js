const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Use the real request-scoped identity helper; external AI remains stubbed.
function runRouteWithConsentContext(code, context) {
  const load = context.require;
  return vm.runInNewContext(code, { checkupAnalysisReadiness: async () => ({ ready: true }), ...context, require: name => name.endsWith('/aiDataConsent') ? require('../src/utils/aiDataConsent') : load(name) });
}


test('rejected duplicate requests cannot release the running generation lock', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf('const activeAIHealthSummaryJobs = new Set();');
  const end = source.indexOf('// 单项重新生成', start);
  let handler, finish, calls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const user = { _id: 'member', aiHealthSummary: {} };
  const query = { populate() { return this; }, then(resolve) { return Promise.resolve(user).then(resolve); } };
  runRouteWithConsentContext(source.slice(start, end), {
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
  runRouteWithConsentContext(code, {
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

test('source re-evaluation ignores reused tumor text and creates a new pending record', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const activeAIHealthSummaryJobs = new Set();'), source.indexOf('// 单项重新生成'));
  let handler, options, saved;
  const prior = { scope: 'doctor', generatedAt: '2026-10-01', doctorApprovedAt: null,
    sections: { tumor_risk: { summary: 'CA72-4持续轻度升高', overview: {}, cancers: Array.from({ length: 10 }, (_, i) => ({ name: String(i) })) } } };
  const existing = { byYear: { 2026: { ...prior, records: [prior] } } };
  const user = { _id: 'member', aiHealthSummary: existing };
  const query = { populate() { return this; }, then(resolve) { return Promise.resolve(user).then(resolve); } };
  runRouteWithConsentContext(code, {
    router: { post(_path, _auth, callback) { handler = callback; } }, staffAuth() {},
    User: { findById: () => query, collection: { updateOne: async (_filter, update) => {
      saved = update.$set.aiHealthSummary; return { matchedCount: 1 };
    } } },
    MedicalReport: { exists: async () => null },
    DOCTOR_KEYS: ['tumor_risk'], LIFESTYLE_KEY: 'lifestyle_assessment',
    withReviewTokens: value => value,
    generateHealthSummarySections: async (_user, input) => { options = input; return {
      sections: { tumor_risk: { summary: 'CA72-4在参考范围内' } }, failed: false,
    }; },
    require: name => {
      if (name.endsWith('healthPriorityLinks')) return require('../src/utils/healthPriorityLinks');
      if (name.endsWith('packageFeatureEntitlements')) return { getAiEntitlements: async () => ({ aiHealthAnalysis: true }) };
      if (name.endsWith('serviceAccess')) return { resolveServiceAccess: async () => ({}) };
      if (name.endsWith('reportAuditGate')) return { checkReportAuditGate: async () => null };
      throw new Error(name);
    },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, body: { year: '2026', scope: 'doctor', recheckFromSources: true }, staff: { role: 'familyDoctor' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(options.incrementalBase, null);
  assert.equal(options.reusedTumorSection, null);
  assert.equal(saved.byYear[2026].records.length, 2);
  assert.equal(saved.byYear[2026].records[0].recheckFromSources, true);
  assert.equal(saved.byYear[2026].records[0].doctorApprovedAt, null);
  assert.equal(saved.byYear[2026].records[1].sections.tumor_risk.summary, 'CA72-4持续轻度升高');
  const automaticRefresh = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, body: { year: '2026', scope: 'doctor' }, staff: { role: 'familyDoctor' } }, automaticRefresh);
  assert.equal(automaticRefresh.statusCode, 200, JSON.stringify(automaticRefresh.body));
  assert.equal(options.reusedTumorSection, null, 'old tumor cards must not be silently reused after the evidence rules change');
  assert.equal(saved.byYear[2026].records[0].recheckFromSources, false);
});

test('review refuses an older draft whose CA72-4 elevation lacks numeric evidence', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf("router.patch('/patients/:id/ai-health-summary'"), source.indexOf('// DELETE /api/staff/patients/:id/ai-health-summary/records/'));
  let handler, writes = 0;
  const record = { scope: 'doctor', sections: { tumor_risk: { summary: 'CA72-4持续轻度升高' } } };
  const user = { aiHealthSummary: { latestYear: '2026', byYear: { 2026: { ...record, records: [record] } } } };
  runRouteWithConsentContext(code, {
    router: { patch(_path, _auth, callback) { handler = callback; } }, staffAuth() {},
    User: { findById: () => ({ lean: async () => user }), collection: { updateOne: async () => { writes++; return { matchedCount: 1 }; } } },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => [{ checkDate: '2026-06-01', reportItems: [
      { name: 'CA72-4', value: '4.1', referenceRange: '<6.9', status: 'abnormal' },
    ] }] }) }) },
    resolveReviewRecord: () => 0, DOCTOR_KEYS: ['tumor_risk'], LIFESTYLE_KEY: 'lifestyle_assessment',
    HEALTH_TREND_FIELDS: {},
    require: name => {
      if (name.endsWith('tumorMarkerFactGuard')) return require('../src/utils/tumorMarkerFactGuard');
      if (name.endsWith('historicalAIHealthContext')) return require('../src/utils/historicalAIHealthContext');
      throw new Error(name);
    },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, body: { action: 'approve', scope: 'doctor', year: '2026' }, staff: { role: 'familyDoctor' } }, res);
  assert.equal(res.statusCode, 422, JSON.stringify(res.body));
  assert.match(res.body.message, /CA72-4/);
  assert.equal(writes, 0);
});

test('a stale tumor claim blocks tumor and whole review but not unrelated section review', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf("router.patch('/patients/:id/ai-health-summary'"), source.indexOf('// DELETE /api/staff/patients/:id/ai-health-summary/records/'));
  let handler, writes = 0;
  const record = { scope: 'doctor', sections: {
    tumor_risk: { overview: { headline: 'CA72-4持续轻度升高' } },
    cardiovascular_risk: { topics: [{ name: '心脏超声', status: 'normal' }] },
    checkup_completeness: { summary: '已核对体检覆盖' },
  } };
  const user = { _id: 'member', aiHealthSummary: { latestYear: '2026', byYear: { 2026: { ...record, records: [record] } } } };
  runRouteWithConsentContext(code, {
    router: { patch(_path, _auth, callback) { handler = callback; } }, staffAuth() {},
    User: { findById: () => ({ lean: async () => user }), collection: { updateOne: async () => { writes++; return { matchedCount: 1 }; } } },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => [{ checkDate: '2026-09-23', reportItems: [
      { name: 'CA72-4', value: '9.05', referenceRange: '<19.10' },
    ] }] }) }) },
    resolveReviewRecord: () => 0, withReviewTokens: value => value,
    DOCTOR_KEYS: ['tumor_risk', 'cardiovascular_risk', 'checkup_completeness'], LIFESTYLE_KEY: 'lifestyle_assessment',
    HEALTH_TREND_FIELDS: {},
    require: name => name.endsWith('tumorMarkerFactGuard') ? require('../src/utils/tumorMarkerFactGuard')
      : require('../src/utils/historicalAIHealthContext'),
  });
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  for (const sectionKey of ['cardiovascular_risk', 'checkup_completeness']) {
    const res = response();
    await handler({ params: { id: 'member' }, body: { action: 'approve', scope: 'doctor', year: '2026', sectionKey }, staff: { role: 'familyDoctor', name: '顾问' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.record.sectionReviews[sectionKey].status, 'approved');
  }
  for (const sectionKey of ['tumor_risk', undefined]) {
    const res = response();
    await handler({ params: { id: 'member' }, body: { action: 'approve', scope: 'doctor', year: '2026', sectionKey }, staff: { role: 'familyDoctor' } }, res);
    assert.equal(res.statusCode, 422, JSON.stringify(res.body));
    assert.match(res.body.message, /CA72-4/);
    assert.equal(res.body.blockedSectionKey, 'tumor_risk');
  }
  assert.equal(writes, 2);
});

test('single-card correction refreshes the overview and invalidates its approval atomically', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const HEALTH_TREND_FIELDS ='), source.indexOf('// ── 4.4 AI健康汇总分析：审核/更新'));
  const { reviewToken, withReviewTokens } = require('../src/utils/summaryReviewVersion');
  const record = { scope: 'doctor', doctorApprovedAt: '2026-09-06', sections: {
    chronic_disease: { overview: { headline: '血糖由5.5%升至7.0%', attentionCount: 1 },
      items: [{ name: '血糖', status: 'abnormal', latest: 'HbA1c 7.0%' }, { name: '血压', status: 'normal', latest: '正常' }] },
    medical_priority: { items: [{ name: '糖化血红蛋白升高', current: '7.0%' },
      { name: '血压随访', current: '原已审核建议', sourceSectionKey: 'chronic_disease', sourceItemName: '血压' },
      { name: '胃炎', current: '需复查' }] },
  } };
  const original = { latestYear: '2026', sections: record.sections, byYear: { 2026: { ...record, records: [record] } } };
  const handlers = {};
  let saved, calls = 0;
  runRouteWithConsentContext(code, {
    router: { post(route, _auth, callback) { handlers[route] = callback; } }, staffAuth() {},
    User: { findById: async () => ({ _id: 'member', aiHealthSummary: original }),
      collection: { updateOne: async (filter, update) => { saved = update.$set.aiHealthSummary; assert.equal(filter.aiHealthSummary, original); return { matchedCount: 1 }; } } },
    MedicalReport: { find: () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) }) },
    reviewToken, withReviewTokens, Date, JSON, DOCTOR_KEYS: ['chronic_disease', 'medical_priority'],
    require: name => name.endsWith('healthPriorityLinks') ? require('../src/utils/healthPriorityLinks')
      : name.endsWith('tumorMarkerFactGuard') ? require('../src/utils/tumorMarkerFactGuard') : ({
      chat: async () => ++calls === 1
        ? JSON.stringify({ status: 'normal', latest: 'HbA1c 5.6%', trendStatus: 'stable' })
        : JSON.stringify({ headline: '血糖目前处于正常范围，继续监测。' }),
    }),
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handlers['/patients/:id/ai-health-summary/regenerate-item']({ params: { id: 'member' }, staff: { role: 'familyDoctor', name: '医生', _id: 'staff' },
    body: { year: '2026', sectionKey: 'chronic_disease', itemName: '血糖', instruction: '7%是误录，实际5.6%', expectedRecordToken: reviewToken(record) } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.newRecord, true);
  assert.equal(calls, 2);
  assert.equal(saved.byYear[2026].records.length, 2);
  assert.equal(saved.byYear[2026].records[1].doctorApprovedAt, '2026-09-06');
  assert.equal(saved.byYear[2026].records[1].sections.chronic_disease.items[0].latest, 'HbA1c 7.0%');
  assert.equal(saved.byYear[2026].records[0].sections.chronic_disease.items[0].latest, 'HbA1c 5.6%');
  assert.equal(saved.sections.chronic_disease.overview.headline, '血糖目前处于正常范围，继续监测。');
  assert.equal(saved.sections.chronic_disease.overview.attentionCount, 0);
  assert.deepEqual(Array.from(saved.sections.medical_priority.items, item => item.name), ['血压随访', '胃炎']);
  assert.equal(saved.sections.medical_priority.items[0].current, '原已审核建议');
  assert.equal(saved.doctorApprovedAt, null);
  assert.equal(saved.byYear[2026].records[0].sectionReviews.chronic_disease.status, 'draft');
  assert.equal(original.sections.chronic_disease.items[0].latest, 'HbA1c 7.0%', 'failed CAS would leave old data intact');
});

test('single-card homocysteine regeneration enforces intervention at 10 despite AI reassurance', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const HEALTH_TREND_FIELDS ='), source.indexOf('// ── 4.4 AI健康汇总分析：审核/更新'));
  const { reviewToken, withReviewTokens } = require('../src/utils/summaryReviewVersion');
  const record = { scope: 'doctor', sections: {
    cardiovascular_risk: { topics: [{ name: '同型半胱氨酸', status: 'stable', nextAction: '无需干预，继续常规监测。' }] },
    medical_priority: { items: [] },
  } };
  const original = { latestYear: '2026', sections: record.sections, byYear: { 2026: { ...record, records: [record] } } };
  const reports = [{ checkDate: '2026-09-23', reportItems: [{ name: '同型半胱氨酸', value: '13.1', unit: 'μmol/L' }] }];
  let handler, saved, calls = 0;
  runRouteWithConsentContext(code, {
    router: { post(route, _auth, callback) { if (route.endsWith('/regenerate-item')) handler = callback; } }, staffAuth() {},
    User: { findById: async () => ({ _id: 'member', aiHealthSummary: original }),
      collection: { updateOne: async (_filter, update) => { saved = update.$set.aiHealthSummary; return { matchedCount: 1 }; } } },
    MedicalReport: { find: () => ({ sort: () => ({ select: () => ({ lean: async () => reports }) }) }) },
    reviewToken, withReviewTokens, Date, JSON, DOCTOR_KEYS: ['cardiovascular_risk', 'medical_priority'],
    require: name => name.endsWith('homocysteineIntervention') ? require('../src/utils/homocysteineIntervention')
      : name.endsWith('healthPriorityLinks') ? require('../src/utils/healthPriorityLinks')
        : name.endsWith('tumorMarkerFactGuard') ? require('../src/utils/tumorMarkerFactGuard')
          : { chat: async () => {
            calls++;
            if (calls === 1) return JSON.stringify({ status: 'stable', nextAction: '无需干预，继续常规监测。' });
            if (calls === 2) return JSON.stringify({ headline: '同型半胱氨酸需关注' });
            return JSON.stringify({ items: [{ sourceItemName: '同型半胱氨酸', name: '同型半胱氨酸需干预',
              current: '2026-09-23 13.1 μmol/L', action: '请由医生评估', urgency: 'medium' }] });
          } },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, staff: { role: 'familyDoctor', name: '医生', _id: 'staff' }, body: {
    year: '2026', sectionKey: 'cardiovascular_risk', itemName: '同型半胱氨酸', instruction: '13.1需要干预', expectedRecordToken: reviewToken(record),
  } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const card = saved.byYear[2026].records[0].sections.cardiovascular_risk.topics[0];
  assert.equal(card.status, 'attention');
  assert.match(card.nextAction, /13\.1 μmol\/L.*需干预/);
  assert.equal(saved.byYear[2026].records[0].sections.cardiovascular_risk.overview.attentionCount, 1);
  assert.match(saved.byYear[2026].records[0].sections.cardiovascular_risk.summary, /需干预/);
  assert.equal(saved.byYear[2026].records[0].sections.medical_priority.items[0].sourceItemName, '同型半胱氨酸');
  assert.equal(calls, 0, 'a threshold correction should not depend on repeated AI calls');
});

test('CA72-4 card correction reads old and recent reference ranges without regenerating other reviewed sections', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const HEALTH_TREND_FIELDS ='), source.indexOf('// ── 4.4 AI健康汇总分析：审核/更新'));
  const { reviewToken, withReviewTokens } = require('../src/utils/summaryReviewVersion');
  const approved = { scope: 'doctor', generatedAt: '2026-10-01', doctorApprovedAt: '2026-10-02', doctorApprovedBy: '顾问', sections: {
    tumor_risk: { summary: 'CA72-4持续升高', overview: { headline: 'CA72-4持续升高' },
      cancers: [{ name: '胃癌', status: 'follow_up_due', latest: 'CA72-4持续升高', trend: '持续升高' }] },
    cardiovascular_risk: { summary: '原已审核的心血管结论' }, medical_priority: { items: [] },
  } };
  const original = { latestYear: '2026', sections: approved.sections, byYear: { 2026: { ...approved, records: [approved] } } };
  const reports = [
    { checkDate: '2018-05-01', reportItems: [{ name: 'CA72-4', value: '11.3', referenceRange: '<6.9' }] },
    { checkDate: '2026-09-23', reportItems: [{ name: 'CA72-4', value: '9.05', referenceRange: '<19.10' }] },
  ];
  const prompts = []; let saved, handler;
  runRouteWithConsentContext(code, {
    router: { post(route, _auth, callback) { if (route.endsWith('/regenerate-item')) handler = callback; } }, staffAuth() {},
    User: { findById: async () => ({ _id: 'member', aiHealthSummary: original }),
      collection: { updateOne: async (_filter, update) => { saved = update.$set.aiHealthSummary; return { matchedCount: 1 }; } } },
    MedicalReport: { find: () => ({ sort: () => ({ select: () => ({ lean: async () => reports }) }) }) },
    reviewToken, withReviewTokens, Date, JSON,
    DOCTOR_KEYS: ['tumor_risk', 'cardiovascular_risk', 'medical_priority'],
    require: name => name.endsWith('healthPriorityLinks') ? require('../src/utils/healthPriorityLinks')
      : name.endsWith('tumorMarkerFactGuard') ? require('../src/utils/tumorMarkerFactGuard')
        : { chat: async messages => { prompts.push(messages[0].content); return prompts.length === 1
          ? JSON.stringify({ name: '胃癌', status: 'covered', latest: '2026年CA72-4为9.05，参考<19.10', trend: '2018年高于当时参考范围；2026年在参考范围内', trendStatus: 'improving' })
          : JSON.stringify({ headline: 'CA72-4最近检查在参考范围内' }); } },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, staff: { role: 'familyDoctor', name: '顾问', _id: 'staff' }, body: {
    year: '2026', sectionKey: 'tumor_risk', itemName: '胃癌', instruction: 'CA72-4近年正常，核对持续升高的说法', expectedRecordToken: reviewToken(approved),
  } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.match(prompts[0], /11\.3/); assert.match(prompts[0], /<6\.9/);
  assert.match(prompts[0], /9\.05/); assert.match(prompts[0], /<19\.10/);
  assert.equal(saved.byYear[2026].records.length, 2);
  assert.equal(saved.byYear[2026].records[1].sections.tumor_risk.summary, 'CA72-4持续升高');
  assert.equal(saved.byYear[2026].records[0].sections.cardiovascular_risk.summary, '原已审核的心血管结论');
  assert.equal(saved.byYear[2026].records[0].sectionReviews.cardiovascular_risk.status, 'approved');
  assert.equal(saved.byYear[2026].records[0].sectionReviews.tumor_risk.status, 'draft');
  assert.equal(saved.byYear[2026].records[0].sections.tumor_risk.summary, 'CA72-4最近检查在参考范围内');
});

test('single liver cancer card regeneration includes infectious screening results and shows them in the card', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const HEALTH_TREND_FIELDS ='), source.indexOf('// ── 4.4 AI健康汇总分析：审核/更新'));
  const { reviewToken, withReviewTokens } = require('../src/utils/summaryReviewVersion');
  const card = { name: '肝癌', status: 'covered', latest: '2026-09-23肝脏超声：右肝结节',
    keyChanges: ['2020年初见肝内结节'], nextAction: '按报告建议复查',
    sourceEvidence: [{ oversizedDuplicate: 'DO_NOT_REPEAT_SOURCE_EVIDENCE' }] };
  const record = { scope: 'doctor', sections: { tumor_risk: {
    cancers: [card], overview: { headline: 'CA72-4持续升高' },
    summary: 'CA72-4持续升高', abnormal: ['CA72-4持续升高'],
  }, medical_priority: { items: [] } } };
  const original = { latestYear: '2026', sections: record.sections, byYear: { 2026: { ...record, records: [record] } } };
  const reports = [
    { _id: 'liver', checkDate: '2026-09-23', title: '肝脏超声', reportItems: [{ name: '肝脏超声', findings: '右肝结节' }] },
    { _id: 'marker', checkDate: '2026-09-23', reportItems: [{ name: 'CA72-4', value: '9.05', referenceRange: '<19.10' }] },
    { _id: 'infection', checkDate: '2026-08-12', title: '传染病筛查', reportItems: [
      { name: '乙肝表面抗原 HBsAg', value: '阴性' }, { name: '丙肝抗体', value: '阳性' },
      { name: '梅毒抗体', value: '阴性' },
    ] },
  ];
  const prompts = []; const callOptions = []; let saved, handler;
  runRouteWithConsentContext(code, {
    router: { post(route, _auth, callback) { if (route.endsWith('/regenerate-item')) handler = callback; } }, staffAuth() {},
    User: { findById: async () => ({ _id: 'member', aiHealthSummary: original }),
      collection: { updateOne: async (_filter, update) => { saved = update.$set.aiHealthSummary; return { matchedCount: 1 }; } } },
    MedicalReport: { find: () => ({ sort: () => ({ select: () => ({ lean: async () => reports }) }) }) },
    reviewToken, withReviewTokens, Date, JSON, DOCTOR_KEYS: ['tumor_risk', 'medical_priority'],
    require: name => name.endsWith('healthPriorityLinks') ? require('../src/utils/healthPriorityLinks')
      : name.endsWith('tumorMarkerFactGuard') ? require('../src/utils/tumorMarkerFactGuard')
        : name.endsWith('aiHealthSummary') ? {
          CANCER_EVIDENCE_RULES: { 肝癌: /乙肝|丙肝|肝脏/ },
          buildStructuredSourceEvidence: () => [{ reportId: 'infection', date: '2026-08-12' }],
        } : { chat: async (messages, options) => { prompts.push(messages[0].content); callOptions.push(options); return prompts.length === 1
          ? JSON.stringify({ ...card, keyChanges: ['2020年初见肝内结节'] })
          : JSON.stringify({ headline: '肝脏影像与肝炎筛查结果待医生结合核对' }); } },
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, staff: { role: 'familyDoctor', name: '医生', _id: 'staff' }, body: {
    year: '2026', sectionKey: 'tumor_risk', itemName: '肝癌', instruction: '结合乙肝、丙肝筛查', expectedRecordToken: reviewToken(record),
  } }, response);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.match(prompts[0], /乙肝表面抗原 HBsAg/);
  assert.match(prompts[0], /丙肝抗体/);
  assert.doesNotMatch(prompts[0], /梅毒抗体/);
  assert.doesNotMatch(prompts[0], /DO_NOT_REPEAT_SOURCE_EVIDENCE/);
  assert.equal(callOptions[0].maxTokens, 8192);
  const updated = saved.byYear[2026].records[0].sections.tumor_risk.cancers[0];
  assert.match(updated.keyChanges.join(' '), /2026-08-12 乙肝表面抗原 HBsAg：阴性/);
  assert.match(updated.keyChanges.join(' '), /2026-08-12 丙肝抗体：阳性/);
  assert.equal(updated.sourceEvidence[0].reportId, 'infection');
  assert.equal(saved.byYear[2026].records[0].sections.tumor_risk.summary, 'CA72-4持续升高',
    'unrelated old claims remain for separate review instead of blocking the liver correction');
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
  runRouteWithConsentContext(code, {
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
  const context = { require: name => name.endsWith('aiDataConsent') ? require('../src/utils/aiDataConsent') : name.endsWith('healthPriorityLinks')
    ? require('../src/utils/healthPriorityLinks')
    : { chat: async () => {
      assert.equal(require('../src/utils/aiDataConsent').currentPersonalData().subjectId, 'member');
      return JSON.stringify({ items: [{ sourceItemName: '血糖', name: '血糖需关注',
      current: 'HbA1c 7.2%', meaning: '较前次升高', action: '携带报告咨询医生', department: '', urgency: 'medium' }] }); } },
  };
  vm.createContext(context);
  vm.runInContext(`${code}\nglobalThis.sync = syncMedicalPriorities;`, context);
  const record = { sections: { chronic_disease: { items: [{ name: '血糖', status: 'abnormal', latest: 'HbA1c 7.2%' }] },
    medical_priority: { items: [{ name: '糖化血红蛋白升高', current: '7.0%' }, { name: '胃炎', current: '需复查' }] } } };
  await context.sync(record, 'chronic_disease', { name: '医生', _id: 'staff' }, null, 'member');
  const items = record.sections.medical_priority.items;
  assert.deepEqual(Array.from(items, item => item.name), ['胃炎', '血糖需关注']);
  assert.equal(items[1].current, 'HbA1c 7.2%');
  assert.equal(items[1].sourceItemName, '血糖');
  assert.equal(record.sectionReviews.medical_priority.status, 'draft');
});
