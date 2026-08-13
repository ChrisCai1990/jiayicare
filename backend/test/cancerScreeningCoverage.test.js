const test = require('node:test');
const assert = require('node:assert/strict');

const { assessCancerCoverage } = require('../src/utils/cancerScreeningCoverage');

function endometrialCoverage(itemName) {
  const reports = [{
    _id: 'report-1',
    checkDate: '2026-06-18',
    title: '年度健康体检',
    reportItems: [{ name: itemName, itemType: 'imaging', findings: '子宫及双侧附件检查' }],
  }];
  return assessCancerCoverage({ gender: '女', age: 45 }, reports)
    .find(item => item.key === 'endometrial');
}

test('子宫附件超声按业务口径覆盖子宫体癌基础影像', () => {
  const result = endometrialCoverage('子宫附件超声');
  assert.equal(result.label, '子宫体癌');
  assert.equal(result.status, 'ok');
  assert.match(result.doneItems[0], /子宫附件\/经阴道超声/);
});

test('机构名称“子宫、附件彩超”也能匹配', () => {
  assert.equal(endometrialCoverage('子宫、附件彩超').status, 'ok');
});

test('机构仅写“子宫附件”也能匹配', () => {
  assert.equal(endometrialCoverage('子宫附件').status, 'ok');
});
