const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatChinaServiceDate,
  extractConfirmedServiceTime,
  confirmedServiceSchedule,
  applyConfirmedServiceSchedule,
} = require('../src/utils/confirmedServiceSchedule');

test('formats an order date in the China timezone for a date input', () => {
  assert.equal(formatChinaServiceDate('2026-09-07T16:00:00.000Z'), '2026-09-08');
});

test('prefers the confirmed meeting time over the later appointment time', () => {
  assert.equal(
    extractConfirmedServiceTime('9点门诊，8点在506号楼碰面', '心内科9点'),
    '8点'
  );
});

test('falls back to a time stated in the service requirements', () => {
  assert.equal(extractConfirmedServiceTime('', '邵逸夫医院 心内科 09:30'), '09:30');
});

test('builds the schedule from confirmed order data without AI inference', () => {
  assert.deepEqual(confirmedServiceSchedule({
    desiredServiceDate: '2026-09-07T16:00:00.000Z',
    serviceRequirements: '心内科9点',
  }), { serviceDate: '2026-09-08', serviceTime: '9点' });
});

test('fills a legacy linked plan while preserving values already reviewed by staff', () => {
  const order = {
    desiredServiceDate: '2026-09-07T16:00:00.000Z',
    note: '9点门诊，8点在506号楼碰面',
  };
  assert.deepEqual(applyConfirmedServiceSchedule({ hospital: '邵逸夫医院' }, order), {
    hospital: '邵逸夫医院', serviceDate: '2026-09-08', serviceTime: '8点',
  });
  assert.deepEqual(applyConfirmedServiceSchedule({ serviceDate: '2026-09-09', serviceTime: '上午' }, order), {
    serviceDate: '2026-09-09', serviceTime: '上午',
  });
});
