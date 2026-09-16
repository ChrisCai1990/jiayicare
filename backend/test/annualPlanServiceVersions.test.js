const test = require('node:test');
const assert = require('node:assert/strict');
const { inferServiceVersion, normalizeAnnualTemplate, templateMatchesPatient, recommendedTemplateId } = require('../src/utils/annualPlanServiceVersions');

test('金伊森健康维稳与健康顾问是两个独立服务版本', () => {
  const stable = inferServiceVersion({ name: '健康维稳计划', clientBrand: 'jinyisen' });
  const advisor = inferServiceVersion({ name: '健康顾问计划', clientBrand: 'jinyisen' });
  assert.equal(stable.code, 'jys_stable');
  assert.equal(advisor.code, 'jys_advisor');
  assert.equal(stable.strategyType, 'chronic_stable');
  assert.equal(advisor.strategyType, 'chronic_stable');
  assert.notEqual(stable.code, advisor.code);
});

test('历史模板按名称和客户归属补齐服务版本与策略', () => {
  const template = normalizeAnnualTemplate({ name: '轻享健康计划', clientBrands: ['jiayiguanjia'], content: {} }, { clientBrand: 'jiayiguanjia' });
  assert.equal(template.content.servicePlanCode, 'jygj_light');
  assert.equal(template.content.strategyType, 'young_state');
  assert.equal(template.content.planType, 'young_state');
});

test('会员类型与服务包限制同时生效', () => {
  const template = { content: { eligibleMemberTypes: ['金卡'], eligibleServicePackages: ['健康顾问计划'] } };
  assert.equal(templateMatchesPatient(template, { memberType: '金卡', servicePackage: '健康顾问计划' }), true);
  assert.equal(templateMatchesPatient(template, { memberType: '银卡', servicePackage: '健康顾问计划' }), false);
  assert.equal(templateMatchesPatient(template, { memberType: '金卡', servicePackage: '其他服务' }), false);
});

test('历史未配置限制时按客户服务包名称自动推荐', () => {
  const templates = [
    { _id: 'young', name: '健康年轻态计划', content: { servicePlanCode: 'jys_young' } },
    { _id: 'stable', name: '健康维稳计划', content: { servicePlanCode: 'jys_stable' } },
    { _id: 'advisor', name: '健康顾问计划', content: { servicePlanCode: 'jys_advisor' } },
  ];
  assert.equal(recommendedTemplateId(templates, { servicePackage: '金伊森健康顾问计划', memberType: '' }), 'advisor');
});
