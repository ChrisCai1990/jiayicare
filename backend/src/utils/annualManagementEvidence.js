const directionsOf = value => Array.isArray(value?.directions) && value.directions.length ? value.directions : [value?.direction].filter(Boolean);

function effectiveDecisions(decisions = []) {
  const sameIssue = value => String(value || '').replace(/\s+/g, '').trim();
  return decisions.filter(earlier => {
    const reportId = String(earlier.reportId || '');
    if (!reportId || !/^(screening_report|screening|report_item):/.test(earlier.sourceKey || '')) return true;
    // 顾问已在同份报告的具体检查项重新保存同一问题和方向时，旧报告级归属只保留为历史，不再阻断年度方案。
    return !decisions.some(item => item !== earlier && String(item.reportId || '') === reportId
      && item.itemId && [`screening:${reportId}:${item.itemId}`, `report_item:${reportId}:${item.itemId}`].includes(item.sourceKey)
      && sameIssue(item.title) === sameIssue(earlier.title) && directionsOf(earlier).every(value => directionsOf(item).includes(value))
      && (earlier.sourceKey === `screening_report:${reportId}` || item.sourceKey !== earlier.sourceKey
        && (earlier.sourceSnapshot?.item?.name && item.sourceSnapshot?.item?.name
          && sameIssue(earlier.sourceSnapshot.item.name) === sameIssue(item.sourceSnapshot.item.name)
          || isNarrowerScreeningGroup(earlier, item))
        && new Date(item.reviewedAt || 0).getTime() > new Date(earlier.reviewedAt || 0).getTime()));
  });
}

function isNarrowerScreeningGroup(previous, latest) {
  const before = previous.sourceSnapshot?.items;
  const after = latest.sourceSnapshot?.items;
  return Array.isArray(before) && Array.isArray(after) && after.length > 0 && after.length < before.length
    && after.every(row => row.itemId && before.some(old => old.itemId === row.itemId));
}

// 报告补图、归类审核等保存也会更新整份报告的 updatedAt，不能据此撤销顾问对检查项的决定。
const CLINICAL_ITEM_FIELDS = [
  'name', 'value', 'unit', 'referenceRange', 'status', 'itemType', 'bodyPart',
  'specimen', 'modality', 'reviewIssues', 'findings', 'diagnosis', 'conclusion',
  'examDate', 'institution',
];
function clinicalItem(item) {
  return CLINICAL_ITEM_FIELDS.map(key => {
    const value = item?.[key];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
    return value;
  });
}
function reportSourceItems(report, kind, sourceId) {
  const id = String(sourceId || '').trim();
  if (!id || !['screening', 'report_item'].includes(kind)) return [];
  const rows = report?.reportItems || [];
  if (kind === 'screening') {
    const group = rows.filter(row => row.screeningKey === id || row.screeningKeys?.includes(id));
    if (group.length) return group;
    if (id.includes('|')) return [];
  }
  const byId = rows.filter(row => String(row.itemId || '') === id);
  if (byId.length) return kind === 'screening' && byId.length !== 1 ? [] : byId;
  const byName = rows.filter(row => String(row.name || '') === id);
  return kind === 'screening' && byName.length !== 1 ? [] : byName;
}
function currentSourceItem(report, decision) {
  const snapshot = decision.sourceSnapshot?.item;
  const items = report.reportItems || [];
  if (snapshot?.itemId) {
    const match = items.find(item => String(item.itemId) === String(snapshot.itemId));
    if (match) return match;
    // Re-parsing can assign a new internal ID to the same uniquely identified
    // examination. Clinical fields are compared after this lookup.
    const name = String(snapshot.name || '').trim();
    if (!name) return null;
    const byName = items.filter(item => String(item.name || '').trim() === name);
    return byName.length === 1 ? byName[0] : null;
  }
  const id = String(decision.itemId || '');
  return items.find(item => [item.itemId, item.name, item.screeningKey, ...(item.screeningKeys || [])]
    .some(value => String(value || '') === id));
}
function sourceChanged(report, decision) {
  if (!report) return true;
  const snapshot = decision.sourceSnapshot || {};
  if (Array.isArray(snapshot.items)) {
    const current = reportSourceItems(report, 'screening', decision.itemId);
    const signatures = rows => rows.map(item => JSON.stringify([String(item.itemId || ''),
      [...new Set([item.screeningKey, ...(item.screeningKeys || [])].filter(Boolean))].sort(), clinicalItem(item)])).sort();
    // A single screening item can be regrouped when a report is reclassified. Its
    // stable itemId and clinical content still identify the original decision.
    if (snapshot.items.length === 1 && snapshot.items[0]?.itemId) {
      const currentItem = currentSourceItem(report, decision);
      return !currentItem || String(report.checkDate || '') !== String(snapshot.checkDate || '')
        || JSON.stringify(clinicalItem(currentItem)) !== JSON.stringify(clinicalItem(snapshot.items[0]));
    }
    return !current.length || String(report.checkDate || '') !== String(snapshot.checkDate || '')
      || JSON.stringify(signatures(current)) !== JSON.stringify(signatures(snapshot.items));
  }
  if (decision.sourceKey === `report_item:${decision.reportId}:${decision.itemId}`) {
    if (!report.advisorInterpretationConfirmedAt || report.archiveOnly || report.duplicateOf
      || ['outpatient_record', 'prescription_order'].includes(report.documentCategory)) return true;
    const matches = reportSourceItems(report, 'report_item', decision.itemId);
    if (matches.length !== 1 || matches[0].screeningKey || matches[0].screeningKeys?.length) return true;
  }
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
  const HealthRecord = dependencies.HealthRecord || require('../models/HealthRecord');
  const User = dependencies.User || require('../models/User');
  const decisions = effectiveDecisions(await Decision.find({ patientId, year, status: { $ne: 'withdrawn' } }).sort({ reviewedAt: 1 }).lean());
  const evidence = [], stale = [], staleDecisionIds = [], staleSourceNotes = [];
  for (const decision of decisions) {
    if (decision.sourceKey === `symptom:${decision.symptomRecordId}` && decision.symptomRecordId) {
      const record = await HealthRecord.findOne({ _id: decision.symptomRecordId, user: patientId, type: 'symptom' })
        .select('value note recordedAt symptomWorkflow').lean();
      const snapshot = decision.sourceSnapshot || {};
      if (!record || record.value !== snapshot.value || record.note !== snapshot.note
        || String(record.recordedAt) !== String(snapshot.recordedAt)
        || String(record.symptomWorkflow?.decidedAt) !== String(snapshot.decidedAt)
        || record.symptomWorkflow?.decisionNote !== snapshot.decisionNote) {
        stale.push(`${decision.title}（主诉来源已变化）`); staleDecisionIds.push(String(decision._id)); continue;
      }
      evidence.push({ id: `management_issue:${decision._id}`, content: {
        problem: decision.title, direction: decision.direction, directions: directionsOf(decision), advisorNote: decision.note,
        goal: decision.goal || '', action: decision.action || '', actionTiming: decision.actionTiming || null,
        directionTimings: decision.directionTimings || {},
        reportTitle: '已处理不适主诉', sourceKind: 'symptom', source: { name: '主诉', value: record.value },
        sourceRecordId: record._id, checkDate: record.recordedAt, reviewedAt: decision.reviewedAt,
      } });
      continue;
    }
    const report = await Report.findOne({ _id: decision.reportId, user: patientId, audit_status: 'audited' })
      .select('_id title checkDate updatedAt reportItems advisorInterpretationConfirmedAt archiveOnly duplicateOf documentCategory').lean();
    const changed = sourceChanged(report, decision);
    if (changed) {
      const snapshot = decision.sourceSnapshot || {};
      const current = report && currentSourceItem(report, decision);
      const labels = { name: '项目名称', value: '检验结果', unit: '单位', referenceRange: '参考范围', status: '异常标记',
        itemType: '项目类型', bodyPart: '检查部位', specimen: '标本', modality: '检查方式', reviewIssues: '解读问题',
        findings: '检查所见', diagnosis: '诊断', conclusion: '结论', examDate: '检查日期', institution: '检查机构' };
      const fields = current && snapshot.item ? Object.keys(labels).filter(key => (current[key] ?? '') !== (snapshot.item[key] ?? '')) : [];
      const reason = !report ? '原报告当前无法作为已审核来源'
        : String(report.checkDate || '') !== String(snapshot.checkDate || '') ? '报告日期与纳入时不同'
        : !current ? '原检查项已移除或存在多个同名项目，请在专项筛查中重新归属'
        : fields.length ? fields.map(key => labels[key]).join('、') + '与纳入时不同，请在专项筛查中重新确认'
        : '组合检查的项目归属或成员已变化，请在专项筛查中重新确认';
      staleSourceNotes.push({ title: decision.title, reason });
      stale.push(decision.title); staleDecisionIds.push(String(decision._id)); continue;
    }
    if (decision.sourceKey === `screening_report:${report._id}`) {
      const groups = new Set((report.reportItems || []).map(item => item.screeningKey || item.screeningKeys?.[0]).filter(Boolean));
      if (groups.size > 1) { stale.push(`${decision.title}（旧版整份报告纳入，请在对应检查项重新归属）`); staleDecisionIds.push(String(decision._id)); continue; }
    }
    const reviewRules = require('./annualReviewPlan');
    const reviewPlan = decision.reviewPlan?.kind === 'recheck'
      ? decision.reviewPlan : reviewRules.legacyReviewPlan(decision, report) || decision.reviewPlan || null;
    evidence.push({ id: `management_issue:${decision._id}`, content: {
      reportId: report._id, reportTitle: report.title, checkDate: report.checkDate,
      problem: decision.title, direction: decision.direction, directions: directionsOf(decision), advisorNote: decision.note,
      goal: decision.goal || '', action: decision.action || '', actionTiming: decision.actionTiming || null,
      directionTimings: decision.directionTimings || {},
      reviewPlan, legacyReviewNote: reviewPlan?.kind !== 'recheck' && reviewRules.legacyReviewNote(decision.note),
      source: decision.sourceSnapshot?.item || null,
      sourceItems: decision.sourceSnapshot?.items || null, reviewedAt: decision.reviewedAt,
    } });
  }
  const patient = await User.findById(patientId).select('aiHealthSummary').lean();
  const screeningReports = dependencies.screeningReports || (dependencies.Decision || dependencies.User || dependencies.Report ? [] : Report.find
    ? await Report.find({ user: patientId, audit_status: 'audited', archiveOnly: { $ne: true } })
      .select('checkDate date reportItems.name reportItems.orderName reportItems.screeningKey reportItems.screeningParent').lean() : []);
  const approved = require('./aiHealthCheckupItems').approvedItems(patient?.aiHealthSummary, year, screeningReports);
  const reviews = approved.approved ? await CheckupReview.find({ patientId, year, sourceVersion: approved.version }).lean() : [];
  const byKey = new Map(reviews.map(row => [row.sourceKey, row]));
  const unresolved = [];
  for (const item of approved.items) {
    const review = byKey.get(item.sourceKey);
    if (!review || review.itemText !== item.text) {
      if (item.autoDisposition === 'needs_exam') {
        // The physician-approved missing-examination list is already a reviewed
        // source. Carry it into the editable annual draft; the usual plan
        // approval still decides whether the action is published.
        evidence.push({ id: `management_issue:ai_approved_${item.itemKey}`, content: {
          problem: item.title, direction: 'checkup_completion',
          advisorNote: item.text, reportTitle: '已审核AI健康信息整理 · 体检资料覆盖',
          sourceKind: 'ai_checkup_approved', source: item.text,
        } });
      } else if (!item.autoDisposition) unresolved.push(item.text);
      continue;
    }
    if (review.disposition === 'needs_exam') {
      evidence.push({ id: `management_issue:${review._id}`, content: {
        problem: review.title, direction: 'checkup_completion', advisorNote: review.note,
        reportTitle: '已审核AI健康信息整理 · 体检资料覆盖', sourceKind: 'ai_checkup', source: item.text, reviewedAt: review.reviewedAt,
      } });
    } else if (review.disposition === 'already_managed') {
      const linked = decisions.find(row => String(row._id) === String(review.linkedDecisionId));
      if (!linked || !directionsOf(linked).includes('checkup_completion') || !evidence.some(row => row.id === `management_issue:${linked._id}`)) {
        stale.push(`${item.text}（关联的年度管理事项已变化，请重新核对）`);
      }
    }
  }
  return { evidence, stale, staleDecisionIds, staleSourceNotes, unresolved };
}

const DIRECTION_LABELS = {
  medical_treatment: '安排就医', checkup_completion: '完善检查', abnormal_followup: '定期复查',
  vaccine: '疫苗接种', monitoring: '日常监测', ongoing_management: '持续管理或观察', nutrition_assessment: '营养评估',
};
const DEFAULT_MANAGEMENT_GOALS = {
  medical_treatment: '及时完成就医，明确诊治方案',
  checkup_completion: '完成所需检查，明确结果与后续处理方向',
  abnormal_followup: '按计划完成复查，明确变化与后续管理措施',
  vaccine: '核实接种适宜性，按确认的方案完成接种',
  monitoring: '按计划监测，及时识别异常变化',
  ongoing_management: '持续跟进变化，按评估结果调整管理措施', nutrition_assessment: '完成营养评估，由营养师确认干预重点',
};
function managementTargets(evidence = [], pilot = true) {
  return evidence.slice(0, 32).map(item => {
    const { problem, direction, reportTitle, advisorNote, goal, action, actionTiming, directionTimings, source } = item.content;
    const selected = directionsOf(item.content);
    const directionLabels = selected.map(value => DIRECTION_LABELS[value] || '持续管理');
    const directionLabel = directionLabels.join('、');
    if (!pilot) return { issueId: item.id, goal: `${problem} · ${directionLabel}`,
      focus: [reportTitle && `依据已审核${reportTitle}`, advisorNote || `核对${problem}的执行结果与后续需要`].filter(Boolean).join('；'),
      nutritionRelevant: selected.some(value => ['ongoing_management', 'nutrition_assessment'].includes(value)), sourceTitle: problem || reportTitle || '已审核专项筛查', sourceGoal: directionLabel, sourceGoals: directionLabels };
    return { issueId: item.id, goal: goal || DEFAULT_MANAGEMENT_GOALS[direction] || `${problem} · ${directionLabel}`,
      focus: action || [reportTitle && `依据已审核${reportTitle}`, advisorNote || `核对${problem}的执行结果与后续需要`].filter(Boolean).join('；'),
      goalDimension: '', baseline: source && typeof source === 'object' && ['string', 'number'].includes(typeof source.value)
        ? [source.name || problem, source.value, source.unit].filter(value => value !== undefined && value !== null && value !== '').join(' ') : '',
      sourceStatus: source?.status || '',
      ...(actionTiming?.mode && actionTiming.mode !== 'pending' ? { actionTiming } : {}),
      ...(directionTimings && Object.keys(directionTimings).length ? { directionTimings } : {}),
      nutritionRelevant: selected.includes('nutrition_assessment') || selected.includes('ongoing_management') && item.content.sourceKind !== 'symptom', sourceTitle: problem || reportTitle || '已审核专项筛查', sourceGoal: directionLabel, sourceGoals: directionLabels };
  });
}

function generationActionEvidence(evidence = []) {
  return evidence.filter(item => directionsOf(item.content).some(value => value !== 'nutrition_assessment'));
}

// Project confirmed screening decisions into editable annual-plan actions. This
// never schedules an appointment or writes a plan; the advisor reviews the draft.
function draftPlanActions(evidence = []) {
  const actions = [];
  const monitoringLabels = { bloodPressure: '血压', bloodSugar: '血糖', waist: '腰围', heartRate: '心率', weight: '体重', sleep: '睡眠', mood: '情绪', diet: '饮食', exercise: '运动', water: '饮水', bowel: '排便', smoking: '吸烟', alcohol: '饮酒' };
  for (const group of require('./annualReviewPlan').reviewGroups(evidence)) {
    actions.push({ key: 'abnormal_followup', record: {
      sourceIds: group.sourceIds, reviewGroupVersion: 1, reviewItems: group.items,
      items: `复查${group.items.length}项检查`,
      reason: group.problems.join('、'), order_dept: group.department,
      time: group.dueDate, timingReason: `按已确认的${group.intervalMonths}个月复查间隔`, reviewStatus: 'pending_family_doctor_review',
    } });
  }
  const fields = {
    medical_treatment: 'reason', checkup_completion: 'items',
    abnormal_followup: 'items', vaccine: 'name',
  };
  for (const item of evidence) {
    const content = item.content || {};
    if (directionsOf(content).includes('monitoring')) {
      for (const selected of content.directionTimings?.monitoring?.items || []) {
        if (monitoringLabels[selected.type]) actions.push({ key: 'monitoring', record: {
          sourceIds: [item.id], metricType: selected.type, items: monitoringLabels[selected.type],
          measurementPeriod: selected.time, frequency: selected.frequency || '', reviewStatus: 'pending_family_doctor_review',
        } });
      }
    }
    for (const direction of directionsOf(content)) {
    if (content.reviewPlan?.kind === 'recheck' && direction === 'abnormal_followup' || !fields[direction]) continue;
    const timing = content.directionTimings?.[direction] || (!Object.keys(content.directionTimings || {}).length && direction === content.direction ? content.actionTiming : null);
    const suggestedDate = ['single', 'rolling'].includes(timing?.mode) && require('../../../shared/annualAppointment.cjs').validDay(timing?.firstDueDate)
      ? timing.firstDueDate : '';
    const dateKey = direction === 'medical_treatment' ? 'visit_time' : 'time';
    actions.push({ key: direction, record: {
      sourceIds: [item.id], [fields[direction]]: content.problem || content.reportTitle || '待核对事项',
      ...(direction === 'medical_treatment' ? {} : { reason: content.action || content.advisorNote || content.problem || '' }),
      ...(suggestedDate ? { [dateKey]: suggestedDate,
        timingReason: timing?.dateBasis === 'interval'
          ? `按顾问确认的从${timing.anchorDate}起${timing.intervalMonths}个月后${direction === 'checkup_completion' ? '检查' : '就医'}`
          : '按顾问纳入年度管理时确认的首次执行日期',
        ...(direction === 'medical_treatment' || direction === 'checkup_completion' && timing?.dateBasis === 'interval' ? { appointmentSchedulingVersion: 1 } : {}),
      } : {}),
      goal: content.goal || DEFAULT_MANAGEMENT_GOALS[direction] || '',
      reviewStatus: 'pending_family_doctor_review',
    } });
    }
  }
  return actions;
}

function validatePlanCoverage(moduleData = {}, evidence = []) {
  const reviewGroups = require('./annualReviewPlan').reviewGroups(evidence);
  for (const group of reviewGroups) {
    const rows = moduleData.abnormal_followup?.records || [];
    const linked = rows.filter(row => row.sourceIds?.some(id => group.sourceIds.includes(id)));
    const row = linked[0];
    // Earlier plans grouped all same-month review sources before a specialist
    // was recorded. Keep a complete existing group valid; do not force the
    // advisor to delete and regenerate it merely because newer decisions split.
    const combined = row ? reviewGroups.filter(other => other.sourceIds.some(id => row.sourceIds?.includes(id))) : [];
    const legacyCombined = combined.length > 1 && combined.every(other => !other.department
      && other.intervalMonths === group.intervalMonths && other.dueDate.slice(0, 7) === group.dueDate.slice(0, 7));
    const expectedIds = legacyCombined ? [...new Set(combined.flatMap(other => other.sourceIds))] : group.sourceIds;
    const expectedItems = legacyCombined ? [...new Set(combined.flatMap(other => other.items))] : group.items;
    if (linked.length !== 1 || !expectedIds.every(id => row.sourceIds.includes(id))
      || row.items !== `复查${expectedItems.length}项检查`
      || row.reviewItems?.length !== expectedItems.length
      || !expectedItems.every(item => row.reviewItems.includes(item))
      || (group.department && row.order_dept !== group.department
        && !(row.reviewGroupVersion === 1 && !row.order_dept && row.department === group.department))) {
      return `约${group.intervalMonths}个月后${group.department || '待确认专科'}的复查没有归为一次完整就诊安排，请核对项目与来源`;
    }
  }
  for (const source of evidence) {
    for (const direction of directionsOf(source.content)) {
    if (['nutrition_assessment','vaccine','monitoring'].includes(direction) &&
        moduleData[direction]?.enabled === false && moduleData[direction]?.advisorExcluded === true) continue;
    if (source.content.reviewPlan?.kind === 'recheck' && direction === 'ongoing_management') continue;
    if (direction === 'nutrition_assessment') {
      const goals = moduleData.management_targets?.records || [];
      if (moduleData.nutrition_assessment?.enabled === false || !moduleData.nutrition_assessment
        || !goals.some(row => row.issueId === source.id && row.nutritionRelevant === true))
        return `“${source.content.problem}”尚未进入营养评估与对应管理目标，请核对方案`;
      continue;
    }
    const isReview = source.content.reviewPlan?.kind === 'recheck' && direction === 'abnormal_followup';
    const key = direction === 'ongoing_management' ? 'personalized_followups' : direction;
    const module = moduleData[key];
    const rows = module?.enabled === false ? [] : Array.isArray(module?.records) ? module.records : module ? [module] : [];
    if (direction === 'monitoring' && Array.isArray(source.content.directionTimings?.monitoring?.items)) {
      const labels = { bloodPressure: '血压', bloodSugar: '血糖', waist: '腰围', heartRate: '心率', weight: '体重', sleep: '睡眠', mood: '情绪', diet: '饮食', exercise: '运动', water: '饮水', bowel: '排便', smoking: '吸烟', alcohol: '饮酒' };
      if (!source.content.directionTimings.monitoring.items.every(item => rows.some(row => row.sourceIds?.includes(source.id)
        && row.metricType === item.type && row.items === labels[item.type] && row.measurementPeriod === item.time
        && (!item.frequency || !!row.frequency))))
        return `“${source.content.problem}”的日常监测项目或时间尚未进入方案，请重新带入`;
      continue;
    }
    if (!rows.some(row => Array.isArray(row.sourceIds) && row.sourceIds.includes(source.id)
      && (isReview ? source.content.reviewPlan.items.every(item => row.reviewItems?.includes(item))
        : direction !== 'ongoing_management' || require('./annualPlanPresentation').internalDaily(row)))) {
      return `“${source.content.problem}”尚未按顾问选定的管理方向进入方案，请重新生成或补齐对应事项`;
    }
    }
  }
  return '';
}

module.exports = { load, managementTargets, draftPlanActions, generationActionEvidence, validatePlanCoverage, effectiveDecisions, reportSourceItems, directionsOf };
