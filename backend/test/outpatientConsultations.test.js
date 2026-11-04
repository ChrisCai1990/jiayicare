const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOutpatientConsultations, consultationRequirementLines } = require('../src/utils/outpatientConsultations');

test('多专科保持科室和专家一一对应，并进入执行任务要求', () => {
  const consultations = normalizeOutpatientConsultations({ consultations: [
    { department: ' 肿瘤外科 ', expert: ' 谢医生 ' },
    { department: '影像科', expert: '' },
  ] });
  assert.deepEqual(consultations, [
    { department: '肿瘤外科', expert: '谢医生' },
    { department: '影像科', expert: '' },
  ]);
  assert.deepEqual(consultationRequirementLines({ consultations }), [
    '就诊专科1：肿瘤外科 · 专家：谢医生',
    '就诊专科2：影像科',
  ]);
});

test('旧版单科室方案仍可读取，空科室和过多专科被拒绝', () => {
  assert.deepEqual(normalizeOutpatientConsultations({ department: '肿瘤外科', expert: '谢医生' }), [
    { department: '肿瘤外科', expert: '谢医生' },
  ]);
  assert.deepEqual(consultationRequirementLines({ department: '肿瘤外科', expert: '谢医生' }), ['科室：肿瘤外科', '医生：谢医生']);
  assert.throws(() => normalizeOutpatientConsultations({ consultations: [{ department: ' ' }] }), /就诊科室/);
  assert.throws(() => normalizeOutpatientConsultations({ consultations: Array.from({ length: 13 }, () => ({ department: '外科' })) }), /1至12组/);
});
