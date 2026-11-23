const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/utils/loadRecordTrends.js'), 'utf8')
  .replace('export async function loadRecordTrends', 'async function loadRecordTrends');
const loadRecordTrends = vm.runInNewContext(`${source}\nloadRecordTrends`, { Promise });

test('archive trends retain order while limiting concurrent requests to two', async () => {
  let active = 0;
  let peak = 0;
  const results = await loadRecordTrends(['bp', 'bs', 'waist', 'sleep', 'heart', 'weight'], async type => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, type === 'bp' ? 15 : 2));
    active -= 1;
    if (type === 'sleep') throw new Error('temporary failure');
    return { type };
  });
  assert.equal(peak, 2);
  assert.deepEqual(Array.from(results, result => result.status), ['fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
  assert.deepEqual(Array.from(results.filter(result => result.status === 'fulfilled'), result => result.value.type), ['bp', 'bs', 'waist', 'heart', 'weight']);
});
