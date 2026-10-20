const test = require('node:test');
const assert = require('node:assert/strict');
const { isAssistance, needsBooking } = require('../../shared/annualServiceItem.cjs');
const { bookingSlots } = require('../../shared/annualBookingPlan.cjs');
const { receipt } = require('../src/utils/annualBookingReceipt');

test('仅需代约的年度随访进入健管预约，并记录实际约到的候选专家', () => {
  const task = {
    sourceType: 'scheduled', sourceAnnualPlanId: 'plan-1', sourceScheduleKey: 'abnormal_followup:2026-12-01:甲状腺超声',
    deliveryMode: 'reminder', status: 'planned',
    plannedContent: '就医/会诊医院：邵逸夫医院\n科室：超声科\n项目：甲状腺超声',
    formData: { bookingRequest: { required: true, experts: [{ id: 'expert-1', name: '王医生' }, { id: 'expert-2', name: '李医生' }] } },
  };
  assert.equal(isAssistance(task), true);
  assert.equal(needsBooking(task), true);
  const [slot] = bookingSlots(task);
  assert.deepEqual(slot.candidates.map(item => item.name), ['王医生', '李医生']);
  const base = { id: slot.id, mode: 'prebook', date: '2026-12-01', time: '09:00', hospital: '邵逸夫医院' };
  assert.throws(() => receipt(base, 'manager-1', task), /实际预约专家/);
  assert.throws(() => receipt({ entries: [{ ...base, bookedExpertId: 'other' }] }, 'manager-1', task), /候选专家/);
  const result = receipt({ entries: [{ ...base, bookedExpertId: 'expert-2' }] }, 'manager-1', task);
  assert.equal(result.entries[0].expert, '李医生');
  assert.equal(result.entries[0].expertId, 'expert-2');
  assert.equal(result.entries[0].status, 'booked');
});
