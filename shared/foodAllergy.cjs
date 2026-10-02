const text = value => String(value ?? '').trim();

function isNegativeFoodAllergy(value) {
  const normalized = text(value).replace(/[\s，。；、：:,.!?！？]/g, '');
  return /^(无|否|没有|none|无已知|无食物过敏|无食物过敏史|无已知食物过敏|未报告已知相关情况|未见食物过敏史)$/i.test(normalized);
}

function isUsableFoodAllergy(value) {
  const normalized = text(value);
  return !!normalized && !isNegativeFoodAllergy(normalized)
    && !/^(不详|未知|未记录|未填写|是|有|有食物过敏|有食物过敏史|已知有食物过敏|食物过敏|其它|其他|其它食物（档案未注明具体名称）|详见过敏史与不良反应史)$/i.test(normalized);
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
    if (text(allergen) === '其它') add(lifestyle.foodAllergensOtherDesc);
    else add(allergen);
  }
  if (text(lifestyle.glutenAllergy) === '是') add('麸质（档案标记过敏）');
  return details.join('；').slice(0, 500);
}

function hasFoodAllergyRecord(patient = {}) {
  if (foodAllergyEvidence(patient)) return true;
  const profileFlag = text(patient.healthProfile?.foodAllergy);
  const allergens = patient.lifestyle_data?.foodAllergens;
  return /^(是|有|有食物过敏|有食物过敏史|已知有食物过敏|食物过敏)$/i.test(profileFlag)
    || Array.isArray(allergens) && allergens.some(value => text(value) === '其它');
}

function questionnaireFoodAllergyEvidence(patient = {}) {
  const items = [...(patient.initialArchiveReview?.items || []), ...(patient.archiveDraft?.items || [])];
  const details = [];
  for (const item of items) {
    const path = text(item.path);
    if (!['healthProfile.foodAllergy', 'lifestyle_data.foodAllergens', 'lifestyle_data.foodAllergensOtherDesc'].includes(path)
      && !(item.section === 'allergy' && /食物|食品/.test(text(item.label || item.questionText)))) continue;
    const raw = item.valueStr || item.value || item.answer;
    const candidates = Array.isArray(raw) ? raw : raw && typeof raw === 'object'
      ? [...(Array.isArray(raw.values) ? raw.values : []), ...Object.values(raw.inputs || {})] : [raw];
    for (const candidate of candidates) {
      for (const part of text(candidate).split(/[；;、]/)) {
        const value = part.trim();
        if (isUsableFoodAllergy(value) && !details.includes(value)) details.push(value);
      }
    }
  }
  return details.join('；').slice(0, 500);
}

module.exports = { isNegativeFoodAllergy, isUsableFoodAllergy, foodAllergyEvidence, hasFoodAllergyRecord, questionnaireFoodAllergyEvidence };
