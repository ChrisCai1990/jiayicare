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

test('普通胸部 CT 也算肺癌筛查覆盖，碳13阴性当年不重复安排 HP', () => {
  const reports = [
    { checkDate: '2026-10-23', title: '胸部CT平扫', reportItems: [{ name: '胸部CT平扫' }] },
    { checkDate: '2026-10-23', title: '碳13/14呼气试验', reportItems: [{ name: '碳-13呼气', value: '阴性', status: 'normal' }] },
  ];
  const result = assessCancerCoverage({ gender: '男', age: 60 }, reports, 2026);
  assert.equal(result.find(item => item.key === 'lung').status, 'ok');
  const stomach = result.find(item => item.key === 'stomach');
  assert.ok(!stomach.missingItems.some(item => /幽门螺杆菌/.test(item)));
  assert.match(stomach.notes.join(' '), /HP阴性/);
});
