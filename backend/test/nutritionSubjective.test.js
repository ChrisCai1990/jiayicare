const test = require('node:test');
const assert = require('node:assert/strict');
const { fromArchive, verifiedChanges } = require('../../shared/nutritionSubjective.cjs');

test('档案主观感受优先读取营养师核实记录，其余从既有生活方式资料带入', () => {
  const patient = { lifestyle: { sleep: '偶尔失眠', bowel: '每日一次', mood: '稳定' },
    lifestyle_data: { nutritionSubjective: { 睡眠质量: '夜醒两次' }, psychStress: '中等压力/焦虑' } };
  assert.equal(fromArchive(patient).睡眠质量, '夜醒两次');
  assert.equal(fromArchive(patient).消化功能, '每日一次');
  assert.equal(fromArchive(patient).情绪状态, '稳定');
});

test('只为营养师保留并核实的主观指标生成前后变化', () => {
  const patient = { lifestyle_data: { nutritionSubjective: { 睡眠质量: '夜醒两次' } } };
  assert.deepEqual(verifiedChanges(patient, [
    { metric: '睡眠质量', baseline: '夜醒两次' },
    { metric: '消化功能', baseline: '腹胀、便秘' },
    { metric: '体重', baseline: '68 kg' },
  ]), { 消化功能: { from: '', to: '腹胀、便秘' } });
});
