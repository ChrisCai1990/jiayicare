const test = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../scripts/migratePhaseAssessmentPeriodIndex');

test('monthly index migration creates both replacements before dropping legacy unique index', async () => {
  const names = new Set(['_id_', 'annualPlanId_1_templateId_1_periodKey_1']);
  const operations = [];
  const collection = {
    aggregate: () => ({ toArray: async () => [] }),
    indexes: async () => [...names].map(name => ({ name })),
    createIndex: async (key, options) => { operations.push(['create', options.name]); names.add(options.name); return options.name; },
    dropIndex: async name => { operations.push(['drop', name]); names.delete(name); },
  };
  assert.equal((await migrate(collection)).applied, false);
  assert.deepEqual(operations, []);
  assert.equal((await migrate(collection, true)).applied, true);
  assert.deepEqual(operations, [
    ['create', 'monthly_patient_period_unique'],
    ['create', 'annual_plan_template_period_unique_v2'],
    ['drop', 'annualPlanId_1_templateId_1_periodKey_1'],
  ]);
});

test('historical duplicate planless month stops index migration without a write', async () => {
  let writes = 0;
  const collection = { aggregate: () => ({ toArray: async () => [{ count: 2 }] }), indexes: async () => [], createIndex: async () => { writes++; } };
  await assert.rejects(migrate(collection, true), /重复评估/);
  assert.equal(writes, 0);
});
