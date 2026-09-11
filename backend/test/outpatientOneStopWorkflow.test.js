const test = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATE_NORMALIZATION } = require('../src/scripts/normalizeMedicalAssistTemplates');
const { PRODUCT_NAME, WORKFLOW_PLANS } = require('../src/scripts/migrateOutpatientOneStopWorkflowV5');

test('门诊一站式是完整多阶段服务，不是单次代办', () => {
  assert.equal(PRODUCT_NAME, '门诊一站式服务');
  assert.equal(WORKFLOW_PLANS.length, 6);
  const names = WORKFLOW_PLANS.map(item => item.name).join('\n');
  for (const expected of ['健康顾问评估', '医院及专家筛选', '首次代诊开单与约检查', '检查日专家门诊安排', '检查及专家门诊陪诊', '病历检查单上传归档']) assert.match(names, new RegExp(expected));
  assert.ok(WORKFLOW_PLANS.every(item => item.executorRole));
  const template = TEMPLATE_NORMALIZATION[PRODUCT_NAME];
  assert.match(template.applicableScenario, /已有检查单的单次代约检不属于/);
  assert.match(template.completionStandard, /门诊病历与检查单已上传归档/);
});
