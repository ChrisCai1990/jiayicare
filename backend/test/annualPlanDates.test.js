const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../src/utils/annualPlanDates');
const { validate } = require('../src/utils/annualPlanPublishValidation');
test('valid legacy date shown on review card is persisted into execution date', () => {
  const data = { abnormal_followup: { records: [{ items: '甲状腺超声', executionDate: '2027/2/20' }] } };
  const normalized = normalize(data);
  assert.equal(normalized.abnormal_followup.records[0].time, '2027-02-20');
  assert.equal(data.abnormal_followup.records[0].time, undefined);
  assert.equal(validate(normalized, '2026-11-20'), '');
});
test('un-padded valid dates accepted while invalid and overdue dates identify exact review', () => {
  const check = time => validate({ abnormal_followup: { records: [{ reviewItems: ['尿酸'], time }] } }, '2026-11-20');
  assert.equal(check('2027-2-20'), '');
  assert.match(check('2027-02-30'), /尿酸.*2027-02-30.*2026-11-20/);
  assert.match(check('2026-11-19'), /尿酸.*2026-11-19/);
  assert.match(check(''), /尿酸.*未填写/);
});
test('explicit execution date wins; pending dates never inferred from another field', () => {
  const rows = normalize({ abnormal_followup: { records: [
    { time: '2027-03-01', executionDate: '2027-02-01' },
    { datePending: true, executionDate: '2027-02-01' },
  ] } }).abnormal_followup.records;
  assert.equal(rows[0].time, '2027-03-01');
  assert.equal(rows[1].time, undefined);
});
