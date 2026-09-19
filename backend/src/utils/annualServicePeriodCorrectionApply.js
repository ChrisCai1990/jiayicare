const { correctionImpact, validateProposal, evidenceSnapshot } = require('./annualServicePeriodCorrection');
const { dayOf } = require('./serviceAccess');
const issue = (message, role = 'familyDoctor') => Object.assign(new Error(message), { correctionRole: role });
function retainedAnchor(plan, period) {
  const start = new Date(`${period.startDate}T00:00:00+08:00`);
  const anchor = period.executionAnchor ? new Date(period.executionAnchor) : new Date(Math.max(new Date(plan.confirmedAt || start).getTime(), start.getTime()));
  if (!Number.isFinite(anchor.getTime())) throw issue('原年度执行起点无效，暂不能自动应用更正');
  return anchor;
}
function assertRetainedScheduleFits(plan, period, proposed, impact) {
  if (impact.planDates.some(row => row.outsidePeriod) || impact.records.some(row => row.outsidePeriod && !row.preserve)) throw issue('更正后存在越界排期，需健康顾问处理；系统不会平移或取消原任务');
  const anchor = retainedAnchor(plan, period);
  const dates = [new Date(anchor.getTime() + 3 * 86400000), new Date(anchor.getTime() + 7 * 86400000)];
  // 没有明确日期的服务需求默认落在执行起点，也必须检查，不能只验证+3/+7天启动任务。
  const serviceRows = require('./annualPlanServiceTasks').buildAnnualPlanServiceTasks({ ...plan, confirmedAt: anchor });
  dates.push(...serviceRows.map(row => row.date));
  // 校验尚未进入30天派发窗口的相对排期，不能只检查已生成的任务。
  for (const row of plan.moduleData?.personalized_followups?.records || []) {
    for (const cycle of row.sourceCycles || []) {
      if (cycle.cycleType === 'date' && cycle.cycleDate) dates.push(cycle.cycleDate);
      else if (Number(cycle.cycleDuration) > 0) dates.push(new Date(anchor.getTime() + Number(cycle.cycleDuration) * (cycle.cycleUnit === 'week' ? 7 : cycle.cycleUnit === 'month' ? 30 : 1) * 86400000));
    }
  }
  if (dates.some(date => { const day = dayOf(date); return day && (day < proposed.startDate || day > proposed.endDate); })) throw issue('保留原执行起点后有相对排期越界，请健康顾问核对，不能自动重新计算派单键');
  return anchor;
}
async function applyApprovedCorrection(plan, models = {}) {
  const Model = models.Period || require('../models/AnnualServicePeriod');
  const period = await Model.findOne({ annualPlanId: plan._id, patientId: plan.patientId }).lean();
  const correction = period?.correction;
  if (correction?.status !== 'approved_pending_apply') return { applied: false };
  const guard = { _id: period._id, correctionRevision: period.correctionRevision, 'correction.id': correction.id, 'correction.status': 'approved_pending_apply', syncState: { $ne: 'running' } };
  // 与已登记的同步尝试串行，失败时不抢占派发，更不改动其任务。
  if (period.syncState === 'running') return { applied: false, waiting: true, reason: '等待当前任务同步完成' };
  try {
    if (!correction.reviewedBy || !correction.reviewedAt) throw issue('缺少顾问审核凭据，请重新核对');
    if (correction.applicationPolicy !== 'retain_schedule') throw issue('历史审核未确认保留原排期后安全应用，请顾问重新核对');
    if (JSON.stringify(evidenceSnapshot(period)) !== JSON.stringify(correction.original)) throw issue('生效凭据已发生变化，请规划师重新提交更正', 'healthPlanner');
    let proposed;
    try {
      proposed = await validateProposal(plan, { _id: plan.patientId }, { ...correction.proposed, verified: correction.proposed.evidenceSnapshot?.verifiedByPlanner === true }, period, Model, models);
    } catch (error) { throw issue(error.statusCode ? error.message : '凭据核验失败，请稍后重试', 'healthPlanner'); }
    const impact = await correctionImpact(plan, proposed, models);
    if (JSON.stringify(impact.planDates) !== JSON.stringify(correction.impact.planDates)) throw issue('审核后方案日期发生变化，请重新核对影响清单');
    const executionAnchor = assertRetainedScheduleFits(plan, period, proposed, impact);
    const orderIds = [...new Set([...(period.evidenceOrderIds || []), period.sourceOrderId, proposed.sourceOrderId].filter(Boolean).map(String))];
    if (orderIds.length) await require('./annualServiceOrderEvidence').requireEvidenceIndex(Model);
    const appliedAt = new Date();
    const next = { ...correction, status: 'applied', applyIssue: null, appliedAt, appliedImpact: impact };
    const result = await Model.updateOne(guard, {
      $set: { sourceType: proposed.sourceType, contractReference: proposed.contractReference, startDate: proposed.startDate, endDate: proposed.endDate,
        evidenceSnapshot: proposed.evidenceSnapshot, confirmedBy: correction.proposedBy, confirmedAt: appliedAt, executionAnchor,
        ...(proposed.sourceOrderId ? { sourceOrderId: proposed.sourceOrderId } : {}),
        ...(orderIds.length ? { evidenceOrderIds: orderIds } : {}), correction: next },
      ...(!proposed.sourceOrderId ? { $unset: { sourceOrderId: 1 } } : {}),
      $inc: { correctionRevision: 1 },
      $push: { correctionHistory: { action: 'applied', correctionId: correction.id, at: appliedAt, by: 'system', reviewedBy: correction.reviewedBy, original: correction.original, effective: proposed, executionAnchor } },
    });
    return { applied: Boolean(result.matchedCount), waiting: !result.matchedCount };
  } catch (error) {
    const applyIssue = { role: error.correctionRole || 'healthPlanner', code: 'correction_apply', message: error.code === 11000 ? '续约订单或合同唯一约束冲突，请规划师核对' : error.correctionRole ? error.message : '更正应用暂时失败，请重试并核对数据库索引' };
    // 同一异常重复扫描不堆叠历史；旧尝试不得覆写已应用/新版本。
    if (JSON.stringify(correction.applyIssue) !== JSON.stringify(applyIssue)) await Model.updateOne(guard, {
      $set: { 'correction.applyIssue': applyIssue }, $inc: { correctionRevision: 1 },
      $push: { correctionHistory: { action: 'apply_blocked', correctionId: correction.id, at: new Date(), by: 'system', note: applyIssue.message } },
    });
    return { applied: false, issue: applyIssue };
  }
}
module.exports = { applyApprovedCorrection, retainedAnchor, assertRetainedScheduleFits };
