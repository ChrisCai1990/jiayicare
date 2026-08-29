const test = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATE_NORMALIZATION, normalizedContent } = require('../src/scripts/normalizeMedicalAssistTemplates');

test('defines all 13 audited medical assistance templates', () => {
  assert.equal(Object.keys(TEMPLATE_NORMALIZATION).length, 13);
  for (const [name, content] of Object.entries(TEMPLATE_NORMALIZATION)) {
    assert.ok(name);
    for (const field of ['serviceDomain', 'assistanceType', 'applicableScenario', 'standardSteps', 'requiredMaterials', 'completionStandard', 'riskNotes']) {
      assert.ok(content[field], `${name} missing ${field}`);
    }
  }
});

test('normalization keeps linkage while clearing client-specific defaults', () => {
  const result = normalizedContent(
    { followUpPlanId: 'plan-1', followUpPlanName: '就医任务', hotel: '固定酒店', custom: 'keep' },
    TEMPLATE_NORMALIZATION['门诊一站式服务'],
  );
  assert.equal(result.followUpPlanId, 'plan-1');
  assert.equal(result.custom, 'keep');
  assert.equal(result.hotel, '');
  assert.equal(result.transport, '');
  assert.equal(result.tasks, result.standardSteps);
  assert.equal(result.notes, result.riskNotes);
});
