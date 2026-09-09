const test = require('node:test');
const assert = require('node:assert/strict');
const { isDateWithinCoverage, canUseInsuranceCoverage, isInsuranceScenario } = require('../src/utils/insuranceCoverage');

const now = new Date('2026-09-09T12:00:00+08:00');

test('保障起止日期按自然日校验', () => {
  assert.equal(isDateWithinCoverage({ startAt: '2025-11-01', endAt: '2026-10-31' }, now), true);
  assert.equal(isDateWithinCoverage({ startAt: '2026-09-10' }, now), false);
  assert.equal(isDateWithinCoverage({ endAt: '2026-09-08' }, now), false);
});

test('仅生效且有效期内的方案和参保关系可发起服务', () => {
  const policy = { status: 'active', startAt: '2025-11-01', endAt: '2026-10-31' };
  const enrollment = { status: 'active', startAt: '2025-11-01', endAt: '2026-10-31' };
  assert.equal(canUseInsuranceCoverage(policy, enrollment, now), true);
  assert.equal(canUseInsuranceCoverage({ ...policy, status: 'review' }, enrollment, now), false);
  assert.equal(canUseInsuranceCoverage(policy, { ...enrollment, status: 'terminated' }, now), false);
});

test('保险服务场景只接受标准枚举', () => {
  assert.equal(isInsuranceScenario('inpatient'), true);
  assert.equal(isInsuranceScenario('reimbursement'), true);
  assert.equal(isInsuranceScenario('unknown'), false);
});
