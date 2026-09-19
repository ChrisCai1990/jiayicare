const { randomUUID } = require('crypto');
const { projectAnnualSchedule, validateScheduleChanges, mergeScheduleAmendments, matchesChange, sourceDate } = require('./annualScheduleAmendments');
const { correctionImpact, validateProposal, evidenceSnapshot } = require('./annualServicePeriodCorrection');
const fail = message => Object.assign(new Error(message), { correctionRole: 'familyDoctor' });

// 所有读写显式绑定同一个事务；不能把普通查询混进快照，也不能在事务内并行操作。
function inSession(Model, session) {
  return {
    find: (...args) => Model.find(...args).session(session),
    findOne: (...args) => Model.findOne(...args).session(session),
    findById: (...args) => Model.findById(...args).session(session),
    updateOne: (query, update) => Model.updateOne(query, update, { session }),
  };
}
function scheduledKey(plan, item, index = item.index) {
  const record = item.moduleKey === 'annual_checkup' ? plan.moduleData.annual_checkup : plan.moduleData[item.moduleKey].records[index];
  const day = String(sourceDate(plan, item.moduleKey, index, item.field, record[item.field])).slice(0, 10);
  if (item.moduleKey === 'annual_checkup') return `annual_checkup:${day}`;
  const labels = { medical_treatment: '就医安排', specialist_collab: '联合会诊', checkup_completion: '体检完善', abnormal_followup: '异常复查', vaccine: '疫苗接种', functional_medicine: '功能医学检测' };
  return `${item.moduleKey}:${day}:${String(record.hospital || record.name || record.items || record.standardPlanName || labels[item.moduleKey]).trim()}`;
}
function buildMoves(plan, changes, rows) {
  const moves = [];
  for (const change of changes) {
    const key = scheduledKey(plan, change);
    const records = plan.moduleData[change.moduleKey]?.records || [plan.moduleData[change.moduleKey]];
    if (records.filter((_, i) => scheduledKey(plan, change, i) === key).length !== 1) throw fail('同日同名事项无法唯一对应，请先核对，不自动合并或拆分任务');
    const frozenDate = sourceDate(plan, change.moduleKey, change.index, change.field, change.from);
    const serviceKey = `service-request:${change.moduleKey}:${change.index}:${new Date(frozenDate).toISOString().slice(0, 10)}`;
    const matching = rows.filter(row => matchesChange(plan, change, { kind: 'followup', scheduleKey: row.sourceScheduleKey }));
    const seen = new Set();
    for (const row of matching) {
      if (!((row.sourceType === 'scheduled' && row.sourceScheduleKey === key) || (row.sourceType === 'annual_service' && row.sourceScheduleKey === serviceKey)) || seen.has(row.sourceScheduleKey)) throw fail('历史任务键不唯一或无法精确对应，不自动改期');
      seen.add(row.sourceScheduleKey);
      if (row.status !== 'planned' || row.serviceTracking || row.completedAt || row.completedByUser || row.completedByUserAt || row.completedBy || row.executedContent || row.executedType || row.interviewMinutes || row.nextFollowUpDate || row.dependsOnTaskId || row.isBlocked || row.serviceChecklist?.length || Object.values(row.vitals || {}).some(value => value != null) || Object.keys(row.formData || {}).some(key => key !== 'serviceRequest')) throw fail('事项已有执行痕迹或服务依赖，保留原记录，请顾问核对');
      if (String(row.patientId) !== String(plan.patientId) || new Date(row.date).getTime() !== new Date(change.from).getTime() || !row.updatedAt) throw fail('任务日期或版本已变化，或历史版本缺失，请刷新影响后审核');
      const date = new Date(change.to);
      const remindAt = row.remindAt == null ? null : new Date(new Date(row.remindAt).getTime() + date.getTime() - new Date(row.date).getTime());
      if (remindAt && !Number.isFinite(remindAt.getTime())) throw fail('原提醒时间无效，请核对');
      const fields = { date, remindAt };
      if (row.sourceType === 'annual_service') {
        const request = row.formData?.serviceRequest;
        if (request?.moduleKey !== change.moduleKey || request.recordIndex !== change.index || String(request.itemSnapshot?.[change.field] || '').slice(0, 10) !== change.from) throw fail('服务需求快照不一致，不能自动改期');
        fields[`formData.serviceRequest.itemSnapshot.${change.field}`] = change.to;
      }
      moves.push({ row, fields });
    }
  }
  if (new Set(moves.map(move => String(move.row._id))).size !== moves.length) throw fail('同一任务被多个修订事项引用，请核对');
  return moves;
}
async function applyIssuedCorrection(plan, period, models = {}) {
  const Period = models.Period || require('../models/AnnualServicePeriod');
  const correction = period.correction;
  const orderIds = [...new Set([...(period.evidenceOrderIds || []), period.sourceOrderId, correction.proposed.sourceOrderId].filter(Boolean).map(String))];
  if (orderIds.length) await require('./annualServiceOrderEvidence').requireEvidenceIndex(Period);
  const session = await (models.startSession ? models.startSession() : Period.db.startSession());
  try {
    return await session.withTransaction(async () => {
      const tx = Object.fromEntries(Object.entries({ Period, FollowUp: models.FollowUp || require('../models/FollowUp'), Task: models.Task || require('../models/Task'), Supply: models.Supply || require('../models/RecurringSupplyPlan'), Order: models.Order || require('../models/Order'), Link: models.Link || require('../models/FollowUpServiceLink') }).map(([key, Model]) => [key, inSession(Model, session)]));
      const guard = { _id: period._id, correctionRevision: period.correctionRevision, 'correction.id': correction.id, 'correction.status': 'approved_pending_apply', syncState: { $ne: 'running' } };
      // 先写服务期文档作为写入屏障：同步尝试和其他更正不能穿过本次事务。
      const claimed = await tx.Period.updateOne(guard, { $set: { 'correction.applyAttempt': randomUUID() } });
      if (!claimed.matchedCount) throw fail('更正版本或任务同步状态已变化，请稍后刷新重试');
      const current = await tx.Period.findOne({ _id: period._id }).lean();
      if (JSON.stringify(evidenceSnapshot(current)) !== JSON.stringify(evidenceSnapshot(correction.original))) throw fail('生效凭据已变化，请重新提交更正');
      let proposed;
      try { proposed = await validateProposal(plan, { _id: plan.patientId }, { ...correction.proposed, verified: correction.proposed.evidenceSnapshot?.verifiedByPlanner === true }, current, tx.Period, tx); }
      catch (error) { throw Object.assign(error, { correctionRole: 'healthPlanner' }); }
      const currentPlan = projectAnnualSchedule(plan, current.scheduleAmendments || []);
      const impact = await correctionImpact(currentPlan, proposed, tx);
      if (impact.fingerprint !== correction.impact.fingerprint) throw fail('审核后任务或排期发生变化，请刷新影响并重新审核');
      const changes = validateScheduleChanges(currentPlan, correction.scheduleChanges || [], proposed, impact, true);
      if (!changes.length || !correction.reviewNote?.trim()) throw fail('改期须有明确日期及顾问审核原因');
      const rows = await tx.FollowUp.find({ sourceAnnualPlanId: plan._id }).lean();
      const moves = buildMoves(currentPlan, changes, rows);
      const ids = moves.map(move => move.row._id);
      if (ids.length && await tx.Link.findOne({ $or: [{ requestTaskId: { $in: ids } }, { followUpId: { $in: ids } }] }).lean()) throw fail('事项已存在服务关联，即使任务投影未同步也不能改期');
      const scheduleAmendments = mergeScheduleAmendments(current.scheduleAmendments || [], changes);
      const executionPlan = projectAnnualSchedule(plan, scheduleAmendments);
      const at = new Date();
      for (const { row, fields } of moves) {
        const result = await tx.FollowUp.updateOne({ _id: row._id, patientId: plan.patientId, sourceAnnualPlanId: plan._id, sourceScheduleKey: row.sourceScheduleKey, status: 'planned', date: row.date, updatedAt: row.updatedAt, serviceTracking: null }, {
          $set: fields,
          $push: { annualScheduleHistory: { correctionId: correction.id, at, reviewedBy: correction.reviewedBy, reason: correction.reviewNote, from: row.date, to: fields.date, previousRemindAt: row.remindAt || null, remindAt: fields.remindAt } },
        });
        if (!result.matchedCount) throw fail('任务已被执行或更新，本批次改期全部撤销，请重新核对');
      }
      const appliedImpact = await correctionImpact(executionPlan, proposed, tx);
      const executionAnchor = require('./annualServicePeriodCorrectionApply').assertRetainedScheduleFits(executionPlan, current, proposed, appliedImpact);
      const result = await tx.Period.updateOne(guard, {
        $set: { sourceType: proposed.sourceType, contractReference: proposed.contractReference, startDate: proposed.startDate, endDate: proposed.endDate, evidenceSnapshot: proposed.evidenceSnapshot, ...(proposed.sourceOrderId ? { sourceOrderId: proposed.sourceOrderId } : {}), confirmedBy: correction.proposedBy, confirmedAt: at, executionAnchor, scheduleAmendments,
          ...(orderIds.length ? { evidenceOrderIds: orderIds } : {}),
          correction: { ...correction, status: 'applied', applyIssue: null, appliedAt: at, appliedImpact, movedTaskIds: ids } },
        ...(!proposed.sourceOrderId ? { $unset: { sourceOrderId: 1 } } : {}),
        $inc: { correctionRevision: 1 },
        $push: { correctionHistory: { action: 'applied', correctionId: correction.id, at, by: 'system', reviewedBy: correction.reviewedBy, original: correction.original, effective: proposed, executionAnchor, scheduleAmendments, movedTaskIds: ids } },
      });
      if (!result.matchedCount) throw fail('更正版本已变化，本批次改期全部撤销');
      return { applied: true, movedTasks: moves.length };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 10000 });
  } catch (error) {
    if (error.code === 20 || /Transaction numbers are only allowed|does not support retryable writes/i.test(error.message)) throw Object.assign(new Error('数据库尚不支持多文档事务，已保留原任务和凭据；请管理员核验部署条件后重试'), { correctionRole: 'healthPlanner' });
    throw error;
  } finally { await session.endSession(); }
}
module.exports = { applyIssuedCorrection, buildMoves };
