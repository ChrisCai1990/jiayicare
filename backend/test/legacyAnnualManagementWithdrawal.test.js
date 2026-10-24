const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');

function handler(context) {
  const path = "router.post('/patients/:id/annual-management-decisions/:decisionId/withdraw', staffAuth, async (req, res) => {";
  const start = source.indexOf(path);
  assert.ok(start > 0);
  const first = source.indexOf('async (req, res)', start);
  const end = source.indexOf('\n});', first);
  return vm.runInNewContext('(' + source.slice(first, end + 2) + ')', context);
}
function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }

test('撤销旧整份报告归属保留原决定与撤销审计，不删除报告或方案', async () => {
  const id = '507f1f77bcf86cd799439011';
  const patientId = '507f1f77bcf86cd799439012';
  const reportId = '507f1f77bcf86cd799439013';
  const row = { _id: id, patientId, year: 2026, reportId, sourceKey: `screening_report:${reportId}`, title: '脂肪肝' };
  let update;
  const Decision = {
    findOne: async () => row,
    findOneAndUpdate: async (filter, patch) => { update = { filter, patch }; return { ...row, ...patch.$set }; },
  };
  const run = handler({ getVisiblePlanPatientIds: async () => [patientId], mongoose: { isValidObjectId: () => true },
    AnnualPlan: { exists: async () => false }, require: name => name.endsWith('/AnnualManagementDecision') ? Decision : assert.fail(name), Date });
  const res = response();
  await run({ staff: { role: 'familyDoctor', _id: 'advisor' }, params: { id: patientId, decisionId: id }, body: { reason: '原整份报告归属有误' } }, res);
  assert.equal(res.code, 200);
  assert.equal(update.patch.$set.status, 'withdrawn');
  assert.equal(update.patch.$set.withdrawalReason, '原整份报告归属有误');
  assert.equal(update.patch.$set.withdrawnBy, 'advisor');
  assert.ok(update.patch.$set.withdrawnAt instanceof Date);
  assert.equal(update.filter.sourceKey, `screening_report:${reportId}`);
});

test('已推送方案等待客户确认时不能撤销旧来源', async () => {
  const id = '507f1f77bcf86cd799439011', patientId = '507f1f77bcf86cd799439012';
  const Decision = { findOne: async () => ({ _id: id, year: 2026, reportId: 'report', sourceKey: 'screening_report:report' }),
    findOneAndUpdate: async () => assert.fail('must not withdraw') };
  const run = handler({ getVisiblePlanPatientIds: async () => [patientId], mongoose: { isValidObjectId: () => true },
    AnnualPlan: { exists: async () => true }, require: name => name.endsWith('/AnnualManagementDecision') ? Decision : assert.fail(name) });
  const res = response();
  await run({ staff: { role: 'familyDoctor' }, params: { id: patientId, decisionId: id }, body: { reason: '原报告归属有误' } }, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /等待客户确认/);
});
