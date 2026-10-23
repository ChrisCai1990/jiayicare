const crypto = require('crypto');
const User = require('../models/User');
const Admin = require('../models/Admin');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const HealthPlan = require('../models/HealthPlan');
const CareFlow = require('../models/CareFlow');
const Insurance = require('../models/InsuranceServiceCase');
const Link = require('../models/FollowUpServiceLink');
const review = require('../../../shared/followUpReview.cjs');
const care = require('../../../shared/careFlow.cjs');
const shipping = require('../../../shared/orderShipping.cjs');
const { serviceProgress } = require('./serviceSupervisionProgress');
const { belongsInServiceProgress } = require('./serviceSupervisionEligibility');
const id = value => String(value?._id || value || '');
const active = row => ['planned', 'in_progress', 'missed'].includes(row.status);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stageLabels = { intake: '确认需求与安排', advisor: '顾问确认解析方案与转介', booking: '预约安排', specialist: '专科解析报告并回复转介', planner_final: '规划师最终验收', planner: '规划师协调派单', execute: '服务执行', medical: '就医办理', manager_review: '健管核实资料', advisor_review: '顾问审核', resolution: '处理服务结果', pending_closure: '规划师核对结案', awaiting_shipment: '待健管专员发货', shipped: '已发货', registered: '登记服务', verifying: '核对保障', materials: '收集材料', submitted: '已提交申请', reviewing: '审核中', supplement: '补充材料', paid: '核对赔付结果', partially_paid: '核对部分赔付', denied: '核对拒赔结果' };
const decisionLabels = { intake: '规划师确认客户需求', advisor: '顾问确定方案并转介', booking: '健管预约及客户沟通', specialist: '专科解析并回复', advisor_review: '顾问审核归档', planner_final: '规划师最终验收' };
const stamp = row => [id(row._id), row.updatedAt || row.createdAt || null, row.status, row.revision];
const samePatient = (row, patientId) => id(row?.patientId || row?.user) === id(patientId);
const target = (patientId, taskId, type) => `/patients/${patientId}?tab=${taskId ? 'followups' : type === 'plan' ? 'plans' : type === 'insurance' ? 'info' : type === 'order' ? 'consumption' : 'followups'}${taskId ? `&supervisionTaskId=${taskId}` : ''}`;

// All reads are scoped through current customer ownership. None of these reads
// invokes the repair/dispatch helpers used by the execution workbench.
async function loadServices(actor, { patientIds, includeOwn = false, now = new Date() } = {}) {
  const tenantId = actor.tenantId || null;
  const patients = await User.find({ tenantId, isDeleted: { $ne: true },
    ...(patientIds ? { _id: { $in: patientIds } } : { assignedFamilyDoctor: actor._id }),
  }).select('name tenantId assignedFamilyDoctor assignedHealthPlanner assignedHealthManager assignedNutritionist').lean();
  if (!patients.length) return [];
  const ids = patients.map(p => p._id);
  const [tasks, orders, plans, flows, cases, links, people] = await Promise.all([
    FollowUp.find({ patientId: { $in: ids } }).select('patientId status theme date remindAt assignedTo taskRole isBlocked workflowKey sourceType sourceId sourceOrderId sourceHealthPlanId sourceAnnualPlanId sourceScheduleKey coordinationGroupId careFlowId annualDispatchKey annualDispatch serviceTracking deliveryMode aiStatus reviewRole reviewAssignedTo staffId formData.serviceRequest formData.generatedFromExpertAppointment formData.generatedFromMedicalEscort formData.linkedFollowUpActionKey progressRecords executedContent updatedAt createdAt completedAt').lean(),
    Order.find({ user: { $in: ids } }).select('user serviceName specificationLabel totalUnits status paymentStatus tradeStatus refundStatus servicePrice initiationSource currentStage currentAssignee supervisorId supervisionStatus scheduledAt updatedAt createdAt fulfillmentStatus fulfillmentType serviceWorkflowSnapshot medicalProxyPlan.medicalEscort medicalProxyPlan.adHocConsultation medicalProxyPlan.supplementProxy specialtyTermsSnapshot.key specialtyTermsSnapshot.includedEscorts specialtyService.key specialtyService.startsAt specialtyService.endsAt specialtyService.usedEscorts specialtyService.includedEscorts note').lean(),
    HealthPlan.find({ patientId: { $in: ids } }).select('patientId title status type sourceOrderId currentStage currentAssignee supervisorId supervisionStatus pushedAt endDate updatedAt createdAt').lean(),
    CareFlow.find({ patientId: { $in: ids }, tenantId }).select('patientId parentId state revision updatedAt createdAt').lean(),
    Insurance.find({ patientId: { $in: ids } }).select('patientId title status assignedTo dueAt steps updatedAt createdAt').lean(),
    Link.find({ patientId: { $in: ids } }).select('patientId requestTaskId followUpId targetType targetId status updatedAt').lean(),
    Admin.find({ tenantId, staffStatus: { $ne: 'inactive' } }).select('name role tenantId').lean(),
  ]);
  const personMap = new Map(people.map(p => [id(p), p]));
  const person = (value, role) => { const p = personMap.get(id(value)); return p && (!role || p.role === role) ? { id: id(p), name: p.name, role: p.role } : null; };
  const patientMap = new Map(patients.map(p => [id(p), p]));
  const orderMap = new Map(orders.map(o => [id(o), o]));
  for (const plan of plans) {
    if (plan.type !== 'medical_assist' || !plan.sourceOrderId) continue;
    const order = orderMap.get(id(plan.sourceOrderId));
    if (!order) continue;
    if (order.linkedServicePlan && order.linkedServicePlan.status !== 'completed' && plan.status === 'completed') continue;
    order.linkedServicePlan = { status: plan.status, pushedAt: plan.pushedAt || null };
  }
  const planMap = new Map(plans.map(p => [id(p), p]));
  const caseMap = new Map(cases.map(c => [id(c), c]));
  const flowMap = new Map(flows.map(f => [id(f), f]));
  const taskFlow = new Map(flows.map(f => [id(f.parentId), f]));
  const dispatchParents = new Map(tasks.filter(t => t.annualDispatch?.executionId).map(t => [id(t.annualDispatch.executionId), t]));
  const linkMap = new Map(links.flatMap(l => [[id(l.requestTaskId), l], [id(l.followUpId), l]]));
  const groups = new Map();
  const ensure = (key, patientId, source, type) => {
    if (!groups.has(key)) groups.set(key, { key, patientId: id(patientId), source, type, tasks: [] });
    return groups.get(key);
  };
  const orderActive = o => (['pending', 'scheduled'].includes(o.status) || (o.status === 'completed' && ['draft', 'active'].includes(o.linkedServicePlan?.status)))
    && (o.paymentStatus === 'paid' || (o.initiationSource === 'staff_direct' && o.paymentStatus === 'unpaid' && o.servicePrice === 0))
    && (['paid', 'fulfilling', 'partially_refunded'].includes(o.tradeStatus) || (o.tradeStatus === 'completed' && ['draft', 'active'].includes(o.linkedServicePlan?.status)))
    && ['', 'none', 'failed', 'partially_refunded', null, undefined].includes(o.refundStatus)
    && !['completed', 'cancelled'].includes(o.supervisionStatus)
    && !(o.linkedServicePlan?.status === 'completed' && o.specialtyTermsSnapshot?.key !== 'ibd'
      && Number(o.totalUnits || 1) <= 1);
  const planActive = p => p.status === 'active' && !['completed', 'cancelled'].includes(p.supervisionStatus);
  const sourceGroup = (type, value, patientId) => {
    const source = (type === 'order' ? orderMap : type === 'plan' ? planMap : caseMap).get(id(value));
    if (!source || !samePatient(source, patientId)) return null;
    if (type === 'plan' && source.sourceOrderId) return sourceGroup('order', source.sourceOrderId, patientId);
    if (!(type === 'order' ? orderActive(source) : type === 'plan' ? planActive(source) : source.status !== 'closed')) return null;
    return ensure(`${type}:${id(source)}`, patientId, source, type);
  };
  orders.forEach(o => sourceGroup('order', o._id, o.user));
  plans.forEach(p => sourceGroup('plan', p._id, p.patientId));
  cases.forEach(c => sourceGroup('insurance', c._id, c.patientId));
  flows.filter(f => !f.state.finalized && !f.state.cancelled).forEach(f => ensure(`flow:${id(f)}`, f.patientId, f, 'flow'));
  for (const t of tasks) {
    let group;
    const flow = flowMap.get(id(t.careFlowId)) || taskFlow.get(id(t));
    const link = linkMap.get(id(t));
    if (flow && samePatient(flow, t.patientId)) {
      if (flow.state.finalized || flow.state.cancelled) continue;
      group = ensure(`flow:${id(flow)}`, t.patientId, flow, 'flow');
    } else if (t.careFlowId) continue; // orphaned/cross-member reference is not a new service
    else if (link && samePatient(link, t.patientId) && link.status !== 'attention') group = sourceGroup(link.targetType === 'order' ? 'order' : 'plan', link.targetId, t.patientId);
    else if (review.postVisit(t)) group = sourceGroup('order', t.sourceOrderId, t.patientId); // review is part of an active order; closed orders retain it in follow-up work only
    else if (t.sourceOrderId) group = sourceGroup('order', t.sourceOrderId, t.patientId);
    else if (t.sourceHealthPlanId) group = sourceGroup('plan', t.sourceHealthPlanId, t.patientId);
    else if (t.sourceType === 'insurance_service' && t.sourceId) group = sourceGroup('insurance', t.sourceId, t.patientId);
    else {
      const parent = dispatchParents.get(id(t));
      const origin = parent && samePatient(parent, t.patientId) ? parent : t;
      const annualKey = origin.sourceAnnualPlanId && (require('../../../shared/annualServiceItem.cjs').followUpKey(origin) || origin.sourceScheduleKey);
      const key = annualKey ? `annual:${id(t.patientId)}:${id(origin.sourceAnnualPlanId)}:${annualKey}`
        : origin.coordinationGroupId ? `group:${id(t.patientId)}:${origin.coordinationGroupId}` : `followup:${id(origin)}`;
      group = ensure(key, t.patientId, t, 'followup');
    }
    if (group) group.tasks.push(t);
  }
  const result = [];
  for (const g of groups.values()) {
    if (!belongsInServiceProgress(g)) continue;
    const p = patientMap.get(g.patientId), s = g.source;
    const remaining = g.tasks.filter(active);
    if (g.type === 'followup' && !remaining.length) continue;
    const ibdAnnual = g.type === 'order' && (s.specialtyTermsSnapshot?.key === 'ibd' || s.specialtyService?.key === 'ibd')
      && s.currentStage === 'ibd_awaiting_first_visit';
    const ibdReview = ibdAnnual && s.specialtyService?.endsAt && new Date(s.specialtyService.endsAt) <= now;
    // Supervisor records describe coordination, not an additional executor.
    const decisionOrder = g.type === 'order' && s.serviceName === '企业家健康决策计划';
    const execution = remaining.filter(t => t.taskRole !== 'supervisor' && t.workflowKey !== 'medication_proxy:progress'
      && !(decisionOrder && s.currentStage !== 'intake' && !t.workflowKey));
    const stageTasks = decisionOrder ? execution.filter(t => t.workflowKey === `decision_referral:${s.currentStage}`) : [];
    const activeExecution = stageTasks.length ? stageTasks : execution;
    const ready = activeExecution.filter(t => !t.isBlocked);
    let current = (ready.length ? ready : activeExecution).map(t => {
      const role = t.aiStatus === 'pending' ? t.reviewRole || 'familyDoctor' : null;
      // Match the original follow-up queue: explicit assignee wins; legacy
      // records without assignedTo belong to staffId, not the customer's team.
      const owner = role ? review.reviewer(t, p) : t.assignedTo || t.staffId;
      return { taskId: id(t), label: t.aiStatus === 'pending' ? `${t.theme || '随访计划'} · 待审核` : t.theme || '待处理事项',
        person: person(owner, role), blocked: !!t.isBlocked, dueAt: t.date || t.remindAt || null };
    });
    const dispatch = remaining.find(t => t.annualDispatch && t.annualDispatch.status !== 'completed');
    if (dispatch) {
      const pendingReview = dispatch.annualDispatch.status === 'pending_review';
      const child = g.tasks.find(t => id(t) === id(dispatch.annualDispatch.executionId));
      current = [{ taskId: id(pendingReview ? dispatch : child || dispatch), label: pendingReview ? '规划师验收代办结果' : '就医专员办理',
        person: person(pendingReview ? dispatch.assignedTo : dispatch.annualDispatch.assigneeId, pendingReview ? 'healthPlanner' : 'medicalAssistant'), blocked: false, dueAt: child?.date || null }];
    }
    if (g.type === 'flow') {
      const stage = s.state.stage, role = care.roles[stage];
      const step = remaining.find(t => t.workflowKey === `care_flow:${stage}`);
      current = [{ taskId: id(step || s.parentId), label: stage === 'closed' ? '审核已通过，待同步随访' : care.labels[stage] || '待核对流程', person: person(s.state.people?.[role]?.id, role), blocked: false, dueAt: step?.date || null }];
    } else if (!current.length) {
      const isShipping = g.type === 'order' && shipping.hasShippingHandoff(s);
      const owner = isShipping ? p.assignedHealthManager : ibdAnnual ? p.assignedFamilyDoctor : s.currentAssignee || s.assignedTo;
      current = [{ taskId: '', label: isShipping ? shipping.shippingProgress(s) : ibdReview ? '年度回顾与结案' : ibdAnnual ? '年度管理与陪诊' : stageLabels[s.currentStage || s.status] || '当前环节待核对',
        person: person(owner), blocked: false, dueAt: ibdAnnual ? s.specialtyService?.endsAt || null : s.dueAt || s.scheduledAt || s.endDate || null }];
    }
    if (decisionOrder && s.currentStage !== 'intake' && !stageTasks.length)
      current = [{ taskId: '', label: decisionLabels[s.currentStage] || '当前环节待核对',
        person: person(s.currentAssignee), blocked: false, dueAt: s.scheduledAt || null }];
    const ownDecisionTask = decisionOrder
      ? stageTasks.find(t => id(t.assignedTo || t.staffId) === id(actor) && !t.isBlocked) : null;
    if (!includeOwn && !ownDecisionTask && !ibdAnnual && current.every(c => c.person?.id === id(actor))) continue;
    if (!includeOwn && !ownDecisionTask && !ibdAnnual) current = current.filter(c => c.person?.id !== id(actor));
    const explicitCoordinator = s.state?.people?.healthPlanner?.id || s.supervisorId;
    const supervisors = [...new Set(remaining.filter(t => t.taskRole === 'supervisor').map(t => id(t.assignedTo)).filter(Boolean))];
    const coordinatorId = explicitCoordinator || (supervisors.length === 1 ? supervisors[0] : null);
    const coordinator = person(coordinatorId, 'healthPlanner');
    const reasons = [];
    if (ownDecisionTask) reasons.push('待本人办理当前服务任务');
    if (current.some(c => !c.person)) reasons.push('当前处理人待核对');
    if (coordinatorId && !coordinator) reasons.push('原协调人待核对');
    if (current.some(c => c.blocked)) reasons.push('等待前置环节');
    const day = date => new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
    if (current.some(c => c.dueAt && day(c.dueAt) < day(now))) reasons.push('已逾期');
    if (s.supervisionStatus === 'needs_attention' || s.status === 'denied') reasons.push('需要协调');
    const latest = g.tasks.flatMap(t => (t.progressRecords || []).map(r => ({ at: r.recordedAt, content: r.content })))
      .concat(g.tasks.filter(t => t.completedAt && t.executedContent).map(t => ({ at: t.completedAt, content: t.executedContent })))
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))[0];
    const intakeRecord = decisionOrder ? g.tasks.find(t => !t.workflowKey && t.executedContent)?.executedContent : '';
    const title = s.serviceName || s.title || s.state?.title || (g.type === 'flow' ? g.tasks.find(t => id(t) === id(s.parentId))?.theme : s.theme) || '服务进度';
    const row = { key: g.key, patientId: g.patientId, patientName: p.name, title, current, coordinator,
      progress: serviceProgress(g.type, s, g.tasks, current, now),
      reasons, attention: !!reasons.length, latest: latest || (intakeRecord
        ? { at: s.updatedAt, content: `规划师记录客户需求：${intakeRecord}` }
        : s.updatedAt ? { at: s.updatedAt, content: `当前环节：${current.map(c => c.label).join('、')}` } : null), updatedAt: s.updatedAt || null,
      taskId: current.find(c => c.taskId)?.taskId || '', actionTaskId: ownDecisionTask ? id(ownDecisionTask) : '',
      actionStage: ownDecisionTask ? s.currentStage : '',
      href: target(g.patientId, '', g.type),
      version: hash([stamp(s), s.linkedServicePlan, g.tasks.map(stamp).sort((a,b) => a[0].localeCompare(b[0])), current, coordinator, id(p.assignedFamilyDoctor)]),
    };
    result.push(row);
  }
  return result.sort((a, b) => Number(b.attention) - Number(a.attention) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) || a.key.localeCompare(b.key));
}
module.exports = { loadServices, id, hash };
