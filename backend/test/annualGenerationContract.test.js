const test = require('node:test');
const assert = require('node:assert/strict');
const { annualGenerationExample, annualGenerationPrompt, annualGenerationError } = require('../src/utils/annualGenerationContract');
const { validateAnnualRaw } = require('../src/utils/annualGenerationConsistency');
const keys = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup'];
const catalog = [...keys, 'personalized'].map(category => ({ id: category, category, name: category }));
const evidence = [{ id: 'source:1' }, { id: 'source:2' }];
test('complete output example passes unchanged runtime contract, including annual checkup provenance', () => {
  const raw = annualGenerationExample(catalog, evidence, keys);
  assert.equal(validateAnnualRaw(raw, catalog, evidence, keys), raw);
  assert.ok(raw.annual_checkup.basisSummary); assert.deepEqual(raw.annual_checkup.sourceIds, ['source:1']);
  delete raw.annual_checkup.basisSummary;
  assert.throws(() => validateAnnualRaw(raw, catalog, evidence, keys), /缺少来源依据/);
});
test('new prompt replaces old incomplete examples instead of appending competing rules', () => {
  const prompt = annualGenerationPrompt('rules\n请严格按以下JSON格式输出，仅输出JSON：\nOLD_MONITORING_EXAMPLE', catalog, evidence, keys);
  assert.ok(!prompt.includes('OLD_MONITORING_EXAMPLE')); assert.ok(prompt.includes('basisSummary')); assert.ok(prompt.includes('sourceIds'));
  assert.ok(!Object.hasOwn(annualGenerationExample(catalog, evidence, keys), 'monitoring'));
});
test('missing provenance and forbidden modules remain blocked; error is understandable', () => {
  const raw = annualGenerationExample(catalog, evidence, keys); delete raw.annual_checkup.sourceIds;
  assert.throws(() => validateAnnualRaw(raw, catalog, evidence, keys), /来源关联/);
  raw.monitoring = [{ items: 'unexpected' }]; assert.throws(() => validateAnnualRaw(raw, catalog, evidence, keys), /不允许/);
  assert.equal(annualGenerationError('annual_checkup缺少来源依据'), '年度体检缺少来源依据');
});
