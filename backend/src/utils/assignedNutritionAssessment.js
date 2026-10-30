const { prepareNutritionAssessment } = require('./nutritionPlanAssessment');

function prepareAssignedNutritionAssessment(body = {}, patient = {}) {
  if (!body.nutritionAssessment || typeof body.nutritionAssessment !== 'object' || Array.isArray(body.nutritionAssessment))
    throw Object.assign(new Error('请填写完整营养评估'), { statusCode: 400 });
  const { assessment, missing } = prepareNutritionAssessment(body.nutritionAssessment, patient,
    { requireTemplate: false, allowSpecialist: true });
  if (missing.length) throw Object.assign(new Error(`请先补齐或核实：${missing.join('、')}`), { statusCode: 400 });
  const summary = String(body.summary || '').trim().slice(0, 10000);
  const recommendations = String(body.recommendations || '').trim().slice(0, 10000);
  if (summary.length < 10 || recommendations.length < 5)
    throw Object.assign(new Error('请填写至少10字的评估结论和至少5字的后续建议'), { statusCode: 400 });
  return { details: assessment, summary, recommendations };
}

module.exports = { prepareAssignedNutritionAssessment };
