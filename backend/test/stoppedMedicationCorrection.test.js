const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStoppedMedicationCorrection } = require('../src/utils/stoppedMedicationCorrection');

const old = () => ({ _id: 'med', user: 'patient', stopped: true, active: true, aiStatus: 'approved',
  name: '苯磺酸左氨氯地平片', dosage: '1粒', frequency: '每日1次', startDate: '2016-11-03',
  stopDate: '2026-11-03', stopReason: '已与客户确认停用', updatedAt: new Date('2026-11-03T02:00:00Z'), imageUrls: [] });
const actor = { _id: 'advisor', name: '健康顾问' };

test('corrects historical facts with an audit trail while preserving stopped status', () => {
  const med = old();
  const mutation = buildStoppedMedicationCorrection(med, {
    updatedAt: med.updatedAt.toISOString(), correctionReason: '核对原始记录，年份录错',
    startDate: '2026-11-03', stopReason: med.stopReason,
  }, actor);
  assert.equal(mutation.update.$set.startDate, '2026-11-03');
  assert.equal(mutation.update.$set.stopped, undefined);
  assert.equal(mutation.update.$set.active, undefined);
  assert.equal(mutation.update.$push.correctionHistory.changes.startDate.before, '2016-11-03');
  assert.equal(mutation.update.$push.correctionHistory.reason, '核对原始记录，年份录错');
  assert.equal(mutation.filter.stopped, true);
  assert.equal(mutation.filter.updatedAt, med.updatedAt);
});

test('requires a fresh version, real change and documented reason', () => {
  const med = old();
  const base = { updatedAt: med.updatedAt.toISOString(), correctionReason: '核对记录', startDate: '2026-11-03' };
  assert.throws(() => buildStoppedMedicationCorrection(med, { ...base, updatedAt: '2026-11-01' }, actor), /刷新/);
  assert.throws(() => buildStoppedMedicationCorrection(med, { ...base, correctionReason: '' }, actor), /订正理由/);
  assert.throws(() => buildStoppedMedicationCorrection(med, { ...base, stopped: false }, actor), /不能改变用药状态/);
  assert.throws(() => buildStoppedMedicationCorrection(med, { ...base, startDate: med.startDate }, actor), /没有需要订正/);
  assert.throws(() => buildStoppedMedicationCorrection(med, { ...base, startDate: '2026-13-03' }, actor), /日期格式/);
  assert.throws(() => buildStoppedMedicationCorrection({ ...med, stopped: false }, base, actor), /只有已停用/);
});
