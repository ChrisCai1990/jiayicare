const test = require('node:test'), assert = require('node:assert/strict');
const { repairAnnualFocus } = require('../src/utils/annualFocusRepair');
test('one bounded repair changes only focus, preserving source, date and other modules', async () => {
  const raw = { annual_checkup: { focus: '', standardPlanId: 'x', basisSummary: 'source', sourceIds: ['s'], date: '2027-01-01' }, medical_treatment: [{ reason: 'unchanged' }] };
  let calls = 0;
  const result = await repairAnnualFocus(raw, async () => { calls++; return JSON.stringify({ focus: '来源明确的关注项', date: 'wrong', sourceIds: ['wrong'] }); });
  assert.equal(calls, 1); assert.equal(result.annual_checkup.date, '2027-01-01');
  assert.deepEqual(result.annual_checkup.sourceIds, ['s']); assert.equal(result.medical_treatment, raw.medical_treatment);
  assert.equal(raw.annual_checkup.focus, '');
});
test('empty/valid/unsourced annual item is not regenerated; malformed repair remains rejected', async () => {
  for (const row of [{}, { focus: '已有内容' }, { focus: '' }]) {
    const raw = { annual_checkup: row }; assert.equal(await repairAnnualFocus(raw, () => assert.fail('unexpected retry')), raw);
  }
  const raw = { annual_checkup: { focus: '', standardPlanId: 'x', basisSummary: 'source', sourceIds: ['s'] } };
  for (const reply of ['bad', '{"focus":""}', '{"focus":{}}']) assert.equal(await repairAnnualFocus(raw, async () => reply), raw);
});
