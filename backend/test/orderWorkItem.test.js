const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { activeOrderWorkItemQuery, restoreOrderAfterRefundFailure } = require('../src/utils/orderWorkItem');

test('工作台订单查询从底层排除退款和终态订单', () => {
  const query = activeOrderWorkItemQuery();
  assert.deepEqual(query.$or, [
    { paymentStatus: 'paid' },
    { initiationSource: 'staff_direct', paymentStatus: 'unpaid', servicePrice: 0 },
  ]);
  assert.deepEqual(query.tradeStatus.$in, ['paid', 'fulfilling', 'partially_refunded']);
  assert.equal(query.tradeStatus.$in.includes('refund_pending'), false);
  assert.equal(query.tradeStatus.$in.includes('refunded'), false);
  assert.deepEqual(query.status.$in, ['pending', 'scheduled']);
});

test('退款提交失败后恢复订单到可继续服务状态', () => {
  const awaiting = restoreOrderAfterRefundFailure({ refundStatus: 'processing', tradeStatus: 'refund_pending', serviceStartedAt: null });
  assert.equal(awaiting.refundStatus, 'failed');
  assert.equal(awaiting.tradeStatus, 'paid');
  const started = restoreOrderAfterRefundFailure({ refundStatus: 'processing', tradeStatus: 'refund_pending', serviceStartedAt: new Date() });
  assert.equal(started.tradeStatus, 'fulfilling');
});

test('有效已支付订单缺少工作项时会补建且不重开历史完成项', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/orderWorkItem.js'), 'utf8');
  assert.match(source, /existingIds = await FollowUp\.find/);
  assert.match(source, /if \(existingSet\.has\(String\(order\._id\)\)\) continue/);
  assert.match(source, /sourceType: 'order'/);
  assert.match(source, /sourceOrderId: order\._id/);
});

test('订单结束不取消就诊后AI随访计划，并修复已被误取消的计划', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/orderWorkItem.js'), 'utf8');
  assert.match(source, /sourceScheduleKey: \{ \$not: \/\^\(medical_escort_followup\|expert_appointment_followup\):\//);
  assert.match(source, /postVisitRepairFilter/);
  assert.match(source, /aiStatus: 'pending'/);
  assert.match(source, /status: 'cancelled'/);
  assert.match(source, /status: 'planned', cancelReason: ''/);
});

test('退款成功会关闭订单产生的所有未完成待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/orderSettlement.js'), 'utf8');
  assert.match(source, /FollowUp\.updateMany\([\s\S]*sourceType: 'order'[\s\S]*cancelReason: '订单已退款'/);
});

test('医护工作台按有效订单ID约束订单待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  assert.match(source, /sourceType === 'order'[\s\S]*activeOrderWorkItemQuery\(\)[\s\S]*filter\.sourceOrderId = \{ \$in: activeOrderIds \}/);
  assert.match(source, /router\.patch\('\/orders\/:id\/start'[\s\S]*activeOrderWorkItemQuery\(\)/);
  assert.match(source, /desiredServiceDate serviceRequirements/);
});

test('会员详情读取前会按订单事实状态校正历史待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf("router.get('/patients/:id/followups'");
  const end = source.indexOf("router.get('/followups'", start);
  assert.match(source.slice(start, end), /reconcileInactiveOrderWorkItems\(req\.params\.id\)/);
});

test('取消或退款的一次性综合服务会删除内部岗位任务', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/orderWorkItem.js'), 'utf8');
  assert.match(source, /cancelledOrderIds = await Order\.find/);
  assert.match(source, /FollowUp\.deleteMany\(\{[\s\S]*workflowKey: \/\^\(medical_proxy\|medication_proxy\|checkup_appointment\):\//);
});

test('年度就医与复查提醒保留注意事项并补齐完整执行信息', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/annualPlanFollowUps.js'), 'utf8');
  assert.match(source, /rec\.basisSummary && `设置依据：/);
  assert.match(source, /rec\.customerAction && `客户行动：/);
  assert.match(source, /rec\.precautions \|\| rec\.notes/);
  assert.doesNotMatch(source, /空腹\|暂无\|无/);
  assert.match(source, /keep\.content = row\.content/);
});

test('任务列表合并主题、计划要求和注意事项，不让空腹遮住计划主体', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  assert.match(source, /new Set\(\[f\.theme, f\.taskRequirements, f\.plannedContent, f\.content\]/);
});

test('旧版人工任务从结构化表单恢复完整执行内容', () => {
  const { formatLegacyFollowUpFormData, followUpTaskRequirements } = require('../src/utils/medicalAssistRequirements');
  const formData = {
    '就医时间': '2026-10-14', '就医医院': '瑞安市人民医院', '就医科室': '临床心理科',
    '本次就医重点': '评估当前用药有效性及不良反应', currentStage: 'internal', planSnapshot: { hidden: true },
  };
  const content = formatLegacyFollowUpFormData(formData);
  assert.match(content, /就医时间：2026-10-14/);
  assert.match(content, /本次就医重点：评估当前用药有效性及不良反应/);
  assert.doesNotMatch(content, /currentStage|planSnapshot/);
  assert.equal(followUpTaskRequirements({ content: '', plannedContent: '', formData }), content);
});

test('体检复查和疫苗关键词优先于普通健康监测指标', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  const checkupIndex = source.indexOf("if (/体检|复查|检验|检查|筛查|疫苗/.test(text)) return 'checkup'");
  const monitoringIndex = source.indexOf("if (/血压|血糖|体重|睡眠|运动|饮水|监测|打卡/.test(text)) return 'monitoring'");
  assert.ok(checkupIndex >= 0 && monitoringIndex > checkupIndex);
});

test('后台取消订单同步取消关联待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');
  const start = source.indexOf("router.patch('/orders/:id/status'");
  const end = source.indexOf("router.patch('/orders/:id/pay'", start);
  const route = source.slice(start, end);
  assert.match(route, /FollowUp\.updateMany/);
  assert.match(route, /sourceType: 'order'/);
  assert.match(route, /cancelReason: '订单已取消'/);
});

test('启动扫描会清理年度方案重复排期并校正失效订单待办', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/scheduledFollowUpWindowScheduler.js'), 'utf8');
  assert.match(source, /dedupeAnnualPlanFollowUps\(\)/);
  assert.match(source, /reconcileInactiveOrderWorkItems\(\)/);
  assert.match(source, /reconcileMedicalAssistDocumentCollectionTasks\(\)/);
});

test('年度方案重复项优先按同方案稳定排期键识别', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/annualPlanFollowUps.js'), 'utf8');
  assert.match(source, /item\.sourceScheduleKey === row\.sourceScheduleKey/);
  assert.match(source, /`\$\{row\.patientId\}\|\$\{row\.sourceAnnualPlanId\}\|\$\{row\.sourceScheduleKey\}`/);
});
