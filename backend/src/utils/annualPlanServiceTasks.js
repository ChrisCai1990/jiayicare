const { sourceDate, FIELDS, assertAmendedRowUnchanged } = require('./annualScheduleAmendments');
const MODULES = [
  ['medical_treatment', 'visit_time', '医疗问题解决'], ['specialist_collab', 'plan_time', '全专联合会诊'],
  ['checkup_completion', 'time', '体检完善'], ['abnormal_followup', 'time', '定期复查'],
  ['vaccine', 'time', '疫苗接种'], ['functional_medicine', 'time', '功能医学检测'],
  ['medication', 'time', '药物管理'], ['supplement', 'time', '营养素管理'],
  ['nutrition_intervention', 'time', '营养干预'], ['personalized_followups', 'executionDate', '个性化管理'],
];
const validDate = value => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const labelOf = (record, fallback) => String(record.items || record.name || record.standardPlanName || record.purpose || fallback).trim();

function buildAnnualPlanServiceTasks(plan, patient = {}) {
  const moduleData = plan.moduleData || {};
  const rows = [];
  const add = (moduleKey, record, index, date, fallback) => {
    if (record.directNutritionAssessment === true) return;
    const mode = record.serviceMode || 'reminder';
    if (moduleKey === 'annual_checkup' && mode === 'reminder' && plan.checkupPreparationVersion === 2 && plan.checkupPreparationAutoConfirmedAt) return; // 体检准备已有同项目规划师督办，不重复派发。
    const supervisionOnly = plan.checkupPreparationVersion === 2 && ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'annual_checkup'].includes(moduleKey) && mode === 'reminder';
    if (!['single', 'managed'].includes(mode) && !supervisionOnly) return;
    const executionDate = validDate(date) || new Date(plan.confirmedAt || Date.now());
    const identityDate = validDate(sourceDate(plan, moduleKey, index, FIELDS[moduleKey], date)) || executionDate;
    const label = labelOf(record, fallback);
    const evidence = record.basisSummary || record.reason || record.matchReason || '';
    rows.push({
      key: `service-request:${moduleKey}:${index}:${identityDate.toISOString().slice(0, 10)}`,
      date: executionDate, assignedTo: (moduleKey === 'personalized_followups' && record.managementFollowUpVersion === 1 ? patient.assignedHealthManager : patient.assignedHealthPlanner) || null,
      stage: supervisionOnly ? 'service_supervision' : 'service_request', taskRole: 'supervisor', theme: `${supervisionOnly ? '服务进度督办' : '服务需求待安排'} · ${label}`,
      content: [
        `服务模式：${supervisionOnly ? '预约与检查进度督办' : mode === 'managed' ? '全托管' : '单项服务'}`, record.serviceType && `服务类型：${record.serviceType}`,
        mode === 'managed' && record.managedServiceType && `一站式类型：${record.managedServiceType === 'checkup' ? '体检一站式' : '门诊一站式'}`,
        `管理事项：${label}`, evidence && `设置依据：${evidence}`,
        record.goal && `管理目标：${record.goal}`, record.completionStandard && `完成标准：${record.completionStandard}`,
        record.customerAction && `客户行动：${record.customerAction}`,
        record.precautions && `注意事项：${record.precautions}`,
        moduleKey === 'personalized_followups' && record.managementFollowUpVersion === 1 ? '处理要求：健管专员跟进并安排所选服务；营养评估通过营养服务流程确认营养师及评估日期，再关联实际服务。' : '处理要求：健康规划师督办进度、协调资源及处理异常；预约和随访由健管专员办理，代办、代诊、陪诊按需转交就医协助团队。',
      ].filter(Boolean).join('\n'),
      formData: { serviceRequest: { moduleKey, recordIndex: index, mode, serviceType: record.serviceType || '', itemSnapshot: record } },
    });
  };
  MODULES.forEach(([key, dateField, fallback]) => { if (moduleData[key]?.enabled !== false) (moduleData[key]?.records || []).forEach((record, index) => add(key, record, index, record[dateField], fallback)); });
  [['annual_checkup', 'date', '年度体检'], ['lifestyle', 'date', '生活方式干预'], ['quarterly_eval', 'date', '季度评估']].forEach(([key, dateField, fallback]) => {
    const record = moduleData[key]; if (record?.enabled !== false && record) add(key, record, 0, record[dateField], fallback);
  });
  return rows;
}

async function syncAnnualPlanServiceTasks(plan) {
  if (!plan.confirmedAt) return { created: 0, updated: 0, warnings: ['客户尚未确认方案'] };
  const gate = await require('./annualServicePeriod').annualExecutionGate(plan);
  if (!gate.allowed) return { created: 0, updated: 0, warnings: [gate.reason] };
  if (plan.continuitySource?.previousPlanId) plan = { ...(gate.executionPlan || (plan.toObject ? plan.toObject() : plan)), confirmedAt: gate.anchor };
  const FollowUp = require('../models/FollowUp');
  const User = require('../models/User');
  const patient = await User.findById(plan.patientId).select('assignedHealthPlanner assignedHealthManager').lean();
  const rows = buildAnnualPlanServiceTasks(plan, patient || {});
  const assignableRows = rows.filter(row => row.assignedTo);
  let created = 0; let updated = 0;
  for (const row of assignableRows) {
    const existing = await FollowUp.findOne({ sourceAnnualPlanId: plan._id, sourceType: 'annual_service', sourceScheduleKey: row.key });
    if (existing) assertAmendedRowUnchanged(plan, row.key, existing.date, row.date);
    if (['completed', 'cancelled'].includes(existing?.status) || existing?.serviceTracking?.linkId || existing?.annualDispatch || existing?.careFlowId) continue;
    const payload = { patientId: plan.patientId, staffId: plan.createdBy, assignedTo: row.assignedTo, date: row.date, remindAt: row.date,
      theme: row.theme, content: row.content, plannedContent: row.content, formData: row.formData,
      coordinationGroupId: `annual-plan:${plan._id}`, workflowKey: row.stage, taskRole: row.taskRole,
      status: existing?.status || 'planned', aiStatus: 'approved', reviewRole: null, isBlocked: false, activationEvent: '',
      deliveryMode: row.formData.serviceRequest.mode, deliveryType: row.formData.serviceRequest.serviceType };
    if (plan.continuitySource?.previousPlanId) {
      const filter = { sourceAnnualPlanId: plan._id, sourceType: 'annual_service', sourceScheduleKey: row.key };
      const { status, ...openFields } = payload;
      const changed = await FollowUp.updateOne({ ...filter, careFlowId: null, annualDispatch: null, status: { $in: ['planned', 'in_progress', 'missed'] }, 'serviceTracking.linkId': null }, { $set: openFields });
      updated += changed.modifiedCount || 0;
      const inserted = await require('./annualDispatchOnce').insertAnnualOnce(FollowUp, plan, 'annual_service', row.key, filter, { ...payload, ...filter });
      created += inserted.upsertedCount || 0;
    } else if (existing) {
      const changed = await FollowUp.updateOne({ _id: existing._id, updatedAt: existing.updatedAt, careFlowId: null, annualDispatch: null, 'serviceTracking.linkId': null, status: { $in: ['planned', 'in_progress', 'missed'] } }, { $set: payload });
      updated += changed.modifiedCount || 0;
    }
    else { await FollowUp.create({ ...payload, sourceAnnualPlanId: plan._id, sourceType: 'annual_service', sourceScheduleKey: row.key }); created++; }
  }
  const desired = (plan.continuitySource?.previousPlanId ? rows : assignableRows).map(row => row.key);
  await FollowUp.updateMany({ sourceAnnualPlanId: plan._id, sourceType: 'annual_service', workflowKey: { $in: ['service_request', 'service_supervision'] }, annualDispatch: null, careFlowId: null, sourceScheduleKey: { $nin: desired }, status: { $in: ['planned', 'in_progress'] }, ...(plan.continuitySource?.previousPlanId ? { 'serviceTracking.linkId': null } : {}) }, { $set: { status: 'cancelled', cancelReason: '年度方案已调整或改为仅提醒' } });
  return { created, updated, warnings: rows.filter(row=>!row.assignedTo).map(row => `${row.theme}尚未绑定对应负责人`) };
}

module.exports = { buildAnnualPlanServiceTasks, syncAnnualPlanServiceTasks };
