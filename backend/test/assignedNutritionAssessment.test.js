const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareAssignedNutritionAssessment } = require('../src/utils/assignedNutritionAssessment');

const patient = { age: 42, gender: '女', height: 165, weight: 68 };
const details = {
  goal: '改善近期饮食结构', reviewDate: '2099-01-01', currentDiet: '午餐外卖，晚餐饮料较多',
  nutritionTargets: [
    { metric: '骨骼肌', baseline: '24 kg', target: '维持24 kg' },
    { metric: '体脂率', baseline: '32%', target: '31%' },
    { metric: '内脏脂肪', baseline: '9级', target: '8级' },
  ],
  height: 165, weight: 68, activityLevel: 'active', weightActivityLevel: 'moderate', lifeStage: 'not_pregnant_lactating',
  managementPurpose: 'maintain', managementKcal: 1800,
  breakfastPercent: 30, lunchPercent: 40, dinnerPercent: 30, snackPercent: 0,
  medicalReview: '已核对疾病、用药及近期检查，无额外饮食限制',
  practicalConstraints: '午餐外卖，晚餐可自行准备', allergyStatus: 'confirmed_none',
  riskStatus: 'standard', templateCompatibilityConfirmed: false,
};

test('派发任务使用完整营养评估，允许不选择方案模板', () => {
  const result = prepareAssignedNutritionAssessment({ nutritionAssessment: details,
    summary: '饮食结构需要调整，晚餐减少含糖饮料', recommendations: '记录饮食并定期复盘' }, patient);
  assert.equal(result.details.goal, details.goal);
  assert.equal(result.details.templateCompatibilityConfirmed, false);
  assert.equal(result.details.nutritionTargets.length, 3);
  assert.throws(() => prepareAssignedNutritionAssessment({ nutritionAssessment: { ...details, currentDiet: '' },
    summary: '饮食结构需要调整，晚餐减少含糖饮料', recommendations: '记录饮食并定期复盘' }, patient), /近期实际饮食/);
});

test('年度派发任务仅由责任营养师完成，并回写结构化评估', async t => {
  const FollowUp = require('../src/models/FollowUp');
  const User = require('../src/models/User');
  const original = { findById: FollowUp.findById, findOneAndUpdate: FollowUp.findOneAndUpdate,
    userFindById: User.findById };
  const redemptionPath = require.resolve('../src/utils/packageServiceRedemption');
  const originalRedemption = require.cache[redemptionPath];
  let redeemed = 0;
  require.cache[redemptionPath] = { id: redemptionPath, filename: redemptionPath, loaded: true,
    exports: { recordCompletedService: async () => { redeemed += 1; return { status: 'recorded' }; } } };
  let task = { _id: 'task1', patientId: 'patient1', assignedTo: 'nutritionist1',
    sourceAnnualPlanId: 'plan1', workflowKey: 'annual_nutrition_assessment',
    status: 'planned', updatedAt: new Date('2026-10-30T00:00:00Z'), formData: {} };
  FollowUp.findById = () => ({ lean: async () => task });
  FollowUp.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.status, 'planned');
    task = { ...task, ...update.$set, updatedAt: new Date() };
    return task;
  };
  User.findById = () => ({ select() { return this }, lean: async () => ({ ...patient, tenantId: 'tenant1', assignedNutritionist: 'nutritionist1' }) });
  t.after(() => {
    FollowUp.findById = original.findById;
    FollowUp.findOneAndUpdate = original.findOneAndUpdate;
    User.findById = original.userFindById;
    if (originalRedemption) require.cache[redemptionPath] = originalRedemption;
    else delete require.cache[redemptionPath];
  });
  const { handle } = require('../src/utils/annualNutritionAssessmentExecution');
  const invoke = async (staff, method, body = {}) => {
    const response = { code: 200, status(code) { this.code = code; return this }, json(value) { this.body = value; return this } };
    await handle({ params: { id: task._id }, staff: { tenantId: 'tenant1', name: '测试营养师', ...staff }, method, body }, response);
    return response;
  };
  const payload = { baseUpdatedAt: task.updatedAt.toISOString(), nutritionAssessment: details,
    summary: '饮食结构需要调整，晚餐减少含糖饮料', recommendations: '记录饮食并定期复盘' };
  assert.equal((await invoke({ _id: 'advisor1', role: 'familyDoctor' }, 'POST', payload)).code, 403);
  assert.equal((await invoke({ _id: 'nutritionist1', role: 'nutritionist' }, 'POST', { ...payload, baseUpdatedAt: '2020-01-01' })).code, 409);
  const saved = await invoke({ _id: 'nutritionist1', role: 'nutritionist' }, 'POST', payload);
  assert.equal(saved.code, 200);
  assert.equal(saved.body.data.status, 'completed');
  assert.equal(saved.body.data.formData.assignedNutritionAssessment.details.goal, details.goal);
  assert.equal(redeemed, 1);
  assert.equal((await invoke({ _id: 'nutritionist1', role: 'nutritionist' }, 'POST', payload)).code, 200);
  assert.equal(redeemed, 1);
});
