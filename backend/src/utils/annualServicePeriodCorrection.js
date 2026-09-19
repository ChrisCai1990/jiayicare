const { randomUUID, createHash } = require('crypto');
const { buildServicePeriodEvidence } = require('./annualServicePeriod');
const { dayOf } = require('./serviceAccess');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const ACTIVE = ['pending_review', 'approved_pending_apply'];
function assertRole(patient, staff, role) {
  const field = role === 'healthPlanner' ? 'assignedHealthPlanner' : 'assignedFamilyDoctor';
  if (staff.role !== 'superadmin' && (staff.role !== role || String(patient[field] || '') !== String(staff._id))) throw fail('仅该客户所属岗位可执行此更正操作', 403);
}
function evidenceSnapshot(period) {
  return Object.fromEntries(['sourceType', 'sourceOrderId', 'contractReference', 'startDate', 'endDate', 'evidenceSnapshot', 'confirmedBy', 'confirmedAt'].map(key => [key, period[key] ?? null]));
}
async function correctionImpact(plan, proposed, models = {}) {
  const definitions = [
    ['task', models.Task || require('../models/Task'), 'status dueDate'],
    ['followup', models.FollowUp || require('../models/FollowUp'), 'status date serviceTracking'],
    ['supply', models.Supply || require('../models/RecurringSupplyPlan'), 'workflowStatus enabled nextDueDate'],
  ];
  const records = (await Promise.all(definitions.map(async ([kind, Model, fields]) => {
    const rows = await Model.find({ sourceAnnualPlanId: plan._id }).select(fields).lean();
    return rows.map(row => {
      const date = dayOf(row.dueDate || row.date || row.nextDueDate);
      const status = row.status || row.workflowStatus || 'idle';
      return { kind, id: String(row._id), date, status, linked: Boolean(row.serviceTracking?.linkId), enabled: row.enabled ?? null,
        outsidePeriod: Boolean(date && (date < proposed.startDate || date > proposed.endDate)),
        preserve: !['pending', 'planned', 'idle'].includes(status) || Boolean(row.serviceTracking?.linkId) || row.enabled === false };
    });
  }))).flat().sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  const planDates = [];
  for (const [moduleKey, module] of Object.entries(plan.moduleData || {})) {
    if (!module || module.enabled === false) continue;
    (Array.isArray(module.records) ? module.records : [module]).forEach((row, index) => {
      for (const field of ['visit_time', 'plan_time', 'time', 'date', 'executionDate', 'collaborationDate']) {
        const raw = String(row?.[field] || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !dayOf(raw)) continue;
        planDates.push({ moduleKey, index, field, date: raw, outsidePeriod: raw < proposed.startDate || raw > proposed.endDate });
      }
    });
  }
  const snapshot = { records, planDates, confirmedAt: plan.confirmedAt || null, proposedStart: proposed.startDate, proposedEnd: proposed.endDate };
  return { ...snapshot, fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}
async function readPeriod(plan, Model) {
  const period = await Model.findOne({ annualPlanId: plan._id, patientId: plan.patientId }).lean();
  if (!period?.confirmedAt || !plan.continuitySource?.previousPlanId) throw fail('须先有已确认的续年凭据才能发起更正');
  return period;
}
function versionFilter(period, input) {
  const revision = period.correctionRevision || 0;
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== revision) throw fail('更正版本已变化，请刷新后重试');
  return { _id: period._id, ...(revision ? { correctionRevision: revision } : { $or: [{ correctionRevision: 0 }, { correctionRevision: { $exists: false } }] }) };
}
async function saveTransition(Model, period, input, correction, event) {
  const result = await Model.updateOne(versionFilter(period, input), {
    $set: { correction }, $inc: { correctionRevision: 1 }, $push: { correctionHistory: event },
  });
  if (!result.matchedCount) throw fail('更正已被其他操作更新，请刷新后重试');
  return { correction, correctionRevision: (period.correctionRevision || 0) + 1 };
}
async function validateProposal(plan, patient, input, period, Model, models) {
  const proposed = await buildServicePeriodEvidence({ plan, patient, input }, models);
  const overlap = await Model.findOne({ patientId: plan.patientId, _id: { $ne: period._id }, startDate: { $lte: proposed.endDate }, endDate: { $gte: proposed.startDate } }).lean();
  if (overlap) throw fail('更正后的服务期与其他已确认服务期重叠');
  if (proposed.sourceOrderId && await Model.findOne({ _id: { $ne: period._id }, sourceOrderId: proposed.sourceOrderId }).lean()) throw fail('该年度订单已被其他服务期使用');
  return proposed;
}
async function proposeCorrection({ plan, patient, staff, input }, models = {}) {
  assertRole(patient, staff, 'healthPlanner');
  const Model = models.Period || require('../models/AnnualServicePeriod');
  const period = await readPeriod(plan, Model);
  versionFilter(period, input);
  if (ACTIVE.includes(period.correction?.status)) throw fail('已有待审核或待应用更正，不能重复提交');
  const reason = String(input.reason || '').trim();
  if (!reason || reason.length > 2000) throw fail('请填写更正原因（最多2000字）');
  // 检查所有相邻年度，不只检查上一年；建议日期越界留给顾问在影响清单中审核。
  const proposed = await validateProposal(plan, patient, input, period, Model, models);
  if (['sourceType', 'sourceOrderId', 'contractReference', 'startDate', 'endDate'].every(key => String(proposed[key] || '') === String(period[key] || ''))) throw fail('凭据和日期没有变化，无需提交更正');
  const correction = { id: randomUUID(), status: 'pending_review', original: evidenceSnapshot(period), proposed, reason,
    proposedBy: String(staff._id), proposedAt: new Date(), impact: await correctionImpact(plan, proposed, models) };
  return saveTransition(Model, period, input, correction, { action: 'submitted', ...correction });
}
async function reviewCorrection({ plan, patient, staff, input }, models = {}) {
  assertRole(patient, staff, 'familyDoctor');
  const Model = models.Period || require('../models/AnnualServicePeriod');
  const period = await readPeriod(plan, Model);
  versionFilter(period, input);
  const current = period.correction;
  if (current?.status !== 'pending_review' || input.correctionId !== current.id) throw fail('此更正已处理或版本不匹配');
  if (!['approve', 'reject'].includes(input.decision)) throw fail('审核决定无效');
  const note = String(input.note || '').trim();
  if (note.length > 2000 || (input.decision === 'reject' && !note)) throw fail('退回请填写原因，审核意见最多2000字');
  if (input.decision === 'approve') {
    if (input.impactAcknowledged !== true) throw fail('请确认已核对排期影响及原执行记录保留规则');
    await validateProposal(plan, patient, { ...current.proposed, verified: current.proposed.evidenceSnapshot?.verifiedByPlanner === true }, period, Model, models);
    const latest = await correctionImpact(plan, current.proposed, models);
    if (latest.fingerprint !== current.impact.fingerprint) throw fail('任务或方案状态已变化，请刷新影响清单后再审核');
  }
  const correction = { ...current, status: input.decision === 'approve' ? 'approved_pending_apply' : 'rejected', reviewedBy: String(staff._id), reviewedAt: new Date(), reviewNote: note };
  // 审核只写审计，不替换生效凭据，不重新确认/派发/修改冻结方案。
  return saveTransition(Model, period, input, correction, { action: input.decision, correctionId: current.id, reviewedBy: correction.reviewedBy, reviewedAt: correction.reviewedAt, note });
}
async function refreshCorrectionImpact({ plan, patient, staff, input }, models = {}) {
  assertRole(patient, staff, 'familyDoctor');
  const Model = models.Period || require('../models/AnnualServicePeriod');
  const period = await readPeriod(plan, Model);
  if (period.correction?.status !== 'pending_review' || period.correction.id !== input.correctionId) throw fail('仅待审核更正可刷新影响清单');
  const correction = { ...period.correction, impact: await correctionImpact(plan, period.correction.proposed, models) };
  return saveTransition(Model, period, input, correction, { action: 'impact_refreshed', correctionId: correction.id, by: String(staff._id), at: new Date(), impact: correction.impact });
}
async function withdrawCorrection({ plan, patient, staff, input }, models = {}) {
  assertRole(patient, staff, 'healthPlanner');
  const Model = models.Period || require('../models/AnnualServicePeriod');
  const period = await readPeriod(plan, Model);
  if (!['pending_review', 'rejected'].includes(period.correction?.status) || period.correction.id !== input.correctionId) throw fail('此状态不能撤回');
  const correction = { ...period.correction, status: 'withdrawn', withdrawnBy: String(staff._id), withdrawnAt: new Date() };
  return saveTransition(Model, period, input, correction, { action: 'withdrawn', correctionId: correction.id, by: correction.withdrawnBy, at: correction.withdrawnAt });
}
module.exports = { proposeCorrection, reviewCorrection, refreshCorrectionImpact, withdrawCorrection, correctionImpact };
