const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/pages/PlanModulesPage.jsx'), 'utf8');

test('checkup plans have a yearly service workspace without changing other plan types', () => {
  assert.match(source, /function CheckupServiceWorkspace/);
  assert.match(source, /\{isCheckupService && <CheckupServiceWorkspace/);
  assert.match(source, /年度体检服务档案/);
  assert.match(source, /体检一站式服务.*单独体检服务/);
});

test('workspace separates archive facts from order-specific questionnaire needs', () => {
  assert.match(source, /本次体检需求/);
  assert.match(source, /不直接覆盖长期健康档案/);
  assert.match(source, /健康档案用于预填；本次需求单独保存；差异只提示/);
  assert.match(source, /健康顾问方案工作区/);
});

test('workspace presents the staged checkup handoff', () => {
  for (const label of ['体检定制问卷', '定制体检方案', '预约与行前确认', '现场陪同', '报告回收与审核']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /客户提交后进入健康顾问24小时定制环节/);
});

test('plan detail returns to the actual entry page with a safe direct-link fallback', () => {
  assert.match(source, /location\.state\?\.returnTo/);
  assert.match(source, /location\.key && location\.key !== 'default'/);
  assert.match(source, /nav\(-1\)/);
  assert.match(source, /返回上一页/);
});
