// 只计算准备窗口及岗位任务候选，不派单、不调用AI、不启动体检服务。
// 工作台处理入口和准备条件汇合接好前，不接入确认/每日扫描。
const { dayOf, chinaDay } = require('./serviceAccess');
const { sourceDate } = require('./annualScheduleAmendments');

const LEAD_DAYS = 14;
const ROLES = [
  { role: 'familyDoctor', field: 'assignedFamilyDoctor', label: '健康顾问',
    theme: '年度体检准备 · 定制体检方案', taskRole: 'executor',
    content: '结合本年度档案、已审核专业评估和管理进展，准备并审核体检方案；复用已有有效方案，不重复生成。方案准备不等于预约完成。' },
  { role: 'healthPlanner', field: 'assignedHealthPlanner', label: '健康规划师',
    theme: '年度体检准备 · 确认时间与资源', taskRole: 'supervisor',
    content: '与客户沟通可行时间及体检机构资源，记录实际安排；与顾问方案准备并行。条件齐备后衔接已有体检服务，不自动下单或重复预约。' },
];
const shiftDay = (day, offset) => new Date(new Date(`${day}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
const strictDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayOf(value) === value ? value : '';
const idOf = value => String(value?._id || value || '');
const issue = (code, message, role = 'familyDoctor') => ({ code, message, role });

function buildAnnualCheckupPreparation(plan, patient, gate, now = new Date()) {
  const today = chinaDay(now);
  const result = { state: 'inactive', targetDate: '', preparationDate: '', latePreparation: false, tasks: [], issues: [] };
  if (!plan?._id || !patient?._id || idOf(plan.patientId) !== idOf(patient._id)) {
    return { ...result, state: 'blocked', issues: [issue('source_mismatch', '年度方案与客户不匹配')] };
  }
  if (!plan.confirmedAt || !plan.pushedAt || plan.reviewStatus !== 'approved') return result;
  // 必须接收 annualPeriodicGate 的完整结果，不允许用可编辑的档案日期自行放行。
  if (!gate?.allowed || !gate.access?.active) {
    return { ...result, issues: [issue('service_inactive', gate?.reason || '当前年度服务期未生效', 'healthPlanner')] };
  }
  const effectivePlan = gate.executionPlan || plan;
  if (idOf(effectivePlan._id) !== idOf(plan._id) || idOf(effectivePlan.patientId) !== idOf(patient._id)) {
    return { ...result, state: 'blocked', issues: [issue('source_mismatch', '有效排期与年度方案不匹配')] };
  }
  const record = effectivePlan.moduleData?.annual_checkup;
  if (!record || record.enabled === false) return result;
  const targetDate = strictDay(record.date);
  const originalDate = strictDay(sourceDate(effectivePlan, 'annual_checkup', 0, 'date', record.date));
  if (!targetDate || !originalDate) {
    return { ...result, state: 'blocked', issues: [issue('invalid_date', '请健康顾问完善有效的年度体检日期')] };
  }
  result.targetDate = targetDate;
  const window = gate.period || gate.access;
  const startDate = strictDay(window.startDate);
  const endDate = strictDay(window.endDate);
  if ((window.startDate && !startDate) || (window.endDate && !endDate)
    || (startDate && endDate && startDate > endDate)) {
    return { ...result, state: 'blocked', issues: [issue('invalid_period', '服务期日期无效，请核对服务凭据', 'healthPlanner')] };
  }
  if ((startDate && targetDate < startDate) || (endDate && targetDate > endDate)) {
    return { ...result, state: 'blocked', issues: [issue('outside_period', '体检日期超出当前年度服务期，请顾问核对')] };
  }
  const confirmationDate = dayOf(plan.confirmedAt);
  const anchorDate = dayOf(gate.anchor);
  if (!confirmationDate || !anchorDate || confirmationDate > today || anchorDate > today
    || (startDate && today < startDate) || (endDate && today > endDate)) {
    return { ...result, state: 'blocked', issues: [issue('invalid_anchor', '方案执行起点或当前服务期不满足准备条件')] };
  }
  const preparationDate = [shiftDay(targetDate, -LEAD_DAYS), confirmationDate, anchorDate, startDate].filter(Boolean).sort().at(-1);
  result.preparationDate = preparationDate;
  result.latePreparation = preparationDate > shiftDay(targetDate, -LEAD_DAYS);
  // 历史过期体检不补发新执行任务；交由顾问确认是否已做/需调整，不能当作新预约。
  if (targetDate < today) {
    return { ...result, state: 'overdue', issues: [issue('checkup_overdue', '年度体检日期已过，请核对完成情况或另行安排')] };
  }
  if (preparationDate > today) return { ...result, state: 'waiting' };
  result.state = 'due';
  for (const spec of ROLES) {
    const assignedTo = idOf(patient[spec.field]);
    if (!assignedTo) {
      result.issues.push(issue('missing_assignment', `客户尚未绑定${spec.label}，无法派发体检准备事项`, spec.role));
      continue;
    }
    const key = `annual_checkup:${originalDate}:prepare:${spec.role}`;
    result.tasks.push({
      patientId: patient._id, sourceAnnualPlanId: plan._id, sourceType: 'annual_service', sourceScheduleKey: key,
      assignedTo, staffId: plan.createdBy || assignedTo,
      date: new Date(`${preparationDate}T09:00:00+08:00`), remindAt: new Date(`${preparationDate}T09:00:00+08:00`),
      theme: spec.theme, content: spec.content, plannedContent: spec.content,
      status: 'planned', aiStatus: 'approved', reviewRole: null,
      taskRole: spec.taskRole, workflowKey: `annual_checkup_preparation:${spec.role}`,
      // 两个岗位并行，不互相阻塞；管理端同时可见时也不能折叠掉其中一个。
      coordinationGroupId: `annual-checkup:${plan._id}:${originalDate}:${spec.role}`, isBlocked: false,
      formData: { annualCheckupPreparation: { version: 1, role: spec.role, targetDate, preparationDate, latePreparation: result.latePreparation } },
    });
  }
  return result;
}

module.exports = { LEAD_DAYS, buildAnnualCheckupPreparation };
