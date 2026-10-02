const text = value => String(value ?? '').trim();

function isNegativeFoodAllergy(value) {
  const normalized = text(value).replace(/[\s，。；、：:,.!?！？]/g, '');
  return /^(无|否|没有|none|无已知|无食物过敏|无食物过敏史|无已知食物过敏|未报告已知相关情况|未见食物过敏史)$/i.test(normalized);
}

function isUsableFoodAllergy(value) {
  const normalized = text(value);
  return !!normalized && !isNegativeFoodAllergy(normalized)
    && !/^(不详|未知|未记录|未填写|详见过敏史与不良反应史)$/i.test(normalized);
}

function foodAllergyEvidence(patient = {}) {
  const profile = patient.healthProfile || {};
  const lifestyle = patient.lifestyle_data || {};
  const details = [];
  const add = value => {
    for (const part of text(value).split(/[；;]/)) {
      const item = part.trim();
      const key = item.split(/[：:]/)[0].trim();
      if (isUsableFoodAllergy(item) && !details.some(existing => existing.split(/[：:]/)[0].trim() === key)) details.push(item);
    }
  };
  const archive = patient.coreHealthArchive?.allergy;
  if (archive?.presence === 'present') {
    for (const record of archive.records || []) {
      if (!/食|food/i.test(text(record.kind))) continue;
      const substance = text(record.substance);
      if (substance) add([substance, text(record.reaction)].filter(Boolean).join('：'));
    }
  }
  add(profile.foodAllergy);
  for (const record of Array.isArray(profile.allergies) ? profile.allergies : []) {
    if (record && typeof record === 'object' && /食|food/i.test(text(record.type || record.kind))) {
      add([text(record.substance || record.name), text(record.reaction)].filter(Boolean).join('：'));
    }
  }
  const allergens = Array.isArray(lifestyle.foodAllergens) ? lifestyle.foodAllergens : [];
  for (const allergen of allergens) {
    if (text(allergen) === '其它') add(lifestyle.foodAllergensOtherDesc || '其它食物（档案未注明具体名称）');
    else add(allergen);
  }
  if (text(lifestyle.glutenAllergy) === '是') add('麸质（档案标记过敏）');
  return details.join('；').slice(0, 500);
}

module.exports = { isNegativeFoodAllergy, isUsableFoodAllergy, foodAllergyEvidence };
