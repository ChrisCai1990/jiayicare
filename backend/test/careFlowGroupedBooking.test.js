const test = require('node:test');
const assert = require('node:assert/strict');
const { bookingRequirements } = require('../../shared/annualBookingDisplay.cjs');
const { bookingSlots } = require('../../shared/annualBookingPlan.cjs');
const { receipt } = require('../src/utils/annualBookingReceipt');
const { runtime } = require('../src/utils/careFlowRuntime');

const plannedContent = [
  '预约安排日期：2026-11-20；建议就医/检查日期：2026-11-27。',
  '就医/会诊医院：邵逸夫医院',
  '科室：心内科',
  '专家：专家甲',
  '项目：脂蛋白磷脂酶A2',
  '同次就诊事项：非梗阻性肥厚型心肌病；颈动脉斑块，评估是否需要用药；脂蛋白磷脂酶A2；25-羟基维生素D',
  '非梗阻性肥厚型心肌病：科室心内科；专家专家乙；原因核对既往诊断',
  '颈动脉斑块，评估是否需要用药：科室心内科；专家专家丙；原因核对用药需求',
  '25-羟基维生素D：科室检验科；原因复查',
].join('\n');

test('已启动流程从原交接还原全部同次就诊事项，科室专家逐项对应', () => {
  const requirements = bookingRequirements({ plannedContent });
  const slots = bookingSlots({ plannedContent, visitItems: requirements.visitItems });
  assert.equal(requirements.appointmentDate, '2026-11-20');
  assert.deepEqual(slots.map(row => row.title), ['非梗阻性肥厚型心肌病', '颈动脉斑块，评估是否需要用药', '脂蛋白磷脂酶A2', '25-羟基维生素D']);
  assert.deepEqual(slots.map(row => row.department), ['心内科', '心内科', '心内科', '检验科']);
  assert.deepEqual(slots.map(row => row.expert), ['专家乙', '专家丙', '专家甲', '']);
  assert.ok(slots.every(row => row.hospital === '邵逸夫医院'));
  assert.throws(() => receipt({ entries: [{ id: slots[2].id, mode: 'prebook', date: '2026-11-27', time: '09:00' }] }, 'manager', { plannedContent, visitItems: requirements.visitItems }), /逐项填写全部预约安排/);
});

test('新流程直接使用原年度方案的结构化清单', () => {
  const visitItems = [
    { moduleKey: 'medical_treatment', recordIndex: 0, title: '心内科门诊', department: '心内科', expert: '专家甲' },
    { moduleKey: 'abnormal_followup', recordIndex: 1, title: '颈动脉超声', department: '超声科', expert: '专家乙' },
  ];
  const slots = bookingSlots({ plannedContent, visitItems });
  assert.deepEqual(slots.map(row => row.type), ['outpatient', 'exam']);
  const entries = slots.map(row => ({ id: row.id, mode: 'prebook', date: '2026-11-27', time: '09:00' }));
  const saved = receipt({ entries }, 'manager', { plannedContent, visitItems });
  assert.deepEqual(saved.entries.map(row => row.department), ['心内科', '超声科']);
});

test('已启动的预约流程从原服务需求带出结构化清单', async () => {
  const visitItems = [
    { moduleKey: 'medical_treatment', recordIndex: 0, title: '心内科门诊', department: '心内科' },
    { moduleKey: 'abnormal_followup', recordIndex: 1, title: '颈动脉超声', department: '超声科' },
  ];
  const flow = { _id: 'request', patientId: 'patient', state: { stage: 'booking', people: { healthManager: { id: 'manager', role: 'healthManager' } }, data: { advisor: { text: plannedContent } } } };
  const api = runtime({
    enabled: () => true,
    Flow: { findOne: () => ({ lean: async () => flow }) },
    Task: { findById: () => ({ lean: async () => ({ formData: { serviceRequest: { itemSnapshot: { visitItems } } } }) }) },
  });
  const result = await api.view('request', { _id: 'manager', role: 'healthManager', tenantId: null });
  assert.deepEqual(result.state.data.visitItems, visitItems);
  assert.deepEqual(bookingSlots({ plannedContent, visitItems: result.state.data.visitItems }).map(row => row.type), ['outpatient', 'exam']);
});
