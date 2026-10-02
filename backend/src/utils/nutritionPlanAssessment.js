const clean = (value, limit = 1000) => String(value ?? '').trim().slice(0, limit);

function prepareNutritionAssessment(input = {}, user = {}) {
  const assessment = {
    goal: clean(input.goal, 500),
    metric: clean(input.metric, 100),
    baseline: clean(input.baseline, 100),
    target: clean(input.target, 100),
    reviewDate: clean(input.reviewDate, 10),
    currentDiet: clean(input.currentDiet, 1200),
    medicalReview: clean(input.medicalReview, 800),
    practicalConstraints: clean(input.practicalConstraints, 800),
    allergyStatus: clean(input.allergyStatus, 30),
    allergyDetails: clean(input.allergyDetails, 500),
    riskStatus: clean(input.riskStatus, 30),
    templateCompatibilityConfirmed: input.templateCompatibilityConfirmed === true,
    height: Number(input.height || user.height),
    weight: Number(input.weight || user.weight),
    age: Number(user.age),
  };
  const missing = [];
  for (const [key, label] of [
    ['goal', '本次营养目标'], ['metric', '观察指标'], ['baseline', '已核实基线'],
    ['target', '阶段目标'], ['currentDiet', '近期实际饮食'],
    ['medicalReview', '疾病、用药及相关检查核对'], ['practicalConstraints', '饮食偏好与执行条件'],
  ]) if (!assessment[key]) missing.push(label);
  if (!Number.isFinite(assessment.age) || assessment.age < 18) missing.push('成年客户年龄（未成年人需专门流程）');
  if (!Number.isFinite(assessment.height) || assessment.height < 80 || assessment.height > 230) missing.push('已核实身高（cm）');
  if (!Number.isFinite(assessment.weight) || assessment.weight < 25 || assessment.weight > 350) missing.push('已核实体重（kg）');
  if (!['confirmed_none', 'confirmed_present'].includes(assessment.allergyStatus)) missing.push('食物过敏核对结果');
  if (assessment.allergyStatus === 'confirmed_present' && !assessment.allergyDetails) missing.push('食物过敏详情');
  if (!['standard', 'specialist'].includes(assessment.riskStatus)) missing.push('专业风险分流结果');
  if (assessment.riskStatus === 'specialist') missing.push('需专业评估的客户不能自动生成个体化餐单');
  if (!assessment.templateCompatibilityConfirmed) missing.push('模板适用性及过敏禁忌核对');
  const date = assessment.reviewDate;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00+08:00`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed) !== date || date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) missing.push('有效的未来阶段复盘日期');
  return { assessment, missing };
}

module.exports = { prepareNutritionAssessment };
