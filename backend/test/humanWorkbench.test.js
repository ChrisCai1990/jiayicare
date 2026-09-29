const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sift = require('sift').default;
const { summaryTodos, visibleTodo } = require('../src/utils/humanWorkbench');
const { consultationTodos } = require('../src/utils/consultationWorkbench');
const { loadAssignmentAttention } = require('../src/utils/workbenchAssignmentAttention');
const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const now = new Date('2026-09-29T00:00:00Z');
function model(rows = [], queries = []) {
  return { find(filter) {
    queries.push(filter);
    let data = rows.filter(sift(filter));
    const q = { select() { return q; }, populate() { return q; }, sort() { return q; }, limit(n) { data = data.slice(0, n); return q; }, lean: async () => data };
    return q;
  } };
}
const doctor = { generatedAt: '2026-08-01T00:00:00Z', scope: 'doctor', sections: { medical_priority: { summary: 'test' } } };

test('all years and records remain pending; independent nutrition records cannot hide doctor reviews', () => {
  const user = { _id: 'u', aiHealthSummary: { byYear: {
    2025: { records: [doctor] }, 2026: { records: [
      { generatedAt: '2026-09-01T00:00:00Z', scope: 'nutrition', sections: { lifestyle_assessment: { summary: 'test' } } },
      doctor, { ...doctor, doctorApprovedAt: now }, { ...doctor, source: 'self_service' },
    ] },
  } } };
  const todos = summaryTodos(user, () => true, now);
  assert.equal(todos.length, 3);
  assert.equal(new Set(todos.map(t => t.id)).size, 3);
  assert.ok(todos.some(t => t.link.includes('aiYear=2025')));
  assert.ok(todos.some(t => t.link.includes('aiRecordIndex=1')));
  assert.equal(summaryTodos(user, type => type === 'summary_review', now).length, 2);
});
test('root-only summaries preserve prior approvals and ignore empty dimensions', () => {
  assert.equal(summaryTodos({ _id: 'u', aiHealthSummary: { ...doctor, doctorApprovedAt: now } }, () => true).length, 0);
  assert.equal(summaryTodos({ _id: 'u', aiHealthSummary: { ...doctor, sections: {} } }, () => true).length, 0);
});
test('assigned KF handoff survives membership reassignment without leaking to other staff', () => {
  const todo = { type: 'wecom_kf_handoff', assignedTo: 'a', patientId: 'other' };
  assert.equal(visibleTodo(todo, { _id: 'a', role: 'healthManager' }, () => false), true);
  assert.equal(visibleTodo(todo, { _id: 'b', role: 'healthManager' }, () => true), false);
  assert.equal(visibleTodo({ type: 'report_review', patientId: 'other' }, { _id: 'a' }, () => false), false);
});
test('actual followup query returns own records beyond 50 other users and beyond 50 own pending rows', async () => {
  const rows = [...Array.from({ length: 60 }, (_, i) => ({ _id: `other${i}`, patientId: 'other', aiStatus: 'pending' })),
    ...Array.from({ length: 75 }, (_, i) => ({ _id: `mine${i}`, patientId: 'mine', aiStatus: 'pending', reviewRole: i % 2 ? 'familyDoctor' : null }))];
  const start = source.indexOf('      const pendingFollowUps = await FollowUp.find(');
  const end = source.indexOf('      pendingFollowUps.forEach', start);
  const result = await vm.runInNewContext(`(async () => { ${source.slice(start, end)} return pendingFollowUps; })()`, {
    FollowUp: model(rows), myPatientIds: ['mine'], isSuper: false, role: 'familyDoctor',
  });
  assert.equal(result.length, 75); assert.ok(result.every(r => r.patientId === 'mine'));
});
test('actual parse filter includes failed ordinary reports, excludes manual-only, completed and processing records', () => {
  const start = source.indexOf('      const parseFilter = {', source.indexOf("router.get('/ai-todos'"));
  const end = source.indexOf('      const toParseReports', start);
  const filter = vm.runInNewContext(`(() => { ${source.slice(start, end)} return parseFilter; })()`, { myPatientIds: ['mine'], manualOnlyReportFilter: { type: 'functional' } });
  const matches = sift(structuredClone(filter));
  const report = { user: 'mine', aiStatus: 'failed', fileUrl: 'file', audit_status: 'unaudited' };
  assert.equal(matches(report), true);
  for (const patch of [{ type: 'functional' }, { aiStatus: 'processing' }, { audit_status: 'audited' }, { user: 'other' }, { fileUrl: '' }]) assert.equal(matches({ ...report, ...patch }), false);
});
test('consultation queue excludes all contacted leads and preserves independent open service followups', async () => {
  const leads = [
    { _id: 'new', name: 'new', status: 'new', tenantId: null, createdAt: '2026-09-01' },
    { _id: 'contacted', status: 'contacted', assignedTo: 'a', tenantId: null, createdAt: '2026-09-01' },
    { _id: 'retry', status: 'contacted', acceptance: {}, assignedTo: 'a', tenantId: null, createdAt: '2026-09-01' },
    { _id: 'linked', status: 'contacted', assignedTo: 'a', tenantId: null },
    { _id: 'closed-intake', status: 'contacted', assignedTo: 'a', tenantId: null },
    { _id: 'foreign', status: 'new', tenantId: 'other' },
    { _id: 'other-owner', status: 'contacted', assignedTo: 'b', tenantId: null },
  ];
  const intakes = [
    { _id: 'linked', tenantId: null, status: 'open', ownerId: 'a', patientId: 'p', nextContactAt: '2026-09-01' },
    { _id: 'closed-intake', tenantId: null, status: 'closed', ownerId: 'a', patientId: 'p' },
    { _id: 'legacy-order', tenantId: null, status: 'open', ownerId: 'a', patientId: 'p', orderId:'order', nextContactAt:'2026-09-01' },
  ];
  const result = await consultationTodos({ _id: 'a', role: 'healthPlanner' }, ['p'], { Lead: model(leads), Intake: model(intakes) }, now);
  assert.deepEqual(new Set(result.map(r => r.id)), new Set(['lead_new', 'intake_linked']));
  assert.equal(result.find(r => r.id === 'intake_linked').overdue, true);
  assert.ok(result.every(r => r.dueAt));
  assert.equal(result.find(r => r.id === 'lead_new').kind, 'lead');
  assert.ok(result.every(r => r.link.includes('itemId=')));
  assert.ok(!result.some(r => ['lead_contacted', 'lead_retry'].includes(r.id)));
});
test('assignment exceptions are scoped, detect inactive staff and vanish when the responsible role is restored', async () => {
  const patients = [{ _id: 'p', tenantId: null, assignedHealthPlanner: 'planner', assignedFamilyDoctor: 'inactive', aiHealthSummary: doctor },
    { _id: 'foreign', tenantId: 'other', assignedHealthPlanner: 'planner', aiHealthSummary: doctor }];
  const admins = [{ _id: 'planner', tenantId: null, role: 'healthPlanner', staffStatus: 'active' },
    { _id: 'inactive', tenantId: null, role: 'familyDoctor', staffStatus: 'inactive' }];
  const models = Object.fromEntries(['MedicalReport', 'Medication', 'Supplement', 'HealthPlan', 'FollowUp', 'ChatLog', 'ServiceRecord', 'PhaseAssessment'].map(name => [name, model()]));
  models.User = model(patients); models.Admin = model(admins);
  const staff = { _id: 'planner', role: 'healthPlanner' };
  assert.equal((await loadAssignmentAttention(staff, models)).length, 1);
  assert.equal((await loadAssignmentAttention({ _id: 'other', role: 'healthPlanner' }, models)).length, 0);
  assert.equal((await loadAssignmentAttention({ _id: 'planner', role: 'familyDoctor' }, models)).length, 0);
  admins[1].staffStatus = 'active';
  assert.equal((await loadAssignmentAttention(staff, models)).length, 0);
});
test('historical summary deep link follows stable generation time after insertion and rejects deleted targets', async () => {
  const { summaryTarget } = await import('../../staff/src/utils/workbenchTargets.js');
  const user = { _id: 'u', aiHealthSummary: { byYear: { 2025: { records: [doctor] } } } };
  const search = summaryTodos(user, () => true)[0].link.split('?')[1];
  user.aiHealthSummary.byYear[2025].records.unshift({ ...doctor, generatedAt: '2026-09-01' });
  assert.equal(summaryTarget(user.aiHealthSummary, search).index, 1);
  user.aiHealthSummary.byYear[2025].records.pop();
  assert.equal(summaryTarget(user.aiHealthSummary, search).missing, true);
});
