const test = require('node:test'), assert = require('node:assert/strict');
const tools = require('../../shared/annualBookingPlan.cjs');
const { receipt } = require('../src/utils/annualBookingReceipt');
const task = { sourceScheduleKey: 'abnormal_followup:2026-12-02:x', plannedContent: '医院：医院甲\n检查科室：超声科\n检查专家：超声专家\n开单科室：泌尿外科\n开单专家：门诊专家\n项目：肾脏超声；甲状腺超声\n原因：顾问确认' };
const entries = [ { id: 'outpatient', mode: 'prebook', date: '2026-12-02', time: '08:30' }, { id: 'exam-0', mode: 'prebook', date: '2026-12-02', time: '10:30' }, { id: 'exam-1', mode: 'onsite', note: '先开单缴费，由陪诊就医专员现场办理' } ];
test('门诊和多个检查分别保留顾问科室专家，不混用开单科室', () => {
  const slots = tools.bookingSlots(task);
  assert.deepEqual(slots.map(s => s.department), ['泌尿外科', '超声科', '超声科']);
  assert.deepEqual(slots.map(s => s.expert), ['门诊专家', '超声专家', '超声专家']);
  const saved = receipt({ entries }, 'manager', task);
  assert.equal(saved.status, 'arranged'); assert.equal(tools.bookingReady(saved), true);
  assert.equal(saved.entries[2].status, 'pending'); assert.equal(tools.pendingOnsite(saved).length, 1);
  assert.equal(saved.advisorPlanText, task.plannedContent);
});
test('缺项、重复、伪造顾问要求、空交接不能提交', () => {
  for (const values of [entries.slice(1), [entries[0], entries[0], entries[2]], entries.map((e,i) => i === 1 ? { ...e, department: '自行改科室' } : e), entries.map((e,i) => i === 2 ? { ...e, note: '' } : e), entries.map((e,i) => i === 0 ? { ...e, mode: 'onsite', note: '跳过门诊' } : e)]) assert.throws(() => receipt({ entries: values }, 'm', task));
  assert.throws(() => receipt({ date: '2026-12-02', time: '09:00' }, 'm', task));
});
test('无需预约要有依据，不伪造预约日期；旧单项回执仍可读取', () => {
  const saved = receipt({ entries: entries.map(e => ({ ...e, mode: 'not_required', note: '已核实无需预约' })) }, 'm', task);
  assert.equal(saved.entries[0].date, undefined); assert.equal(tools.pendingOnsite(saved).length, 0);
  assert.equal(tools.bookingReady({ status: 'booked' }), true);
});
test('多行项目不吞掉第二项，逗号和括号不是任意拆分点', () => {
  const slots = tools.bookingSlots({ ...task, plannedContent: '检查科室：超声科\n项目：肾脏超声（大小、血流）\n甲状腺超声\n原因：确认' });
  assert.equal(slots.length, 2); assert.equal(slots[0].title, '肾脏超声（大小、血流）');
});
