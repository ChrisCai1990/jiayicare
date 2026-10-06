const test = require('node:test');
const assert = require('node:assert/strict');
const { culturalPreferencesConsent: check } = require('../src/utils/culturalPreferencesConsent');
test('blank fields and unchanged historical records do not fabricate consent', () => {
  assert.equal(check({}, {}, 'staff').record, null);
  assert.equal(check({ ethnicity: '', belief: '' }, {}, 'staff').record, null);
  assert.equal(check({ ethnicity: '已记录' }, { ethnicity: '已记录' }, 'staff').record, null);
});
test('new or changed nonempty values require explicit staff confirmation', () => {
  for (const flag of [undefined, false, 'true', 1]) {
    assert.throws(() => check({ belief: '合成示例', culturalPreferencesConfirmed: flag }, {}, 'staff'));
  }
  assert.throws(() => check({ ethnicity: '新值' }, { ethnicity: '旧值' }, 'staff'));
});
test('confirmation records staff identity and server time without storing sensitive values twice', () => {
  const at = new Date('2026-10-06T00:00:00Z');
  const r = check({ belief: ' 合成示例 ', culturalPreferencesConfirmed: true, recordedBy: 'forged' }, {}, 'staff', at);
  assert.equal(r.values.belief, '合成示例');
  assert.equal(r.record.recordedBy, 'staff');
  assert.equal(r.record.recordedAt, at);
  assert.equal(r.record.source, 'staff_attestation');
  assert.deepEqual(r.record.fields, ['belief']);
  assert.ok(!JSON.stringify(r.record).includes('合成示例'));
});
test('clearing does not demand new consent and malformed values fail closed', () => {
  assert.equal(check({ belief: '' }, { belief: '历史' }, 'staff').record.source, 'staff_clear');
  for (const value of [null, {}, [], 'x'.repeat(101)]) assert.throws(() => check({ ethnicity: value }, {}, 'staff'));
});
