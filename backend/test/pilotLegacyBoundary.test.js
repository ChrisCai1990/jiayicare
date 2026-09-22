const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const selected = '111111111111111111111111', other = '222222222222222222222222';
function allowlist(t) {
  const keys = ['HEALTH_MANAGEMENT_ROLLOUT_MODE', 'HEALTH_MANAGEMENT_PATIENT_IDS'];
  const before = keys.map(k => process.env[k]);
  t.after(() => keys.forEach((k, i) => before[i] === undefined ? delete process.env[k] : process.env[k] = before[i]));
  process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE = 'allowlist'; process.env.HEALTH_MANAGEMENT_PATIENT_IDS = selected;
}
test('nonpilot service middleware retains expiry-only behavior and does not grant new renewal exceptions', async t => {
  allowlist(t);
  const { checkServiceActive } = require('../src/middleware/checkServiceActive');
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  let next = 0;
  await checkServiceActive({ user: { _id: other, serviceStartDate: '2099-01-01', serviceExpiry: '2099-12-31' }, method: 'POST', originalUrl: '/api/records' }, res, () => next++);
  assert.equal(next, 1);
  await checkServiceActive({ user: { _id: other, serviceExpiry: '2000-01-01' }, method: 'PATCH', originalUrl: '/api/user/annual-mgmt-plans/333333333333333333333333/confirm' }, res, () => next++);
  assert.equal(next, 1); assert.equal(res.code, 403); assert.equal(res.body.code, 'SERVICE_EXPIRED');
});
test('continuous followup flags come from patient rollout, not client capability', t => {
  allowlist(t);
  const { canRecordProgress, requiresOutcomeReview } = require('../src/utils/followUpContinuity');
  const task = { patientId: other, healthManagementEnabled: true, sourceType: 'scheduled', sourceScheduleKey: 'abnormal_followup:test', status: 'planned' };
  assert.equal(canRecordProgress(task), false); assert.equal(requiresOutcomeReview(task), false);
  assert.equal(requiresOutcomeReview({ ...task, patientId: selected, healthManagementEnabled: false }), true);
});
test('manual nonpilot phase generation keeps monthly nutrition routing despite a new annual/domain payload', async () => {
  const source = fs.readFileSync(require.resolve('../src/routes/aiCaseReviews'), 'utf8');
  const start = source.indexOf("router.post('/patients/:patientId/phase-assessments/generate'");
  const first = source.indexOf('async (req, res)', start), end = source.indexOf('\n});', first);
  let query, generated, gateReads = 0;
  const user = { _id: other, assignedNutritionist: 'n', assignedFamilyDoctor: 'f' };
  const run = vm.runInNewContext('(' + source.slice(first, end + 2) + ')', {
    ROLE_FIELDS: { nutritionist: 'assignedNutritionist', familyDoctor: 'assignedFamilyDoctor' }, DOMAIN_ROLES: { nutrition: 'nutritionist' },
    patientOr404: async () => user, isAssignedReviewer: () => true,
    AnnualPlan: { findOne: () => ({ sort: () => ({ lean: async () => ({ _id: 'plan', confirmedAt: new Date() }) }) }) },
    PlanTemplate: { findOne: filter => { query = filter; return { sort: () => ({ lean: async () => ({ _id: 'template', content: { frequency: 'monthly' } }) }) }; } },
    createAssessment: async args => { generated = args; return { _id: 'assessment' }; },
    require: name => {
      if (name.endsWith('/healthManagementRollout')) return { enabledForPatient: () => false };
      if (name.endsWith('/annualPeriodicGate')) return { annualPeriodicGate: async () => { gateReads++; throw Error('must not read new renewal gate'); } };
      throw Error('Unexpected ' + name);
    },
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await run({ staff: { role: 'familyDoctor' }, body: { frequency: 'yearly', domain: 'tcm' } }, res);
  assert.equal(res.code, 201, res.body?.message); assert.equal(gateReads, 0);
  assert.equal(query['content.frequency'], 'monthly'); assert.equal(generated.assessmentDomain, 'nutrition');
});
