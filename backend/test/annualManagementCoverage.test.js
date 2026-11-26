const test = require('node:test');
const assert = require('node:assert/strict');
const { load, validatePlanCoverage, effectiveDecisions, reportSourceItems } = require('../src/utils/annualManagementEvidence');
const { buildAnnualPlanDisplayItems, customerModuleData } = require('../src/utils/annualPlanPresentation');

test('顾问选择完善检查后，不能以复查事项代替并推送', () => {
  const evidence = [{ id: 'management_issue:1', content: { problem: '肺结节', direction: 'checkup_completion' } }];
  assert.match(validatePlanCoverage({ abnormal_followup: { records: [{ sourceIds: ['management_issue:1'] }] } }, evidence), /肺结节/);
  assert.equal(validatePlanCoverage({ checkup_completion: { records: [{ sourceIds: ['management_issue:1'] }] } }, evidence), '');
});

test('日常跟进保留在员工方案中，客户方案项目和原始板块均不展示', () => {
  const source = { personalized_followups: { records: [
    { standardPlanName: '【日常跟进】', executionDate: '2026-11-10' },
    { standardPlanName: '定期复评', executionDate: '2026-11-11' },
  ] } };
  assert.deepEqual(buildAnnualPlanDisplayItems(source), []);
  assert.equal(customerModuleData(source).personalized_followups, undefined);
  assert.equal(source.personalized_followups.records.length, 2);
});

test('客户完整方案列出复查项目与具体干预内容', () => {
  const items = buildAnnualPlanDisplayItems({ abnormal_followup: { records: [{ items: '复查2项检查', reviewItems: ['尿酸', '肝功能'], time: '2027-01-26', personalizedAdvice: '按计划完成复查' }] } });
  assert.deepEqual(items[0].reviewItems, ['尿酸', '肝功能']);
  assert.equal(items[0].interventionPlan, '按计划完成复查');
  assert.equal(items[0].schedule, '2027-01-26');
});

test('持续管理仅由工作人员日常跟进模板承接，不以其他个性化模板代替', () => {
  const evidence = [{ id: 'management_issue:kidney', content: { problem: '肾结晶', direction: 'ongoing_management' } }];
  const record = standardPlanName => ({ sourceIds: ['management_issue:kidney'], standardPlanName });
  assert.match(validatePlanCoverage({ personalized_followups: { records: [record('饮水指导')] } }, evidence), /肾结晶/);
  assert.equal(validatePlanCoverage({ personalized_followups: { records: [record('【日常跟进】')] } }, evidence), '');
});

test('多项目报告的旧报告级决定需由顾问重新指定检查项', async () => {
  const updatedAt = new Date('2026-10-20T00:00:00Z');
  const decisions = [{ _id: 'decision', title: '脂肪肝', reportId: 'report', sourceKey: 'screening_report:report',
    sourceSnapshot: { reportUpdatedAt: updatedAt } }];
  const report = { _id: 'report', updatedAt, reportItems: [
    { screeningKey: 'liver', diagnosis: '脂肪肝' }, { screeningKey: 'kidney', diagnosis: '双肾未见异常' },
  ] };
  const Decision = { find: () => ({ sort: () => ({ lean: async () => decisions }) }) };
  const Report = { findOne: () => ({ select: () => ({ lean: async () => report }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const CheckupReview = { find: () => ({ lean: async () => [] }) };
  const result = await load('patient', 2026, { Decision, Report, User, CheckupReview });
  assert.equal(result.evidence.length, 0);
  assert.match(result.stale[0], /重新归属/);
  assert.deepEqual(result.staleDecisionIds, ['decision']);
});

test('报告其他内容更新后，已纳入的检查项内容未变仍可生成年度方案', async () => {
  const original = new Date('2026-10-20T00:00:00Z');
  const item = { itemId: 'lung-ct', name: '肺部CT', diagnosis: '肺结节', status: 'abnormal' };
  const decision = { _id: 'decision', title: '肺结节', direction: 'abnormal_followup', reportId: 'report', itemId: 'lung-ct',
    sourceKey: 'screening:report:lung-ct', sourceSnapshot: { reportUpdatedAt: original, checkDate: '2026-10-19', item } };
  const report = { _id: 'report', title: '体检报告', checkDate: '2026-10-19',
    updatedAt: new Date('2026-10-25T00:00:00Z'), reportItems: [
      { ...item, classificationReviewedAt: new Date('2026-10-25T00:00:00Z') },
      { itemId: 'kidney', name: '肾脏超声', diagnosis: '肾结晶' },
    ] };
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [decision] }) }) };
  const Report = { findOne: () => ({ select: () => ({ lean: async () => report }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const CheckupReview = { find: () => ({ lean: async () => [] }) };
  const dependencies = { Decision, Report, User, CheckupReview };
  const unchanged = await load('patient', 2026, dependencies);
  assert.deepEqual(unchanged.stale, []);
  assert.deepEqual(unchanged.evidence.map(row => row.id), ['management_issue:decision']);

  report.reportItems[0].diagnosis = '肺结节增大';
  const changed = await load('patient', 2026, dependencies);
  assert.deepEqual(changed.stale, ['肺结节']);
  assert.deepEqual(changed.staleDecisionIds, ['decision']);
  report.reportItems.shift();
  assert.deepEqual((await load('patient', 2026, dependencies)).stale, ['肺结节']);
});

test('组合专项筛查按归类键引用全部子项，并在其中一项变化时失效', async () => {
  const key = '消化|胃部|胃功能3项';
  const items = [
    { itemId: 'pg1', name: '胃蛋白酶原I', value: '低', screeningKey: key },
    { itemId: 'pg2', name: '胃蛋白酶原II', value: '正常', screeningKey: key },
    { itemId: 'ratio', name: '比值', value: '低', screeningKey: key },
  ];
  const report = { _id: 'report', title: '胃功能检查', checkDate: '2026-03-20', reportItems: items.map(row => ({ ...row })) };
  assert.deepEqual(reportSourceItems(report, 'screening', key), report.reportItems);
  assert.deepEqual(reportSourceItems(report, 'report_item', key), []);
  assert.deepEqual(reportSourceItems(report, 'screening', '不存在'), []);
  const decision = { _id: 'decision', title: '胃功能异常', direction: 'abnormal_followup', reportId: 'report', itemId: key,
    sourceKey: `screening:report:${key}`, sourceSnapshot: { checkDate: report.checkDate, item: items[0], items } };
  const dependencies = {
    Decision: { find: () => ({ sort: () => ({ lean: async () => [decision] }) }) },
    Report: { findOne: () => ({ select: () => ({ lean: async () => report }) }) },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) },
    CheckupReview: { find: () => ({ lean: async () => [] }) },
  };
  assert.equal((await load('patient', 2026, dependencies)).evidence[0].content.sourceItems.length, 3);
  report.reportItems.reverse();
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, []);
  report.reportItems.reverse();
  report.reportItems[0].screeningKeys = [key];
  report.reportItems[0].reviewIssues = [];
  report.reportItems[0].conclusion = '';
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, []);
  report.reportItems[1].value = '异常';
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, ['decision']);
  report.reportItems[1].value = '正常';
  report.reportItems[2].screeningKey = '其他项目';
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, ['decision']);
});

test('单项专项筛查重新归类后仍识别原检查项，临床值改变仍需核对', async () => {
  const item = { itemId: 'cd61', name: 'CD61抗体(PAC-1)', value: '异常', screeningKey: '旧分类' };
  const report = { _id: 'report', checkDate: '2026-11-04', reportItems: [{ ...item, screeningKey: '新分类' }] };
  const decision = { _id: 'decision', title: 'CD61抗体(PAC-1)异常', direction: 'medical_treatment',
    reportId: 'report', itemId: '旧分类', sourceKey: 'screening:report:旧分类',
    sourceSnapshot: { checkDate: report.checkDate, item, items: [item] } };
  const dependencies = {
    Decision: { find: () => ({ sort: () => ({ lean: async () => [decision] }) }) },
    Report: { findOne: () => ({ select: () => ({ lean: async () => report }) }) },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) },
    CheckupReview: { find: () => ({ lean: async () => [] }) },
  };
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, []);
  report.reportItems[0].value = '正常';
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, ['decision']);
});

test('报告重新解析更换检查项内部ID，不重复阻断同名同结果的专项筛查决定', async () => {
  const original = { itemId: 'old-cd61', name: 'CD61抗体(PAC-1)', value: '异常', status: 'abnormal', screeningKey: '旧分类' };
  const report = { _id: 'report', checkDate: '2026-11-04', reportItems: [
    { ...original, itemId: 'new-cd61', screeningKey: '新分类' },
  ] };
  const decision = { _id: 'decision', title: 'CD61抗体(PAC-1)异常', direction: 'medical_treatment',
    reportId: 'report', itemId: '旧分类', sourceKey: 'screening:report:旧分类',
    sourceSnapshot: { checkDate: report.checkDate, item: original, items: [original] } };
  const dependencies = {
    Decision: { find: () => ({ sort: () => ({ lean: async () => [decision] }) }) },
    Report: { findOne: () => ({ select: () => ({ lean: async () => report }) }) },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) },
    CheckupReview: { find: () => ({ lean: async () => [] }) },
  };
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, []);
  report.reportItems.push({ ...report.reportItems[0], itemId: 'duplicate' });
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, ['decision']);
  report.reportItems.pop();
  report.reportItems[0].value = '正常';
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, ['decision']);
});

test('顾问已处理主诉可作为独立来源，来源修改后阻止旧目标继续带入', async () => {
  const at = new Date('2026-10-20T02:00:00Z');
  const decidedAt = new Date('2026-10-21T02:00:00Z');
  const record = { _id: 'symptom-1', value: '持续腹痛', note: '两天', recordedAt: at,
    symptomWorkflow: { status: 'manager_followup', decidedAt, decisionNote: '继续随访' } };
  const decision = { _id: 'decision-1', patientId: 'patient', year: 2026, symptomRecordId: record._id,
    sourceKey: `symptom:${record._id}`, title: '腹痛原因待核实', direction: 'ongoing_management', goal: '明确症状变化', action: '安排随访',
    sourceSnapshot: { value: record.value, note: record.note, recordedAt: at, decidedAt, decisionNote: record.symptomWorkflow.decisionNote } };
  const dependencies = {
    Decision: { find: () => ({ sort: () => ({ lean: async () => [decision] }) }) },
    Report: { findOne: () => { throw new Error('symptom must not query reports') } },
    HealthRecord: { findOne: () => ({ select: () => ({ lean: async () => record }) }) },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) },
    CheckupReview: { find: () => ({ lean: async () => [] }) },
  };
  const current = await load('patient', 2026, dependencies);
  assert.equal(current.evidence[0].content.sourceKind, 'symptom');
  assert.equal(current.evidence[0].content.goal, '明确症状变化');
  record.value = '症状已改写';
  const stale = await load('patient', 2026, dependencies);
  assert.equal(stale.evidence.length, 0);
  assert.deepEqual(stale.staleDecisionIds, ['decision-1']);
});

test('已解读普通检查项目逐项纳入，项目改写或解读撤回后旧决定失效', async () => {
  const item = { itemId: 'lab-1', name: '血常规', value: '待复核', status: 'attention' };
  const decision = { _id: 'decision-lab', title: '血常规结果待核实', direction: 'medical_treatment', reportId: 'report-lab',
    itemId: item.itemId, sourceKey: 'report_item:report-lab:lab-1',
    sourceSnapshot: { checkDate: '2026-10-19', item } };
  const report = { _id: 'report-lab', title: '检验报告', checkDate: '2026-10-19',
    advisorInterpretationConfirmedAt: new Date('2026-10-20'), documentCategory: 'exam_report', reportItems: [{ ...item }] };
  const dependencies = {
    Decision: { find: () => ({ sort: () => ({ lean: async () => [decision] }) }) },
    Report: { findOne: () => ({ select: () => ({ lean: async () => report }) }) },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) },
    CheckupReview: { find: () => ({ lean: async () => [] }) },
  };
  assert.equal((await load('patient', 2026, dependencies)).evidence[0].id, 'management_issue:decision-lab');
  report.reportItems[0].value = '已重核';
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, ['decision-lab']);
  report.reportItems[0].value = item.value;
  report.advisorInterpretationConfirmedAt = null;
  assert.deepEqual((await load('patient', 2026, dependencies)).staleDecisionIds, ['decision-lab']);
});

test('已纳入管理的旧备注复查期限在生成依据中恢复为一次复查', async () => {
  const item = { itemId: 'pg', name: '胃蛋白酶原', examDate: '2026-10-20' };
  const decision = { _id: 'decision', title: '胃蛋白酶原异常', direction: 'ongoing_management',
    note: '3个月复查', reviewedAt: '2026-10-26T10:00:00Z', reportId: 'report', itemId: 'pg', sourceKey: 'screening:report:pg',
    sourceSnapshot: { checkDate: '2026-10-19', item } };
  const report = { _id: 'report', title: '胃功能检查', checkDate: '2026-10-19', reportItems: [item] };
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [decision] }) }) };
  const Report = { findOne: () => ({ select: () => ({ lean: async () => report }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const result = await load('patient', 2026, { Decision, Report, User });
  assert.deepEqual(result.stale, []);
  assert.equal(result.evidence[0].content.legacyReviewNote, false);
  assert.deepEqual(result.evidence[0].content.reviewPlan, {
    kind: 'recheck', intervalMonths: 3, anchorDate: '2026-10-26', items: ['胃蛋白酶原'],
  });
  assert.equal(require('../src/utils/annualReviewPlan').reviewGroups(result.evidence)[0].dueDate, '2027-01-26');
});

test('撤销旧版归属后不再阻止年度方案生成', async () => {
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [{ _id: 'old', status: 'withdrawn' }] }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const result = await load('patient', 2026, { Decision, User });
  assert.deepEqual(result.inactiveIssueIds, ['management_issue:old']);
  assert.ok(!result.evidence.some(item => item.id === 'management_issue:old'));
  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.staleDecisionIds, []);
});

test('同报告同问题同方向已归到检查项时，旧整份报告归属自动让位', async () => {
  const updatedAt = new Date('2026-10-20T00:00:00Z');
  const legacy = { _id: 'legacy', title: '脂肪肝', direction: 'ongoing_management', reportId: 'report',
    sourceKey: 'screening_report:report', sourceSnapshot: { reportUpdatedAt: updatedAt } };
  const current = { _id: 'item', title: '脂肪肝', direction: 'ongoing_management', reportId: 'report', itemId: 'liver-ultrasound',
    sourceKey: 'screening:report:liver-ultrasound', sourceSnapshot: { reportUpdatedAt: updatedAt, item: { itemId: 'liver-ultrasound', name: '肝脏超声' } } };
  assert.deepEqual(effectiveDecisions([legacy, current]).map(row => row._id), ['item']);
  assert.equal(effectiveDecisions([legacy, { ...current, title: '肾结晶' }]).length, 2);
  assert.equal(effectiveDecisions([legacy, { ...current, direction: 'abnormal_followup' }]).length, 2);
  assert.deepEqual(effectiveDecisions([legacy, { ...current, sourceKey: 'report_item:report:liver-ultrasound' }]).map(row => row._id), ['item']);
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [legacy, current] }) }) };
  const Report = { findOne: () => ({ select: () => ({ lean: async () => ({ _id: 'report', title: '体检报告', updatedAt, reportItems: [
    { itemId: 'liver-ultrasound', screeningKey: 'liver', name: '肝脏超声' }, { screeningKey: 'kidney', name: '肾脏超声' },
  ] }) }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const result = await load('patient', 2026, { Decision, Report, User });
  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.evidence.map(row => row.id), ['management_issue:item']);
});

test('同一检查项重新归属并经顾问再次确认后，旧归属不再阻断方案', () => {
  const old = { _id: 'old', reportId: 'report', itemId: 'old-key', sourceKey: 'screening:report:old-key',
    title: 'CD61抗体(PAC-1)异常', directions: ['medical_treatment'], reviewedAt: '2026-11-19T00:00:00Z',
    sourceSnapshot: { item: { itemId: 'old-id', name: 'CD61抗体(PAC-1)', value: '异常' } } };
  const current = { ...old, _id: 'new', itemId: 'new-key', sourceKey: 'screening:report:new-key',
    reviewedAt: '2026-11-20T00:00:00Z', sourceSnapshot: { item: { itemId: 'new-id', name: 'CD61抗体(PAC-1)', value: '异常' } } };
  assert.deepEqual(effectiveDecisions([old, current]).map(row => row._id), ['new']);
  assert.deepEqual(effectiveDecisions([old, { ...current, title: '另一问题' }]).map(row => row._id), ['old', 'new']);
  assert.deepEqual(effectiveDecisions([old, { ...current, sourceSnapshot: { item: { name: '另一项检查' } } }]).map(row => row._id), ['old', 'new']);
});

test('已审核 AI 缺口必须逐项处理，确需检查进入完善检查且不能被复查替代', async () => {
  const summary = { byYear: { 2026: { records: [{ scope: 'doctor', generatedAt: '2026-10-24',
    sections: { checkup_completeness: { missing: ['补做肾脏超声', '补传已做的肺部CT'] } },
    sectionReviews: { checkup_completeness: { status: 'approved', approvedAt: '2026-10-24T04:00:00Z' } },
  }] } } };
  const { approvedItems } = require('../src/utils/aiHealthCheckupItems');
  const [exam, records] = approvedItems(summary, 2026).items;
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [] }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: summary }) }) }) };
  const CheckupReview = { find: () => ({ lean: async () => [
    { _id: 'ai1', sourceKey: exam.sourceKey, itemText: exam.text, disposition: 'needs_exam', title: '肾脏超声', note: '核对后需检查' },
    { _id: 'ai2', sourceKey: records.sourceKey, itemText: records.text, disposition: 'request_records', note: '检查已完成，补传报告' },
  ] }) };
  const result = await load('patient', 2026, { Decision, User, CheckupReview });
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].content.direction, 'checkup_completion');
  assert.match(validatePlanCoverage({ abnormal_followup: { records: [{ sourceIds: [result.evidence[0].id] }] } }, result.evidence), /肾脏超声/);
  assert.equal(validatePlanCoverage({ checkup_completion: { records: [{ sourceIds: [result.evidence[0].id] }] } }, result.evidence), '');
  const newSummary = structuredClone(summary);
  newSummary.byYear[2026].records[0].sections.checkup_completeness.missing.push('补做心脏超声');
  const next = approvedItems(newSummary, 2026);
  assert.notEqual(next.version, approvedItems(summary, 2026).version);
});

test('已审核 AI 整理的明确待补检查直接进入草稿，重复描述和已做项目不重复复核', async () => {
  const summary = { byYear: { 2026: { records: [{ scope: 'doctor', generatedAt: '2026-10-24',
    sections: {
      checkup_completeness: { missing: ['规范肝脏超声（确认是否已完成）', '结肠镜', '胃镜（含食管）', '低剂量胸部CT（LDCT）', '幽门螺杆菌年度复查（虽2026年阴性，但需连续3年阴性才可降低频次）'] },
      tumor_risk: { missing: ['肺癌：胸部CT平扫已做（2026-10-24）', '结直肠癌：肠镜未做，建议补做', '肝癌：肝脏超声已做（2026-10-24）', '胃癌：胃镜未做；幽门螺杆菌建议每年复查', '食管癌：胃镜（含食管段）未做'], summary: '肠镜和胃镜为优先补做项目。' },
    }, sectionReviews: { checkup_completeness: { status: 'approved', approvedAt: '2026-10-24T04:00:00Z' }, tumor_risk: { status: 'approved', approvedAt: '2026-10-24T04:00:00Z' } },
  }] } } };
  const { approvedItems } = require('../src/utils/aiHealthCheckupItems');
  const items = approvedItems(summary, 2026).items;
  assert.equal(items.length, 5);
  assert.equal(items.filter(item => item.autoDisposition === 'needs_exam').length, 4);
  assert.equal(items.filter(item => item.autoDisposition === 'request_records').length, 1);
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [] }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: summary }) }) }) };
  const CheckupReview = { find: () => ({ lean: async () => [] }) };
  const result = await load('patient', 2026, { Decision, User, CheckupReview });
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.evidence.length, 4);
  assert.deepEqual(result.evidence.map(row => row.content.problem), ['结肠镜', '胃镜（含食管）', '低剂量胸部CT', '幽门螺杆菌复查']);
});

test('明确替代后仅采用新决定的方向，撤销新决定也不会恢复旧方向', () => {
  const old = { _id: 'old', direction: 'ongoing_management' };
  const current = { _id: 'new', supersedes: ['old'], direction: 'medical_treatment' };
  const other = { _id: 'other', direction: 'monitoring' };
  assert.deepEqual(effectiveDecisions([old, other, current]), [other, current]);
  assert.deepEqual(effectiveDecisions([old, other, { ...current, status: 'withdrawn' }]), [other]);
});
