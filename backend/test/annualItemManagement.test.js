const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnnualItems } = require('../src/utils/annualItemManagement');
test('annual one-off management uses assigned manager, preserves dates/evidence, clears irrelevant delivery', () => {
  const row = { visit_time: '2026-10-10', standardPlanId: 'source', followUpStaff: 'wrong', coordinator: 'wrong', frequency: '每月', serviceMode: 'reminder', serviceType: 'escort_visit' };
  const input = { medical_treatment: { records: [row] }, medication: { records: [{ frequency: '每日' }] } };
  const result = normalizeAnnualItems(input, 'manager');
  assert.deepEqual(result.medical_treatment.records[0], { ...row, frequency: '单次', followUpStaff: 'manager', coordinator: '', ownerRole: '健管专员', serviceType: '', managedServiceType: '' });
  assert.equal(input.medical_treatment.records[0].followUpStaff, 'wrong');
  assert.equal(result.medication, input.medication);
  assert.throws(() => normalizeAnnualItems(input, null), /分配健管专员/);
});
test('managed selection is explicit, preserved in service-request snapshot without using single-service enum', () => {
  for (const kind of ['outpatient', 'checkup']) {
    const result = normalizeAnnualItems({ checkup_completion: { records: [{ serviceMode: 'managed', managedServiceType: kind, serviceType: 'escort_visit' }] } }, 'manager');
    const row = result.checkup_completion.records[0];
    assert.equal(row.managedServiceType, kind); assert.equal(row.serviceType, '');
  }
  assert.throws(() => normalizeAnnualItems({ medical_treatment: { records: [{ serviceMode: 'managed' }] } }, 'manager'), /一站式/);
});
test('only three annual modules hide template/person/frequency controls; service fields are separate', async () => {
  const { annualItemLayout } = await import('../../staff/src/utils/annualItemLayout.mjs');
  const def = { fields: ['reason', 'standardPlanName', 'coordinator', 'followUpStaff', 'frequency', 'ownerRole', 'serviceMode', 'serviceType'].map(key => ({ key })) };
  const result = annualItemLayout('medical_treatment', def, '测试健管');
  assert.deepEqual(result.fields.map(f => f.key), ['reason']);
  assert.deepEqual(result.serviceFields.map(f => f.key), ['serviceMode', 'serviceType']);
  assert.equal(result.managerName, '测试健管');
  assert.equal(annualItemLayout('medication', def, 'm'), def);
});
