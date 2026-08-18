const test = require('node:test');
const assert = require('node:assert/strict');
const { mapWithConcurrency } = require('../src/utils/asyncPool');

test('mapWithConcurrency preserves input order and respects the concurrency limit', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapWithConcurrency([30, 5, 20, 10], 2, async value => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, value));
    active -= 1;
    return value / 5;
  });

  assert.deepEqual(result, [6, 1, 4, 2]);
  assert.equal(peak, 2);
});

test('mapWithConcurrency handles empty work and clamps invalid limits', async () => {
  assert.deepEqual(await mapWithConcurrency([], 2, async value => value), []);
  assert.deepEqual(await mapWithConcurrency([1, 2], 0, async value => value * 2), [2, 4]);
});
