const clean = (value, limit = 1000) => String(value ?? '').trim().slice(0, limit);
const { isUsableFoodAllergy } = require('../../../shared/foodAllergy.cjs');

function prepareNutritionAssessment(input = {}, user = {}) {
  const targetInput = input.nutritionTargets === undefined
    ? [{ metric: input.metric, baseline: input.baseline, target: input.target }]
    : input.nutritionTargets;
  const nutritionTargets = Array.isArray(targetInput) ? targetInput.slice(0, 12).map(row => ({
    metric: clean(row?.metric, 100), baseline: clean(row?.baseline, 200), target: clean(row?.target, 200),
  })) : [];
  const assessment = {
    goal: clean(input.goal, 500),
    nutritionTargets,
    metric: nutritionTargets[0]?.metric || '',
    baseline: nutritionTargets[0]?.baseline || '',
    target: nutritionTargets[0]?.target || '',
    reviewDate: clean(input.reviewDate, 10),
    currentDiet: clean(input.currentDiet, 1200),
    medicalReview: clean(input.medicalReview, 800),
    practicalConstraints: clean(input.practicalConstraints, 800),
    allergyStatus: clean(input.allergyStatus, 30),
    allergyDetails: input.allergyStatus === 'confirmed_none' ? '' : clean(input.allergyDetails, 500),
    riskStatus: clean(input.riskStatus, 30),
    templateCompatibilityConfirmed: input.templateCompatibilityConfirmed === true,
    height: Number(input.height || user.height),
    weight: Number(input.weight || user.weight),
    age: Number(user.age),
  };
  const missing = [];
  for (const [key, label] of [
    ['goal', '本次营养目标'], ['currentDiet', '近期实际饮食'],
    ['medicalReview', '疾病、用药及相关检查核对'], ['practicalConstraints', '饮食偏好与执行条件'],
  ]) if (!assessment[key]) missing.push(label);
  if (!Array.isArray(targetInput) && input.nutritionTargets !== undefined) missing.push('观察指标列表格式');
  if (!nutritionTargets.length) missing.push('至少一条观察指标');
  if (Array.isArray(targetInput) && targetInput.length > 12) missing.push('观察指标最多12条');
  const names = new Set();
  nutritionTargets.forEach((row, index) => {
    if (!row.metric || !row.baseline || !row.target) missing.push(`第${index + 1}条指标的名称、已核实基线和阶段目标`);
    const name = row.metric.toLowerCase();
    if (name && names.has(name)) missing.push(`第${index + 1}条观察指标重复`);
    names.add(name);
  });
  if (!Number.isFinite(assessment.age) || assessment.age < 18) missing.push('成年客户年龄（未成年人需专门流程）');
  if (!Number.isFinite(assessment.height) || assessment.height < 80 || assessment.height > 230) missing.push('已核实身高（cm）');
  if (!Number.isFinite(assessment.weight) || assessment.weight < 25 || assessment.weight > 350) missing.push('已核实体重（kg）');
  if (!['confirmed_none', 'confirmed_present'].includes(assessment.allergyStatus)) missing.push('食物过敏核对结果');
  if (assessment.allergyStatus === 'confirmed_present' && !assessment.allergyDetails) missing.push('食物过敏详情');
  if (assessment.allergyStatus === 'confirmed_present' && assessment.allergyDetails && !isUsableFoodAllergy(assessment.allergyDetails)) missing.push('具体过敏食物及反应，不能填写无过敏');
  if (!['standard', 'specialist'].includes(assessment.riskStatus)) missing.push('专业风险分流结果');
  if (assessment.riskStatus === 'specialist') missing.push('需专业评估的客户不能自动生成个体化餐单');
  if (!assessment.templateCompatibilityConfirmed) missing.push('模板适用性及过敏禁忌核对');
  const date = assessment.reviewDate;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00+08:00`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed) !== date || date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) missing.push('有效的未来阶段复盘日期');
  return { assessment, missing };
}

module.exports = { prepareNutritionAssessment };
