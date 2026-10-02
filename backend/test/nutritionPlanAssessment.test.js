const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareNutritionAssessment } = require('../src/utils/nutritionPlanAssessment');

const user = { age: 42, height: 165, weight: 68 };
const valid = {
  goal: '改善近期饮食结构', metric: '每周含糖饮料次数', baseline: '每周5次',
  target: '每周不超过1次', reviewDate: '2099-01-01', currentDiet: '三餐，午餐外卖，晚餐常喝含糖饮料',
  medicalReview: '已核对疾病、用药及近期检查，无额外饮食限制',
  practicalConstraints: '午餐外卖，预算30元，晚餐可自行准备',
  allergyStatus: 'confirmed_none', riskStatus: 'standard', templateCompatibilityConfirmed: true,
};

test('个体化营养草稿需要核实目标、饮食、安全信息和复盘时间', () => {
  assert.deepEqual(prepareNutritionAssessment(valid, user).missing, []);
  const missing = prepareNutritionAssessment({ ...valid, currentDiet: '', allergyStatus: '', reviewDate: '' }, user).missing;
  assert(missing.includes('近期实际饮食'));
  assert(missing.includes('食物过敏核对结果'));
  assert(missing.includes('有效的未来阶段复盘日期'));
});

test('特殊风险与未成年人不能走普通成人餐单自动生成', () => {
  assert(prepareNutritionAssessment({ ...valid, riskStatus: 'specialist' }, user).missing.some(text => text.includes('不能自动生成')));
  assert(prepareNutritionAssessment(valid, { ...user, age: 15 }).missing.some(text => text.includes('未成年人')));
});

test('有食物过敏时必须记录详情，模板适用性必须核对', () => {
  const missing = prepareNutritionAssessment({ ...valid, allergyStatus: 'confirmed_present', allergyDetails: '', templateCompatibilityConfirmed: false }, user).missing;
  assert(missing.includes('食物过敏详情'));
  assert(missing.includes('模板适用性及过敏禁忌核对'));
});

test('多条观察指标分别保存基线与目标，并拒绝缺项、重复或超量', () => {
  const input = { ...valid, nutritionTargets: [
    { metric: '体重', baseline: '51 kg（10月1日）', target: '50 kg（11月1日）' },
    { metric: '含糖饮料次数', baseline: '每周5次', target: '每周不超过1次' },
  ] };
  const result = prepareNutritionAssessment(input, user);
  assert.deepEqual(result.missing, []);
  assert.equal(result.assessment.nutritionTargets.length, 2);
  assert.equal(result.assessment.nutritionTargets[1].target, '每周不超过1次');
  assert(prepareNutritionAssessment({ ...input, nutritionTargets: [{ metric: '体重', baseline: '51 kg', target: '' }] }, user).missing.some(text => text.includes('第1条')));
  assert(prepareNutritionAssessment({ ...input, nutritionTargets: [input.nutritionTargets[0], input.nutritionTargets[0]] }, user).missing.some(text => text.includes('重复')));
  assert(prepareNutritionAssessment({ ...input, nutritionTargets: Array(13).fill(input.nutritionTargets[0]) }, user).missing.some(text => text.includes('最多12条')));
});
