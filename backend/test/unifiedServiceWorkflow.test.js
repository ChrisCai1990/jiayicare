const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('产品流程模块支持固定、条件触发和人工可选三种模式', () => {
  const model = read('src/models/Product.js');
  assert.match(model, /enum: \['fixed', 'conditional', 'manual'\]/);
  assert.match(model, /'abnormal_found'/);
  assert.match(model, /'followup_instruction_found'/);
});

test('就医方案只立即生成固定模块并保留待判断模块', () => {
  const route = read('src/routes/staff.js');
  assert.match(route, /const fixedWorkflowPlans = workflowPlans/);
  assert.match(route, /\.filter\(item => item\.mode !== 'fixed'\)/);
  assert.match(route, /decision: item\.mode === 'manual' \? 'manual' : 'pending'/);
  assert.match(route, /for \(const workflowPlan of fixedWorkflowPlans\)/);
});

test('健康顾问不再收到逐报告或档案更新审核待办', () => {
  const route = read('src/routes/staff.js');
  const panel = read('../staff/src/components/AiTodosPanel.jsx');
  assert.doesNotMatch(route, /if \(can\('report_familydoctor_review'\)\)/);
  assert.doesNotMatch(panel, /report_familydoctor_review/);
});
