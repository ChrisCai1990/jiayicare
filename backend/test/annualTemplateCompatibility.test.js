const test = require('node:test');
const assert = require('node:assert/strict');
const { annualPlanSourceMatches } = require('../src/utils/annualPlanSourceMatches');
const young = { _id: 't', content: { servicePlanCode: 'jys_young', strategyType: 'young_state' } };
test('legacy AI request uses exact selected template code without changing original content', async () => {
  const { annualTemplateCode, matchingAnnualTemplate } = await import('../../staff/src/utils/annualTemplateSelection.mjs');
  assert.equal(annualTemplateCode('young_state', young), 'jys_young');
  assert.equal(annualTemplateCode('jys_young', young), 'jys_young');
  assert.throws(() => annualTemplateCode('chronic_stable', young));
  assert.throws(() => annualTemplateCode('jygj_light', young));
  assert.equal(matchingAnnualTemplate('young_state', [young]), young);
  assert.equal(matchingAnnualTemplate('young_state', [young, { content: { servicePlanCode: 'jygj_light', strategyType: 'young_state' } }]), null);
});
test('source identity requires matching version/strategy/template and keeps existing confirmed record', () => {
  const source = { planType: 'young_state', confirmedAt: '2026-07-09' };
  assert.equal(annualPlanSourceMatches(source, young, 'jys_young', 'young_state'), true);
  assert.equal(source.confirmedAt, '2026-07-09');
  for (const row of [null, { planType: 'chronic_stable' }, { planType: 'young_state', templateId: 'different' }, { servicePlanCode: 'jygj_light' }]) assert.equal(annualPlanSourceMatches(row, young, 'jys_young', 'young_state'), false);
});
test('save checks source customer/year and frozen state before upsert; AI mismatch guard retained', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const route = source.slice(source.indexOf("router.put('/patients/:id/annual-plan',"), source.indexOf('// ── PATCH /api/staff/patients/:id/annual-plan/push'));
  assert.ok(route.includes('_id: req.body.sourcePlanId, patientId: req.params.id, year: targetYear'));
  assert.ok(route.indexOf('if (frozen?.confirmedAt') < route.indexOf('const plan = await AnnualPlan.findOneAndUpdate'));
  assert.ok(source.includes('normalizedTemplate.content.servicePlanCode !== planType'));
});
