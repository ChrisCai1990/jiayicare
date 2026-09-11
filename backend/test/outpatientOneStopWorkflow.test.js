const test = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATE_NORMALIZATION } = require('../src/scripts/normalizeMedicalAssistTemplates');
const { PRODUCT_NAME, WORKFLOW_PLANS } = require('../src/scripts/migrateOutpatientOneStopWorkflowV5');

test('门诊一站式是完整多阶段服务，不是单次代办', () => {
  assert.equal(PRODUCT_NAME, '门诊一站式服务');
  assert.equal(WORKFLOW_PLANS.length, 6);
  const names = WORKFLOW_PLANS.map(item => item.name).join('\n');
  for (const expected of ['资料收集与核对', '健康顾问评估及医院专家确定', '首次代诊开单与约检查', '检查日专家门诊安排', '检查及专家门诊陪诊', '病历检查单上传归档']) assert.match(names, new RegExp(expected));
  assert.ok(WORKFLOW_PLANS.every(item => item.executorRole));
  assert.deepEqual(WORKFLOW_PLANS.slice(0, 2).map(item => item.executorRole), ['healthManager', 'familyDoctor']);
  assert.match(WORKFLOW_PLANS[0].name, /资料收集/);
  assert.match(WORKFLOW_PLANS[1].name, /健康顾问评估.*医院专家/);
  const template = TEMPLATE_NORMALIZATION[PRODUCT_NAME];
  assert.match(template.applicableScenario, /首次代诊开单、检查预约/);
  assert.match(template.completionStandard, /门诊病历与检查单已上传归档/);
  assert.match(template.applicableScenario, /单次购买/);
  assert.match(template.applicableScenario, /年度会员.*代办、代诊或陪诊/);
});
