const Draft = require('../models/ReportFollowUpDraft');
const Report = require('../models/MedicalReport');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const { reportSnapshot, isReportSourceCurrent, reportExclusion } = require('./reportFollowUpSource');
const { runAssessmentDraft } = require('./assessmentFollowUpAutomation');

async function completeReportReview(id) {
  await FollowUp.updateMany({ ...require('./healthManagementRollout').patientFilter(), sourceType: 'report_followup', sourceId: id, workflowKey: 'report_followup:advisor_review', status: { $in: ['planned', 'in_progress', 'missed'] } }, {
    $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '报告随访审核已处理或来源已更新。' },
  });
}

async function syncReportReviewTask(draft) {
  if (!draft) return;
  if (!require('./healthManagementRollout').enabledForPatient(draft.patientId)) return;
  const publicationPending = draft.status === 'approved' && draft.followUpPublication?.status !== 'published';
  if (draft.status !== 'advisor_review' && !publicationPending) return completeReportReview(draft._id);
  if (!publicationPending && ['queued', 'running'].includes(draft.followUpAutomation?.status)) return;
  const patient = await User.findById(draft.patientId).select('assignedFamilyDoctor assignedHealthPlanner assignedHealthManager').lean();
  const owner = patient?.assignedFamilyDoctor || patient?.assignedHealthPlanner || patient?.assignedHealthManager || draft.createdBy;
  if (!owner) throw new Error('缺少任务负责人');
  const key = `${draft._id}:report_review`;
  try {
    await FollowUp.findOneAndUpdate({ assessmentActionKey: key }, {
      $set: { assignedTo: owner, ...(publicationPending ? { status: 'planned', completedAt: null, completedBy: null } : {}), theme: `${patient?.assignedFamilyDoctor ? (publicationPending ? '重试报告随访发布' : '审核报告随访') : '请分配健康顾问'} · ${draft.title}`, plannedContent: publicationPending ? '随访尚未完整发布，请核对负责人后重试；已发布任务会保留。' : (draft.followUpAutomation?.message || '请核对来源原文和随访草稿，审核后才会派发。') },
      $setOnInsert: { assessmentActionKey: key, patientId: draft.patientId, staffId: draft.createdBy || owner, sourceType: 'report_followup', sourceId: draft._id, workflowKey: 'report_followup:advisor_review', taskRole: 'executor', type: 'other', ...(!publicationPending ? { status: 'planned' } : {}), aiStatus: 'approved', reviewRole: 'familyDoctor', date: new Date(), remindAt: new Date() },
    }, { upsert: true });
  } catch (error) { if (error.code !== 11000 || !(await FollowUp.exists({ assessmentActionKey: key }))) throw error; }
}

async function assertReportDraftSource(draft) {
  require('./healthManagementRollout').assertPatientEnabled(draft.patientId);
  const report = await Report.findById(draft.reportId).lean();
  if (!isReportSourceCurrent(draft, report)) throw Object.assign(new Error('报告已更新或撤销审核，请处理最新版本'), { statusCode: 409 });
  const reason = await reportExclusion(report);
  if (reason) throw Object.assign(new Error(reason), { statusCode: 409 });
}

async function materializeReportEvent(report) {
  if (!require('./healthManagementRollout').enabledForPatient(report.user)) return;
  const event = report.followUpSourceEvent;
  if (!event || event.status !== 'queued') return;
  const key = `${report._id}:${event.sequence}:${event.digest}`;
  const reason = await reportExclusion(report);
  const prior = await Draft.findOne({ reportId: report._id, sourceSequence: { $lt: event.sequence }, status: 'approved', 'followUpDrafts.0': { $exists: true } }).lean();
  const automation = reason ? { status: 'skipped', message: reason }
    : prior ? { status: 'skipped', message: '修订报告已有历史随访，请顾问对照原计划，仅补充新增事项，不自动撤销旧任务。' }
      : { status: 'queued', attempts: 0, message: '等待自动整理报告随访草稿。' };
  let draft;
  try {
    draft = await Draft.findOneAndUpdate({ sourceKey: key }, { $setOnInsert: {
      patientId: report.user, reportId: report._id, sourceKey: key, sourceSequence: event.sequence,
      sourceSnapshot: reportSnapshot(report), title: report.title || '病历/报告', createdBy: report.reviewedByStaff || report.uploadedBy,
      status: reason ? 'excluded' : 'advisor_review', followUpAutomation: automation,
    } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) { if (error.code !== 11000) throw error; draft = await Draft.findOne({ sourceKey: key }); if (!draft) throw error; }
  const obsolete = await Draft.find({ reportId: report._id, sourceSequence: { $lt: event.sequence }, status: 'advisor_review' }).select('_id').lean();
  await Draft.updateMany({ _id: { $in: obsolete.map(row => row._id) }, status: 'advisor_review' }, { $set: { status: 'superseded' }, $inc: { __v: 1 } });
  for (const row of obsolete) await completeReportReview(row._id);
  await syncReportReviewTask(draft);
  await Report.updateOne({ _id: report._id, 'followUpSourceEvent.sequence': event.sequence, 'followUpSourceEvent.digest': event.digest }, { $set: { 'followUpSourceEvent.status': 'processed' } });
  return draft;
}

async function generateReportDraft(id, options = {}) {
  try {
    const result = await runAssessmentDraft(id, options, { Assessment: Draft, assertSource: assertReportDraftSource });
    if (result?.followUpAutomation?.status === 'ready' && !result.followUpDrafts?.length) {
      await Draft.updateOne({ _id: id, status: 'advisor_review', __v: result.__v }, { $set: { status: 'no_action' }, $inc: { __v: 1 } });
    }
    return await Draft.findById(id);
  } finally {
    const row = await Draft.findById(id);
    if (row) await syncReportReviewTask(row);
  }
}

let busy = false;
let requested = false;
function wakeReportDraftWorker() {
  requested = true;
  if (busy) return;
  busy = true;
  setImmediate(() => require('./tenantScope').runWithoutTenantScope(async () => {
    try {
      do {
        requested = false;
        const reports = await Report.find({ ...require('./healthManagementRollout').patientFilter('user'), 'followUpSourceEvent.status': 'queued' }).sort({ 'followUpSourceEvent.queuedAt': 1 }).limit(25);
        let progressed = 0;
        for (const report of reports) {
          try { await materializeReportEvent(report); progressed++; }
          catch { console.error('[report-followup] 来源事件待恢复'); }
        }
        const drafts = await Draft.find({ ...require('./healthManagementRollout').patientFilter(), status: 'advisor_review', 'followUpAutomation.status': 'queued' }).sort({ createdAt: 1 }).limit(25).select('_id').lean();
        for (const row of drafts) {
          try { await generateReportDraft(row._id, { automatic: true }); }
          catch {
            // 处理来源变更等发生在抢占前的拒绝，避免 queued 永久占住批次。
            await Draft.updateOne({ _id: row._id, status: 'advisor_review', 'followUpAutomation.status': 'queued' }, { $set: { 'followUpAutomation.status': 'failed', 'followUpAutomation.message': '来源可能更新或已有服务承接，请核对后重试。' }, $inc: { __v: 1 } });
            await syncReportReviewTask(await Draft.findById(row._id));
          }
        }
        if ((reports.length === 25 && progressed === 25) || drafts.length === 25) requested = true;
      } while (requested);
    } catch { console.error('[report-followup] 队列未完成，等待恢复'); }
    finally { busy = false; }
  }));
}

async function recoverReportDrafts() {
  await Draft.updateMany({ ...require('./healthManagementRollout').patientFilter(), status: 'advisor_review', 'followUpAutomation.status': 'running', 'followUpAutomation.startedAt': { $lt: new Date(Date.now() - 10 * 60000) } }, { $set: { 'followUpAutomation.status': 'failed', 'followUpAutomation.message': '生成中断，请顾问重试或人工接管。' }, $inc: { __v: 1 } });
  for await (const row of Draft.find({ ...require('./healthManagementRollout').patientFilter(), $or: [
    { status: 'advisor_review', 'followUpAutomation.status': { $in: ['ready', 'failed', 'skipped'] } },
    { status: 'approved', 'followUpPublication.status': { $ne: 'published' } },
  ] }).cursor()) await syncReportReviewTask(row);
  wakeReportDraftWorker();
}
function startReportDraftWorker() {
  const run = () => recoverReportDrafts().catch(() => console.error('[report-followup] 恢复失败'));
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref?.();
}
module.exports = { materializeReportEvent, assertReportDraftSource, generateReportDraft, syncReportReviewTask, completeReportReview, wakeReportDraftWorker, startReportDraftWorker };
