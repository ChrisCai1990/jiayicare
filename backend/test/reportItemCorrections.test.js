const test = require('node:test');
const assert = require('node:assert/strict');
const { diffReportItemCorrections } = require('../src/utils/reportItemCorrections');

test('unchanged items do not create correction noise', () => {
  const item = { sourceItemId: 'a', name: 'Chest CT', sourcePages: [21], sourceEvidence: [{ page: 21, text: 'A' }] };
  assert.deepEqual(diffReportItemCorrections([item], [{ ...item }]), []);
});

test('items are compared by stable source id after reordering', () => {
  const oldItems = [
    { sourceItemId: 'a', name: 'A', value: '1', sourcePages: [1] },
    { sourceItemId: 'b', name: 'B', value: '2', sourcePages: [2] },
  ];
  const changes = diffReportItemCorrections(oldItems, [oldItems[1], { ...oldItems[0], value: '3' }]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].sourceItemId, 'a');
  assert.equal(changes[0].field, 'value');
  assert.equal(changes[0].oldValue, '1');
  assert.equal(changes[0].newValue, '3');
});

test('cross-page evidence changes and item removal remain traceable', () => {
  const oldItems = [
    { sourceItemId: 'a', name: 'Chest CT', sourcePages: [21, 22], sourceEvidence: [{ page: 21 }, { page: 22 }] },
    { sourceItemId: 'b', name: 'Bone density', sourcePages: [22] },
  ];
  const changes = diffReportItemCorrections(oldItems, [{
    ...oldItems[0], sourcePages: [21], sourceEvidence: [{ page: 21 }],
  }]);
  assert.deepEqual(changes.map(change => change.field), ['sourcePages', 'sourceEvidence', '__item_removed__']);
  assert.equal(changes[2].sourceItemId, 'b');
});
