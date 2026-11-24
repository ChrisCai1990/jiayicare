const test = require('node:test');
const assert = require('node:assert/strict');
const { preserveLegacyNutritionInput } = require('./annualDraftCompatibility');
test('旧草稿保存不因服务端补入新版营养字段被拒，明确提交的新字段仍受版本门槛约束', () => {
  const data = { nutrition_assessment: { enabled: true, advisorTargets: [], executionDate: '2026-11-27' },
    management_targets: { records: [{ goal: '原目标' }] } };
  const legacy = preserveLegacyNutritionInput(data, false, false);
  assert.equal(legacy.nutrition_assessment.advisorTargets, undefined);
  assert.equal(legacy.nutrition_assessment.executionDate, '2026-11-27');
  assert.deepEqual(legacy.management_targets, data.management_targets);
  assert.equal(preserveLegacyNutritionInput(data, false, true), data);
  assert.equal(preserveLegacyNutritionInput(data, true, false), data);
});
