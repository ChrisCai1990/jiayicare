const test = require('node:test');
const assert = require('node:assert/strict');
const { sameStandardCheckupItems } = require('../src/utils/checkupTemplateItems');

const meta = type => ({
  lab: { category: '检验检查', itemType: 'labTest' },
  exam: { category: '影像检查', itemType: 'specialExam' },
})[type];
const standard = [
  { id: 'exam-1', name: '头颅MRI平扫', type: 'exam' },
  { id: 'lab-1', name: '血常规', type: 'lab' },
  { id: 'lab-1', name: '血常规', type: 'lab' },
];
const requested = standard.map(item => ({
  name: item.name, itemId: item.id, ...meta(item.type), itemGroup: 'base',
}));

test('standard checkup items may be grouped by type before save', () => {
  assert.equal(sameStandardCheckupItems([requested[1], requested[2], requested[0]], standard, meta), true);
});

test('standard checkup item changes and duplicate omissions remain conflicts', () => {
  assert.equal(sameStandardCheckupItems([requested[0], requested[1]], standard, meta), false);
  assert.equal(sameStandardCheckupItems([requested[0], requested[1], requested[0]], standard, meta), false);
  assert.equal(sameStandardCheckupItems([requested[0], { ...requested[1], itemId: 'other' }, requested[2]], standard, meta), false);
  assert.equal(sameStandardCheckupItems([requested[0], { ...requested[1], category: '影像检查' }, requested[2]], standard, meta), false);
});
