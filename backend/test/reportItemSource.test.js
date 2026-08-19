const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureReportItemSourceIds } = require('../src/utils/reportItemSource');

test('new manual items never reuse an existing deterministic source id', () => {
  const baseItem = { sourcePage: 22, sourceSection: 'CT', orderName: '', itemType: 'imaging' };
  const [existing] = ensureReportItemSourceIds([baseItem]);
  const result = ensureReportItemSourceIds([existing, { ...baseItem }]);
  assert.equal(result[0].sourceItemId, existing.sourceItemId);
  assert.notEqual(result[1].sourceItemId, existing.sourceItemId);
});
