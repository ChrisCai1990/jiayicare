// One advisor decision, consumed only after existing service acceptance/redemption.
const { createHash } = require('node:crypto');
const same = (a, b) => String(a || '') === String(b || '');
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
const digest = row => createHash('sha256').update(JSON.stringify(row, (key, value) =>
  ['outcomeEvidenceLock'].includes(key) ? undefined : value)).digest('hex');
function runtime() {
  const FollowUp = require('../models/FollowUp'), Report = require('../models/MedicalReport');
  const User = require('../models/User'), Draft = require('../models/ReportFollowUpDraft');
  const Handoff = require('../models/CheckupPreparationHandoff');
  async function context(review, actor) {
    if (!require('./healthManagementRollout').enabledForPatient(review.patientId)) return null;
    const patient = await User.findById(review.patientId).lean();
    if (!patient || (actor.role !== 'superadmin' && (actor.role !== 'familyDoctor'
      || !same(actor._id, patient.assignedFamilyDoctor) || !same(actor._id, review.assignedTo)))) throw fail('仅所属健康顾问可确认');
    const scheme = await require('../models/FollowUpPlan').findById(review.followUpSchemeId).lean();
    if (review.sourceType !== 'health_plan' || review.taskRole !== 'executor' || scheme?.workflowStageKey !== 'result_review') throw fail('非体检结果审核节点');
    const links = await Handoff.find({ servicePlanId: review.sourceHealthPlanId, patientId: review.patientId, status: 'active' }).lean();
    if (!links.length) return null;
    if (links.length !== 1) throw fail('体检承接来源不唯一');
    const link = links[0], planner = await FollowUp.findById(link.plannerTaskId).lean();
    if (!planner || !same(planner.patientId, review.patientId) || !same(planner.sourceAnnualPlanId, link.annualPlanId)
      || !/^annual_checkup:\d{4}-\d{2}-\d{2}:prepare:healthPlanner$/.test(planner.sourceScheduleKey || '')) throw fail('体检准备来源不匹配');
    const originals = await FollowUp.find({ patientId: review.patientId, sourceAnnualPlanId: link.annualPlanId, sourceType: 'scheduled',
      sourceScheduleKey: planner.sourceScheduleKey.replace(/:prepare:healthPlanner$/, ''), taskRole: { $in: [null, ''] } }).lean();
    if (originals.length !== 1) throw fail('原健管计划不唯一');
    return { item: originals[0], link };
  }
  async function prepare(review, actor, body) {
    const ctx = await context(review, actor);
    if (!ctx) return null;
    if (review.status === 'completed') {
      const saved = review.checkupOutcomeDecision;
      if (!saved || !same(saved.actor._id, actor._id) || saved.inputKey !== inputKey(body)) throw fail('已确认结果不可改写，请刷新核对');
      return saved;
    }
    if (!['planned', 'in_progress', 'missed'].includes(review.status) || review.isBlocked) throw fail('前置报告审核尚未完成');
    if (!body || ctx.item.status === 'completed') throw fail('请在本环节一次确认结果及后续安排');
    const collection = await FollowUp.findById(review.dependsOnTaskId).lean();
    if (!collection || collection.status !== 'completed' || !same(collection.sourceHealthPlanId, review.sourceHealthPlanId)) throw fail('本次报告回收来源不完整');
    const required = collection.serviceChecklist?.[0]?.reportIds || [];
    if (!required.length || required.some(id => !(body.reportIds || []).map(String).includes(String(id)))) throw fail('请核对全部已回收报告');
    let attestation;
    await require('./followUpOutcomeReview').reviewOutcome({ FollowUp, Report, User, Draft, id: ctx.item._id, actor, body,
      fence: async args => {
        if (args.evidence.filter(e => e.model === 'Report').some(e => !same(e.row.sourceHealthPlanId, review.sourceHealthPlanId))) throw fail('所选报告须明确关联本次服务');
        attestation = { originalId: ctx.item._id, actor: { _id: actor._id, role: actor.role }, body,
          inputKey: inputKey(body), evidence: args.evidence.map(e => ({ model: e.model, id: e.row._id, digest: digest(e.row) })) };
        return ctx.item;
      } });
    if (!attestation) throw fail('原计划已变化，请刷新核对');
    return attestation;
  }
  async function close(task, review) {
    const saved = review.checkupOutcomeDecision;
    if (!saved || !same(saved.originalId, task._id)) throw fail('缺少本次合并确认凭据');
    return require('./followUpOutcomeReview').reviewOutcome({ FollowUp, Report, User, Draft, id: task._id, actor: saved.actor, body: saved.body,
      fence: async args => {
        assertEvidence(saved.evidence, args.evidence);
        return require('./outcomeEvidenceFence').fencedClose({ ...args,
          proof: { ...args.proof, sourceServiceReviewId: review._id, reviewedAt: review.completedAt },
          evidence: [...args.evidence, { model: 'FollowUp', row: review }] });
      } });
  }
  async function assertDraft(draft, actor, reviewId) {
    const review = await FollowUp.findById(reviewId).lean();
    if (!review || review.isBlocked || !['planned', 'in_progress', 'completed'].includes(review.status)) throw fail('体检审核节点不可用');
    const ctx = await context(review, actor);
    if (!ctx || !same(draft.patientId, review.patientId)) throw fail('草稿与体检来源不匹配');
    if (ctx.item.status === 'completed' && review.status !== 'completed') throw fail('原计划已结案，不再追加本次审核安排');
    const report = await Report.findById(draft.reportId).lean();
    if (!same(report?.sourceHealthPlanId, review.sourceHealthPlanId)
      || !require('./reportFollowUpSource').isReportSourceCurrent(draft, report)) throw fail('草稿不是本次有效已审核报告');
    if (review.status === 'completed' && !same(review.checkupOutcomeDecision?.body?.reportDraftId, draft._id)) throw fail('已完成审核不能引入另一份草稿');
  }
  return { context, prepare, close, assertDraft };
}
function inputKey(body = {}) {
  return JSON.stringify({ reportIds: [...new Set((body.reportIds || []).map(String))].sort(), decision: body.decision,
    note: body.note, checksComplete: body.checksComplete, reportDraftId: body.reportDraftId || null });
}
function assertEvidence(saved, current) {
  if (current.length !== saved.length || current.some(e =>
    saved.find(s => s.model === e.model && same(s.id, e.row._id))?.digest !== digest(e.row))) throw fail('审核依据已变化，保留原计划待核对');
}
module.exports = { runtime, inputKey, digest, assertEvidence };
