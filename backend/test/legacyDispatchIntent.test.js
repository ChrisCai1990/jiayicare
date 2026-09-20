const test = require('node:test');
const assert = require('node:assert/strict');
const { armLegacyDispatchIntent: arm } = require('../src/utils/legacyDispatchIntent');
test('explicit audited abnormal input is frozen once with save CAS', () => {
  const report = { audit_status: 'audited', user: 'u', isNew: false };
  const input = { abnormalItems: [{ name: 'a' }], notes: 'original' };
  arm(report, { _id: 's', name: 'owner' }, input);
  const token = report.legacyDispatchIntent.token;
  input.abnormalItems[0].name = 'changed';
  arm(report, { _id: 'other' }, input);
  assert.equal(report.legacyDispatchIntent.token, token);
  assert.equal(report.legacyDispatchIntent.input.abnormalItems[0].name, 'a');
  assert.equal(report.legacyDispatchIntent.staff._id, 's');
  assert.deepEqual(report.$where, { legacyDispatchIntent: null });
});
test('unapproved and empty inputs never create an intent', () => {
  for (const [status, items] of [['rejected', [{ name: 'a' }]], ['audited', []]]) {
    const report = { audit_status: status };
    arm(report, {}, { abnormalItems: items });
    assert.equal(report.legacyDispatchIntent, undefined);
  }
});
