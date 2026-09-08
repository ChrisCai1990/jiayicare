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
  for (const label of ['年度体检', '需求问卷', '体检方案', '预约准备', '现场陪同', '报告管理', '当前待处理', '本次资料', '历次体检']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /旧资料始终保留/);
  assert.match(source, /serviceManagementView !== 'checkup'/);
  assert.match(source, /const historicalPlans = checkupPlans\.slice\(1\)/);
  assert.match(source, /查看本次方案与执行/);
  assert.match(source, /serviceView=checkup/);
});
