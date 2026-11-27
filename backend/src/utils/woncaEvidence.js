const { approvedItems } = require('./aiHealthCheckupItems');

const UNKNOWN = '历史无可核实记录';
const modules = {
  medical_treatment: '安排就医',
  checkup_completion: '完善检查',
  abnormal_followup: '定期复查',
  vaccine: '疫苗接种',
  monitoring: '日常监测',
  nutrition_assessment: '营养评估',
  ongoing_management: '持续管理',
  annual_checkup: '年度体检',
  health_consensus: '健康认知与共识',
  management_targets: '管理目标',
};
const dispositions = {
  needs_exam: '需完善检查',
  not_needed: '无需纳入',
  request_records: '需补资料',
  already_managed: '已关联既有事项',
};
const categories = {
  physical_exam: '体检报告',
  outpatient_record: '门诊病历',
  inpatient_record: '住院病历',
  prescription_order: '处方医嘱',
  exam_report: '检查报告',
  lab_report: '检验报告',
  body_composition: '人体成分',
  functional_medicine: '功能医学',
  genetic_test: '基因检测',
  questionnaire: '问卷',
  other_customer_material: '其他客户资料',
  insurance_claim_receipt: '保险票据',
};
const planStates = { approved: '已批准', pending: '待审核', rejected: '已退回' };
const draftStates = {
  approved: '已批准',
  rejected: '已结束／原因未区分',
  advisor_review: '待审核',
  excluded: '已排除',
  no_action: '无新增行动',
  superseded: '已替代',
};
const genStates = {
  ready: '已就绪',
  queued: '排队中',
  running: '生成中',
  failed: '生成失败',
  skipped: '已跳过',
};
const taskStates = {
  planned: '待执行',
  in_progress: '执行中',
  missed: '未完成',
  completed: '已完成',
  cancelled: '已取消',
};
const asOf = (date, end) => Boolean(date && new Date(date) <= end);
const dateAt = (date, end) => (asOf(date, end) ? date : null);
const present = (row, end) => asOf(row.createdAt, end);
const known = (row, end) => asOf(row.updatedAt || row.createdAt, end);
const tag = (value) => String(value).slice(-8).toUpperCase();
const materialCategory = r => categories[r.documentCategory] || '旧分类：' + (r.type || '未标记');

// 一份报告内的同一专项只计一次。报告级解读不证明每个专项均已作出去向决定。
function screeningRows(reports, decisions, catalog, year, snapshotAt) {
  const names = new Map(catalog.map(entry => [entry.id, entry.label]));
  const effective = require('./annualManagementEvidence').effectiveDecisions(decisions);
  const rows = [];
  for (const r of reports) {
    if (r.archiveOnly || r.audit_status !== 'audited' || ['prescription_order','outpatient_record','inpatient_record'].includes(r.documentCategory)) continue;
    const groups = new Map();
    for (const item of r.reportItems || []) {
      const examYear = String(item.examDate || r.checkDate || r.date || r.reportYear || '').slice(0,4);
      if (examYear !== String(year)) continue;
      for (const key of new Set([item.screeningKey,...(item.screeningKeys || [])].filter(Boolean))) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
    }
    const latestChange = Math.max(+new Date(r.createdAt || 0), +new Date(r.advisorCorrection?.resubmittedAt || 0));
    const viewed = r.familyDoctorViewedAt && +new Date(r.familyDoctorViewedAt) >= latestChange;
    const covered = snapshotAt && +new Date(snapshotAt) >= latestChange;
    const viewState = viewed ? '报告已查看' : covered ? '档案确认已覆盖' : '未见当前查看记录';
    for (const [key, items] of groups) {
      const matched = effective.filter(d => String(d.reportId) === String(r._id) && (
        d.sourceKey === 'screening:' + r._id + ':' + key ||
        items.some(item => item.itemId && [`screening:${r._id}:${item.itemId}`,`report_item:${r._id}:${item.itemId}`].includes(d.sourceKey))
      ));
      const directions = [...new Set(matched.flatMap(d => d.directions?.length ? d.directions : [d.direction]).filter(Boolean))];
      rows.push({report:tag(r._id), item:names.get(key) || '未匹配目录项目', included:matched.length > 0, state:matched.length ? '已纳入管理' : '未见纳入记录',
        viewState, viewAt:viewed ? r.familyDoctorViewedAt : covered ? snapshotAt : null,
        direction:directions.map(d => modules[d] || d).join('、')});
    }
  }
  return rows;
}
function projectEvidence({
  user,
  reports,
  drafts,
  plans,
  tasks,
  decisions,
  reviews,
  prep,
  medications,
  year,
  end,
  catalog,
  problemReview,
}) {
  const datedReports = reports.filter((r) => present(r, end));
  const docs = datedReports.map((r) => {
    const stable = known(r, end);
    const meds = medications.filter(
      (m) => present(m, end) && m.sourceRecordKey?.split(':')[1] === String(r._id)
    );
    return {
      key: tag(r._id),
      category: stable ? materialCategory(r) : UNKNOWN,
      manager:
        stable && r.audit_status === 'audited' ? '已审核' : stable && r.audit_status ? '未审核' : UNKNOWN,
      viewed: dateAt(r.familyDoctorViewedAt, end),
      interpreted: dateAt(r.advisorInterpretationConfirmedAt, end),
      medication: meds.length
        ? meds.filter((m) => known(m, end) && m.aiStatus === 'approved').length + '/' + meds.length
        : null,
      filed: stable && r.healthCourseDraft?.status === 'approved',
    };
  });
  const draftRows = drafts
    .filter((r) => present(r, end))
    .map((r) => ({
      key: tag(r._id),
      report: tag(r.reportId),
      purpose: known(r, end)
        ? { annual_report_input: '年度方案输入', issue_collaboration: '报告问题／单次随访' }[r.purpose] ||
          '用途未记录'
        : UNKNOWN,
      state: known(r, end) ? draftStates[r.status] || UNKNOWN : UNKNOWN,
      generation: known(r, end) ? genStates[r.followUpAutomation?.status] || UNKNOWN : UNKNOWN,
    }));
  const planRows = plans
    .filter((r) => present(r, end))
    .map((r) => {
      const data = known(r, end) ? r.moduleData || {} : {};
      const consensus = data.health_consensus;
      const links = {};
      for (const [key, section] of Object.entries(data)) {
        if (section?.enabled === false || !Array.isArray(section?.records)) continue;
        for (const record of section.records) {
          for (const id of [...(record.sourceIds || []), record.issueId].filter(Boolean)) {
            const destinations = (links[id] ||= []);
            if (!destinations.includes(key)) destinations.push(key);
          }
        }
      }
      return {
        key: tag(r._id),
        type: r.planType,
        state: known(r, end) ? planStates[r.reviewStatus] || UNKNOWN : UNKNOWN,
        pushed: dateAt(r.pushedAt, end),
        consensus: consensus
          ? consensus.enabled === false
            ? 0
            : (consensus.records || []).filter((x) => x.question?.trim()).length
          : null,
        nextExam: data.annual_checkup?.enabled !== false && data.annual_checkup?.focus ? '已列重点' : UNKNOWN,
        links,
        merged:
          known(r, end) && r.moduleData
            ? [...require('./annualVisitGroups').visitGroups(data).values()].filter(
                (entries) => entries.length > 1 && entries.every((x) => x.row.visitMergeConfirmed)
              ).length
            : null,
        traceable: Object.keys(links).length > 0,
      };
    });
  function destinations(id) {
    return (
      planRows
        .flatMap((p) => (p.links[id] || []).map((key) => '#' + p.key + ' ' + (modules[key] || key)))
        .join('、') || '未见明确关联'
    );
  }
  const effective = new Set(
    require('./annualManagementEvidence')
      .effectiveDecisions(decisions.filter((r) => known(r, end)))
      .map((r) => String(r._id))
  );
  const items = decisions
    .filter((r) => present(r, end))
    .map((r) => ({
      key: tag(r._id),
      source: r.symptomRecordId ? '客户主诉' : r.reportId ? '报告筛查' : '年度管理决定',
      state: known(r, end)
        ? r.status === 'withdrawn'
          ? '已撤销'
          : effective.has(String(r._id))
          ? '顾问已纳入'
          : '已被替代'
        : UNKNOWN,
      direction: known(r, end)
        ? (r.directions?.length ? r.directions : [r.direction]).map((d) => modules[d] || d).join('、')
        : UNKNOWN,
      position: destinations('management_issue:' + r._id),
    }));
  // Current source matching is meaningful only when both the summary and its supporting reports are available at the cutoff.
  const canRebuild = user && known(user, end) && datedReports.every((r) => known(r, end));
  const ai = canRebuild
    ? approvedItems(
        user.aiHealthSummary,
        year,
        datedReports.filter((r) => r.audit_status === 'audited' && !r.archiveOnly),
        catalog
      )
    : null;
  if (problemReview && known(problemReview, end)) {
    for (const topic of problemReview.topics || []) {
      items.push({
        key: tag(topic.id),
        source: '报告综合问题建议',
        state:
          problemReview.status === 'approved' && topic.reviewed
            ? topic.decision === 'exclude'
              ? '无需纳入'
              : '顾问已纳入'
            : '待顾问处置',
        direction: '年度管理问题',
        position: destinations('annual_problem:' + problemReview._id + ':' + topic.id),
      });
    }
  }
  const saved = reviews.filter((r) => present(r, end) && known(r, end));
  const matched = new Set();
  for (const item of ai?.items || []) {
    const review = saved.find(
      (r) => r.sourceVersion === ai.version && r.sourceKey === item.sourceKey && r.itemText === item.text
    );
    if (review) matched.add(String(review._id));
    const source = review?.linkedDecisionId || review?._id || 'ai_approved_' + item.itemKey;
    items.push({
      key: tag(item.itemKey),
      source: '已审核健康分析',
      state: review
        ? dispositions[review.disposition] || UNKNOWN
        : item.autoDisposition
        ? '系统建议（无逐项人工决定）'
        : '待顾问处置',
      direction: review ? dispositions[review.disposition] : dispositions[item.autoDisposition] || '待核对',
      position: destinations('management_issue:' + source),
    });
  }
  for (const r of saved.filter((r) => !matched.has(String(r._id))))
    items.push({
      key: tag(r._id),
      source: '健康分析历史处置',
      state: dispositions[r.disposition] || UNKNOWN,
      direction: '历史版本',
      position: destinations('management_issue:' + (r.linkedDecisionId || r._id)),
    });
  const follow = tasks
    .filter((r) => present(r, end))
    .map((r) => {
      const stable = known(r, end),
        completed = asOf(r.completedAt, end);
      const day = new Date(new Date(end).getTime() + 28800000).toISOString().slice(0, 10);
      const due =
        stable && r.date ? new Date(new Date(r.date).getTime() + 28800000).toISOString().slice(0, 10) : null;
      return {
        key: tag(r._id),
        plan: tag(r.sourceAnnualPlanId),
        due,
        state: stable ? taskStates[r.status] || UNKNOWN : completed ? '已完成' : UNKNOWN,
        overdue: stable && ['planned', 'missed', 'in_progress'].includes(r.status) && due && due < day,
        communications: (r.progressRecords || []).filter(x => asOf(x.recordedAt,end) && x.consensusTopicOutcome).length,
        contacts: (r.progressRecords || []).filter((x) => asOf(x.recordedAt, end)).length,
        completedAt: dateAt(r.completedAt, end),
      };
    });
  return {
    screeningRows: canRebuild && decisions.every(r => known(r,end)) ? screeningRows(datedReports, decisions, catalog || [], year, user.archiveReviewSnapshotAt) : null,
    docs,
    drafts: draftRows,
    plans: planRows.map(({ links, ...p }) => p),
    items,
    follow,
    registered: dateAt(user?.createdAt, end),
    screening: dateAt(prep?.screeningConfirmedAt, end),
    ready: dateAt(prep?.advisorReadyConfirmedAt, end),
    promptEvidence: ai?.approved === true,
  };
}
module.exports = { projectEvidence, materialCategory, screeningRows };
