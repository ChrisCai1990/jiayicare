const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/pages/PatientDetailPage.jsx'), 'utf8');

test('service management exposes four persistent professional categories and an all-plans fallback', () => {
  for (const label of ['年度管理', '体检管理', '就医管理', '营养管理']) {
    assert.match(source, new RegExp(`label: '${label}'`));
  }
  assert.match(source, /全部方案 \{plans\.length\}/);
  assert.match(source, /未开通/);
});

test('category views filter the existing plans without replacing service records', () => {
  assert.match(source, /plans\.filter\(plan => getServiceManagementCategory\(plan\) === serviceManagementView\)/);
  assert.match(source, /具体方案仍按每次购买或每个年度独立执行/);
  assert.match(source, /既有服务档案不受影响/);
  assert.match(source, /tab === 'serviceRecords'/);
});

test('checkup-shaped medical assistance plans are grouped into checkup management', () => {
  assert.match(source, /plan\?\.type === 'annual_checkup' \|\| \/体检\//);
  assert.match(source, /plan\?\.type === 'medical_assist'.*'medical'/);
});

test('checkup management is a full service workspace rather than only a plan filter', () => {
  assert.match(source, /function CheckupManagementWorkspace/);
  for (const label of ['体检需求与健康档案联动', '引用长期健康档案', '保存本次体检需求', '核对档案变化', '预约与行前准备', '报告与后续管理']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /确认后新增带日期和来源的版本，旧资料继续保留/);
  assert.match(source, /仅保留在本次问卷／标记待核实／客户填写有误/);
});
