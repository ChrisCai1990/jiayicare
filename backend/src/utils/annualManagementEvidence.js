function effectiveDecisions(decisions = []) {
  const sameIssue = value => String(value || '').replace(/\s+/g, '').trim();
  return decisions.filter(legacy => {
    const reportId = String(legacy.reportId || '');
    if (legacy.sourceKey !== `screening_report:${reportId}`) return true;
    // 顾问已在同份报告的具体检查项重新保存同一问题和方向时，旧报告级归属只保留为历史，不再阻断年度方案。
    return !decisions.some(item => item !== legacy && String(item.reportId || '') === reportId
      && item.itemId && item.sourceKey === `screening:${reportId}:${item.itemId}`
      && sameIssue(item.title) === sameIssue(legacy.title) && item.direction === legacy.direction);
  });
}

// 报告补图、归类审核等保存也会更新整份报告的 updatedAt，不能据此撤销顾问对检查项的决定。
const CLINICAL_ITEM_FIELDS = [
  'name', 'value', 'unit', 'referenceRange', 'status', 'itemType', 'bodyPart',
  'specimen', 'modality', 'reviewIssues', 'findings', 'diagnosis', 'conclusion',
  'examDate', 'institution',
];
function clinicalItem(item) {
  return CLINICAL_ITEM_FIELDS.map(key => item?.[key] ?? null);
}
function currentSourceItem(report, decision) {
  const snapshot = decision.sourceSnapshot?.item;
  const items = report.reportItems || [];
  if (snapshot?.itemId) return items.find(item => String(item.itemId) === String(snapshot.itemId));
  const id = String(decision.itemId || '');
  return items.find(item => [item.itemId, item.name, item.screeningKey, ...(item.screeningKeys || [])]
    .some(value => String(value || '') === id));
}
function sourceChanged(report, decision) {
  if (!report) return true;
  const snapshot = decision.sourceSnapshot || {};
  if (decision.sourceKey === `screening_report:${decision.reportId}`) {
    return String(report.updatedAt) !== String(snapshot.reportUpdatedAt);
  }
  if (!snapshot.item) return true;
  const current = currentSourceItem(report, decision);
  return !current || String(report.checkDate || '') !== String(snapshot.checkDate || '')
    || JSON.stringify(clinicalItem(current)) !== JSON.stringify(clinicalItem(snapshot.item));
}

async function load(patientId, year, dependencies = {}) {
  const Decision = dependencies.Decision || require('../models/AnnualManagementDecision');
  const Report = dependencies.Report || require('../models/MedicalReport');
  const CheckupReview = dependencies.CheckupReview || require('../models/AIHealthCheckupReview');
  const User = dependencies.User || require('../models/User');
  const decisions = effectiveDecisions(await Decision.find({ patientId, year, status: { $ne: 'withdrawn' } }).sort({ reviewedAt: 1 }).lean());
  const evidence = [], stale = [], staleDecisionIds = [];
  for (const decision of decisions) {
    const report = await Report.findOne({ _id: decision.reportId, user: patientId, audit_status: 'audited' })
      .select('_id title checkDate updatedAt reportItems').lean();
    const changed = sourceChanged(report, decision);
    if (changed) { stale.push(decision.title); staleDecisionIds.push(String(decision._id)); continue; }
    if (decision.sourceKey === `screening_report:${report._id}`) {
      const groups = new Set((report.reportItems || []).map(item => item.screeningKey || item.screeningKeys?.[0]).filter(Boolean));
      if (groups.size > 1) { stale.push(`${decision.title}（旧版整份报告纳入，请在对应检查项重新归属）`); staleDecisionIds.push(String(decision._id)); continue; }
    }
    const reviewRules = require('./annualReviewPlan');
    const reviewPlan = decision.reviewPlan?.kind === 'recheck'
      ? decision.reviewPlan : reviewRules.legacyReviewPlan(decision, report) || decision.reviewPlan || null;
    evidence.push({ id: `management_issue:${decision._id}`, content: {
      reportId: report._id, reportTitle: report.title, checkDate: report.checkDate,
      problem: decision.title, direction: decision.direction, advisorNote: decision.note,
      reviewPlan, legacyReviewNote: reviewPlan?.kind !== 'recheck' && reviewRules.legacyReviewNote(decision.note),
      source: decision.sourceSnapshot?.item || null, reviewedAt: decision.reviewedAt,
    } });
  }
  const patient = await User.findById(patientId).select('aiHealthSummary').lean();
  const approved = require('./aiHealthCheckupItems').approvedItems(patient?.aiHealthSummary, year);
  const reviews = approved.approved ? await CheckupReview.find({ patientId, year, sourceVersion: approved.version }).lean() : [];
  const byKey = new Map(reviews.map(row => [row.sourceKey, row]));
  const unresolved = [];
  for (const item of approved.items) {
    const review = byKey.get(item.sourceKey);
    if (!review || review.itemText !== item.text) { unresolved.push(item.text); continue; }
    if (review.disposition === 'needs_exam') {
      evidence.push({ id: `management_issue:${review._id}`, content: {
        problem: review.title, direction: 'checkup_completion', advisorNote: review.note,
        reportTitle: '已审核AI健康信息整理 · 体检资料覆盖', sourceKind: 'ai_checkup', source: item.text, reviewedAt: review.reviewedAt,
      } });
    } else if (review.disposition === 'already_managed') {
      const linked = decisions.find(row => String(row._id) === String(review.linkedDecisionId));
      if (!linked || linked.direction !== 'checkup_completion' || !evidence.some(row => row.id === `management_issue:${linked._id}`)) {
        stale.push(`${item.text}（关联的年度管理事项已变化，请重新核对）`);
      }
    }
  }
  return { evidence, stale, staleDecisionIds, unresolved };
}

const DIRECTION_LABELS = {
  medical_treatment: '安排就医', checkup_completion: '完善检查', abnormal_followup: '定期复查',
  vaccine: '疫苗接种', monitoring: '日常监测', ongoing_management: '持续管理或观察',
};
function managementTargets(evidence = []) {
  return evidence.slice(0, 32).map(item => {
    const { problem, direction, reportTitle, advisorNote } = item.content;
    const directionLabel = DIRECTION_LABELS[direction] || '持续管理';
    return { issueId: item.id, goal: `${problem} · ${directionLabel}`,
      focus: [reportTitle && `依据已审核${reportTitle}`, advisorNote || `核对${problem}的执行结果与后续需要`].filter(Boolean).join('；'),
      nutritionRelevant: direction === 'ongoing_management', sourceTitle: reportTitle || '已审核专项筛查', sourceGoal: directionLabel };
  });
}

function validatePlanCoverage(moduleData = {}, evidence = []) {
  for (const group of require('./annualReviewPlan').reviewGroups(evidence)) {
    const rows = moduleData.abnormal_followup?.records || [];
    const linked = rows.filter(row => row.sourceIds?.some(id => group.sourceIds.includes(id)));
    if (linked.length !== 1 || !group.sourceIds.every(id => linked[0].sourceIds.includes(id))
      || linked[0].items !== `复查${group.items.length}项检查`
      || linked[0].reviewItems?.length !== group.items.length
      || !group.items.every(item => linked[0].reviewItems.includes(item))) {
      return `约${group.intervalMonths}个月后的复查没有归为一次完整安排，请核对项目与来源`;
    }
  }
  for (const source of evidence) {
    const key = source.content.reviewPlan?.kind === 'recheck' ? 'abnormal_followup'
      : source.content.direction === 'ongoing_management' ? 'personalized_followups' : source.content.direction;
    const module = moduleData[key];
    const rows = module?.enabled === false ? [] : Array.isArray(module?.records) ? module.records : module ? [module] : [];
    if (!rows.some(row => Array.isArray(row.sourceIds) && row.sourceIds.includes(source.id)
      && (source.content.reviewPlan?.kind === 'recheck' ? source.content.reviewPlan.items.every(item => row.reviewItems?.includes(item))
        : source.content.direction !== 'ongoing_management' || require('./annualPlanPresentation').internalDaily(row)))) {
      return `“${source.content.problem}”尚未按顾问选定的管理方向进入方案，请重新生成或补齐对应事项`;
    }
  }
  return '';
}

module.exports = { load, managementTargets, validatePlanCoverage, effectiveDecisions };
