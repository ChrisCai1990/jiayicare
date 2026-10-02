const test = require('node:test');
const assert = require('node:assert/strict');
const { appendNutritionFoodAllergy } = require('../src/utils/nutritionFoodAllergyArchive');

test('营养师核实新食物过敏时追加档案记录与历史，不覆盖旧药物过敏', () => {
  const user = { _id: 'user-1', healthProfile: { foodAllergy: '无食物过敏史', drugAllergy: '青霉素：皮疹' },
    coreHealthArchive: { allergy: { revision: 2, presence: 'present', records: [
      { id: 'old-drug', kind: '药物过敏', substance: '青霉素', reaction: '皮疹' },
    ] } } };
  const mutation = appendNutritionFoodAllergy(user, '花生：荨麻疹', { _id: 'staff-1', name: '营养师' });
  const section = mutation.update.$set['coreHealthArchive.allergy'];
  assert.equal(section.revision, 3);
  assert.equal(section.records.length, 2);
  assert.equal(section.records[0].id, 'old-drug');
  assert.equal(section.records[1].substance, '花生');
  assert.equal(section.records[1].reaction, '荨麻疹');
  assert.equal(mutation.update.$set['healthProfile.drugAllergy'], undefined);
  assert.equal(mutation.update.$set['healthProfile.foodAllergy'], '花生：荨麻疹');
  assert.equal(mutation.update.$push.coreHealthArchiveHistory.before.records.length, 1);
  assert.equal(mutation.update.$push.coreHealthArchiveHistory.legacyBefore.foodAllergy, '无食物过敏史');
});

test('重复记录不追加，否定词不能被当作过敏原', () => {
  const user = { _id: 'user-1', coreHealthArchive: { allergy: { revision: 1, presence: 'present', records: [
    { id: 'food-1', kind: '食物过敏', substance: '花生', reaction: '皮疹' },
  ] } } };
  assert.equal(appendNutritionFoodAllergy(user, '花生：皮疹', { _id: 'staff-1' }), null);
  assert.throws(() => appendNutritionFoodAllergy(user, '无食物过敏史', { _id: 'staff-1' }), /具体过敏食物/);
  const mutation = appendNutritionFoodAllergy(user, '花生：皮疹；坚果：口唇肿胀', { _id: 'staff-1' });
  const records = mutation.update.$set['coreHealthArchive.allergy'].records;
  assert.equal(records.length, 2);
  assert.equal(records[1].substance, '坚果');
  assert.equal(records[1].reaction, '口唇肿胀');
});
