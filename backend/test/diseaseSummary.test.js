const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { SUMMARY_FIELDS, summaryKey, groupSummaryHistory, changeStamp } = require('../../shared/diseaseSummary.cjs');
const { recordVersion, buildSummaryContext, generateDiseaseSummary } = require('../src/utils/diseaseSummary');
const summary = Object.fromEntries(SUMMARY_FIELDS.map(k => [k, '旧资料']));
const record = { _id: 'record', name: '测试专病', summary: { ...summary, sourceType: 'medical_record', verificationStatus: 'verified' }, summaryHistory: [], courseEntries: [
  { _id: 'later', occurredAt: '2026-09-01', content: '后续症状变化', medicationChange: '后续用药记录', sourceReportId: 'report' },
  { _id: 'first', occurredAt: '2024-11-18', content: '首次症状' },
] };
test('history groups adjacent equivalent snapshots and retains every audit stamp', () => {
  const history = [{ ...summary, archivedAt: 'a' }, { ...summary, archivedAt: 'b' }, { ...summary, physicalExam: '不同检查' }, { ...summary }];
  const groups = groupSummaryHistory(history);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[2].saves.map(s => s.at), ['a','b']);
  assert.equal(history.length, 4);
  assert.notEqual(summaryKey(summary), summaryKey({ ...summary, sourceInstitution: '新来源' }));
});
test('AI context combines earliest/latest changes and complete associated reviewed evidence', async () => {
  const reports = [{ _id: 'report', title: '后续检查', reportItems: Array.from({ length: 120 }, (_, i) => ({ name: `结果${i}` })), clinicalReview: { diagnosis: '复查诊断？' } }];
  let sent;
  const result = await generateDiseaseSummary(record, reports, async messages => {
    sent = JSON.parse(messages[0].content); return JSON.stringify({ ...summary, presentIllness: '首次至后续变化' });
  });
  assert.equal(sent.changes[0].content, '首次症状');
  assert.equal(sent.changes[1].medicationChange, '后续用药记录');
  assert.equal(sent.reports[0].reportItems.length, 120);
  assert.equal(sent.reports[0].clinicalReview.diagnosis, '复查诊断？');
  assert.equal(result.coverage.courseCount, 2);
  assert.equal(result.expectedRecordVersion, recordVersion(record));
  assert.equal(record.summary.presentIllness, '旧资料');
});
test('oversized context and malformed AI output fail without silent truncation', async () => {
  assert.throws(() => buildSummaryContext({ ...record, courseEntries: [{ content: 'x'.repeat(120001) }] }, []), /未截断/);
  await assert.rejects(generateDiseaseSummary(record, [], async () => '{"chiefComplaint":"only"}'), /格式/);
  assert.notEqual(recordVersion(record), recordVersion({ ...record, courseEntries: [] }));
});

const routeSource = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
function saveHarness(body, matchedCount = 1) {
  const patient = { _id: 'patient', diseaseRecords: [structuredClone(record)] };
  let handler, written;
  const context = { sourceIds:require('../../shared/diseaseReportArchive.cjs').sourceIds, router: { put: (path, ...fns) => { handler = fns.at(-1); } }, staffAuth: () => {}, checkPermission: () => {},
    User: { findById: () => ({ select: () => ({ lean: async () => patient }) }), collection: { updateOne: async (filter, update) => { written = { filter, update }; return { matchedCount }; } } },
    cleanMedicalText: v => String(v || '').trim(), MEDICAL_SUMMARY_FIELDS: SUMMARY_FIELDS,
    normalizedDiseaseRecords: p => p.diseaseRecords.map(r => ({ ...r })), recordVersion, summaryKey, changeStamp,
    cleanHealthInfoProvenance: b => ({ sourceType: b.sourceType, verificationStatus: b.verificationStatus }), hasMedicalSummary: s => !!s?.chiefComplaint,
  };
  const start = routeSource.indexOf("router.put('/patients/:id/disease-records/summary'");
  const end = routeSource.indexOf("router.post('/patients/:id/disease-records/course-entries'", start);
  vm.runInNewContext(routeSource.slice(start, end), context);
  const response = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
  return { async run() { await handler({ params: { id: 'patient' }, body, staff: { _id: 'staff', name: '测试顾问' } }, response); return { response, written, patient }; } };
}
const payload = { ...record.summary, diseaseName: record.name, recordId: 'record' };
test('unchanged save does not append history or write the database', async () => {
  const { response, written } = await saveHarness(payload).run();
  assert.equal(response.body.unchanged, true); assert.equal(written, undefined);
});
test('changed save archives exactly once and atomically checks the original record array', async () => {
  const { response, written, patient } = await saveHarness({ ...payload, presentIllness: '新的变化' }).run();
  assert.equal(response.code, 200);
  assert.equal(written.update.$set.diseaseRecords[0].summaryHistory.length, 1);
  assert.equal(written.filter.diseaseRecords, patient.diseaseRecords);
  assert.equal(patient.diseaseRecords[0].summary.presentIllness, '旧资料');
  const conflict = await saveHarness({ ...payload, presentIllness: '新内容' }, 0).run();
  assert.equal(conflict.response.code, 409);
});
test('AI draft generated against old course entries cannot overwrite newer records', async () => {
  const { response, written } = await saveHarness({ ...payload, expectedRecordVersion: 'old' }).run();
  assert.equal(response.code, 409); assert.equal(written, undefined);
});
test('old clients cannot overwrite the initial overview with subsequent AI summaries', async () => {
  const { response, written } = await saveHarness({ ...payload, expectedRecordVersion: recordVersion(record) }).run();
  assert.equal(response.code, 409); assert.equal(written, undefined);
});

test('draft endpoint scopes patient and reports, returns only a draft, and detects changed source data', async () => {
  const start = routeSource.indexOf("router.post('/patients/:id/disease-records/:recordId/summary-draft'");
  const end = routeSource.indexOf("router.put('/patients/:id/disease-records/summary'", start);
  for (const scenario of ['allowed', 'outsider', 'changed']) {
    let handler, query, generated = false, reads = 0;
    const context = { sourceIds:require('../../shared/diseaseReportArchive.cjs').sourceIds,
      router: { post: (path, ...fns) => { handler = fns.at(-1); } }, staffAuth: () => {}, checkPermission: () => {},
      getVisiblePlanPatientIds: async () => scenario === 'outsider' ? [] : ['patient'],
      User: { findById: () => ({ select: () => ({ lean: async () => ({ _id: 'patient', diseaseRecords: [{ ...record, ...(scenario === 'changed' && ++reads > 1 ? { name: '已修改' } : {}) }] }) }) }) },
      mongoose: { isValidObjectId: v => v === 'report' },
      MedicalReport: { find: q => { query = q; return { select: () => ({ lean: async () => [] }) }; } },
      recordVersion, require: () => ({ chat: () => {} }),
      generateDiseaseSummary: async r => { generated = true; return { expectedRecordVersion: recordVersion(r), summary }; },
    };
    vm.runInNewContext(routeSource.slice(start, end), context);
    const res = { code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; } };
    await handler({ params: { id: 'patient', recordId: 'record' }, staff: { role: 'familyDoctor' } }, res);
    assert.equal(res.code, scenario === 'outsider' ? 403 : scenario === 'changed' ? 409 : 200);
    assert.equal(generated, scenario !== 'outsider');
    if (query) { assert.equal(query.user, 'patient'); assert.equal(query.audit_status, 'audited'); assert.equal(query._id.$in[0], 'report'); }
  }
});
