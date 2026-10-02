const { saveSection } = require('./initialArchiveReview');
const { foodAllergyEvidence, isUsableFoodAllergy } = require('../../../shared/foodAllergy.cjs');

function appendNutritionFoodAllergy(user, details, actor) {
  const value = String(details || '').trim();
  if (!isUsableFoodAllergy(value) || value.length > 500) throw Object.assign(new Error('请填写已核实的具体过敏食物及反应'), { statusCode: 400 });
  const current = user.coreHealthArchive?.allergy || { revision: 0, records: [] };
  const records = current.records || [];
  const additions = value.split(/[；;]/).map(part => {
    const split = part.trim().match(/^([^：:]+)[：:](.+)$/);
    return { substance: (split ? split[1] : part).trim(), reaction: (split ? split[2] : '').trim() };
  }).filter(row => isUsableFoodAllergy(row.substance)
    && !records.some(old => /食|food/i.test(old.kind || '') && old.substance === row.substance && (old.reaction || '') === row.reaction));
  if (!additions.length) return null;
  const mutation = saveSection(user, 'allergy', {
    revision: current.revision || 0, presence: 'present',
    records: [...records, ...additions.map(row => ({ ...row, kind: '食物过敏', source: '营养干预方案生成前由营养师核实', note: '从本次营养评估追加；原档案记录保留' }))],
  }, actor);
  // This action only adds food allergy evidence. Preserve unrelated drug allergy
  // and legacy mixed allergy fields while saveSection records the full before/after.
  delete mutation.update.$set['healthProfile.drugAllergy'];
  delete mutation.update.$set['healthProfile.allergies'];
  mutation.update.$set['healthProfile.foodAllergy'] = foodAllergyEvidence({
    healthProfile: user.healthProfile,
    coreHealthArchive: { allergy: mutation.update.$set['coreHealthArchive.allergy'] },
  });
  return mutation;
}

module.exports = { appendNutritionFoodAllergy };
