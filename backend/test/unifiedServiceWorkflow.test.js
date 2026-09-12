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

test('就医方案合并固定模块为唯一执行督办组并保留待判断模块', () => {
  const route = read('src/routes/staff.js');
  assert.match(route, /const fixedWorkflowPlans = workflowPlans/);
  assert.match(route, /\.filter\(item => !isOutpatientOneStop && item\.mode !== 'fixed'\)/);
  assert.match(route, /decision: item\.mode === 'manual' \? 'manual' : 'pending'/);
  assert.match(route, /const primaryWorkflowPlan = fixedWorkflowPlans\.find/);
  assert.match(route, /同一服务方案仅保留一组执行与督办任务/);
  assert.match(route, /workflowPlansToCreate = isMultiStageService \? fixedWorkflowPlans : \[primaryWorkflowPlan\]/);
});

test('健康顾问不再收到逐报告或档案更新审核待办', () => {
  const route = read('src/routes/staff.js');
  const panel = read('../staff/src/components/AiTodosPanel.jsx');
  assert.doesNotMatch(route, /if \(can\('report_familydoctor_review'\)\)/);
  assert.doesNotMatch(panel, /report_familydoctor_review/);
});

test('未审核随访方案不能进入任务生成或医护选择列表', () => {
  const model = read('src/models/FollowUpPlan.js');
  const route = read('src/routes/staff.js');
  assert.match(model, /reviewStatus:\s+\{ type: String, enum: \['pending_review', 'approved'\]/);
  assert.ok((route.match(/reviewStatus: \{ \$ne: 'pending_review' \}/g) || []).length >= 3);
});

test('报告来源独立于现有临床分类保存', () => {
  const model = read('src/models/MedicalReport.js');
  assert.match(model, /sourceType: \{ type: String/);
  assert.match(model, /sourceHealthPlanId:/);
  assert.match(model, /sourceServiceRecordId:/);
});
