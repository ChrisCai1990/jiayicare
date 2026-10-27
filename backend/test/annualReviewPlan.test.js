const test = require('node:test');
const assert = require('node:assert/strict');
const { addMonths, reviewPlanFromInput, legacyReviewNote, legacyReviewPlan, reviewGroups } = require('../src/utils/annualReviewPlan');
const { normalizeConfirmedManagement } = require('../src/utils/annualOutputRepair');
const { validateAnnualRaw } = require('../src/utils/annualGenerationConsistency');
const { validatePlanCoverage } = require('../src/utils/annualManagementEvidence');
const { buildAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');

const catalog = [
  { id: 'recheck', name: '定期复查', category: 'abnormal_followup' },
  { id: 'daily', name: '【日常跟进】', category: 'personalized' },
  { id: 'annual', name: '年度体检', category: 'annual_checkup' },
];
const source = (id, item, months = 3, day = '2026-10-26', department = '消化内科') => ({
  id: `management_issue:${id}`, content: { problem: `${item}异常`, direction: 'ongoing_management',
    reviewPlan: { kind: 'recheck', intervalMonths: months, anchorDate: day, items: [item], department } },
});
const empty = evidence => ({ medical_treatment: [], checkup_completion: [], abnormal_followup: [], vaccine: [], annual_checkup: {}, templateNodes: [],
  evidenceCoverage: evidence.map(item => ({ sourceId: item.id, status: 'included', reason: '顾问确认' })) });

test('复查间隔按自然月计算，新录入仍须明确项目和起算日期', () => {
  assert.equal(addMonths('2026-10-31', 3), '2027-01-31');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(legacyReviewNote('3个月复查'), true);
  assert.throws(() => reviewPlanFromInput({ kind: 'recheck', intervalMonths: 3, anchorDate: '2026-10-26', items: '' }), /逐项填写/);
  assert.throws(() => reviewPlanFromInput({ kind: 'recheck', intervalMonths: 3, items: '肝超声' }), /起算日期/);
  assert.throws(() => reviewPlanFromInput({ kind: 'recheck', intervalMonths: 3, anchorDate: '2026-10-26', items: '肝超声' }), /专科/);
  assert.deepEqual(reviewPlanFromInput({ kind: 'recheck', intervalMonths: 3, anchorDate: '2026-10-26', items: '肝超声、ALT、肝超声', department: '消化内科' }).items, ['肝超声', 'ALT']);
});

test('旧顾问备注的单一复查期限使用来源项目及明确起算日期', () => {
  const report = { checkDate: '2026-10-20', reportItems: [{ name: '胃蛋白酶原' }] };
  const decision = { note: '3个月复查', reviewedAt: '2026-10-26T10:00:00Z',
    sourceSnapshot: { item: { name: '胃蛋白酶原', examDate: '2026-10-21' } } };
  assert.deepEqual(legacyReviewPlan(decision, report), {
    kind: 'recheck', intervalMonths: 3, anchorDate: '2026-10-26', items: ['胃蛋白酶原'],
  });
  assert.equal(legacyReviewPlan({ ...decision, note: '三个月复查' }, report).intervalMonths, 3);
  assert.equal(legacyReviewPlan({ ...decision, note: '检查后3个月复查' }, report).anchorDate, '2026-10-21');
  assert.equal(legacyReviewPlan({ ...decision, note: '3个月及6个月复查' }, report), null);
  assert.equal(legacyReviewPlan({ ...decision, sourceSnapshot: {} }, { ...report, reportItems: [{ name: '胃蛋白酶原' }, { name: '胃镜' }] }), null);
  assert.equal(legacyReviewPlan({ ...decision, reviewPlan: { kind: 'recheck', intervalMonths: 6 } }, report), null);
});

test('同月多问题归为一条复查，来源、日期和全部项目进入客户可见安排', () => {
  const evidence = Array.from({ length: 8 }, (_, index) => source(index, `项目${index + 1}`));
  const raw = empty(evidence);
  raw.templateNodes = evidence.map(item => ({ standardPlanId: 'daily', executionDate: '2026-10-26',
    matchReason: '持续管理', basisSummary: '已审来源', sourceIds: [item.id] }));
  raw.medical_treatment = [{ standardPlanId: 'visit', reason: '不应保留', basisSummary: '已审来源', sourceIds: [evidence[0].id] }];
  const result = normalizeConfirmedManagement(raw, evidence, catalog);
  assert.equal(result.abnormal_followup.length, 1);
  assert.equal(result.abnormal_followup[0].time, '2027-01-26');
  assert.equal(result.abnormal_followup[0].reviewItems.length, 8);
  assert.equal(result.abnormal_followup[0].department, '消化内科');
  assert.equal(result.abnormal_followup[0].serviceMode, 'single');
  assert.equal(result.abnormal_followup[0].serviceType, 'proxy_booking');
  assert.match(result.abnormal_followup[0].customerAction, /先到消化内科就诊.*医生评估并开具/);
  const serviceTasks = buildAnnualPlanServiceTasks({ confirmedAt: new Date(), moduleData: {
    abnormal_followup: { records: result.abnormal_followup }, medical_treatment: { records: result.medical_treatment },
  } }, { assignedHealthPlanner: 'planner-1' });
  assert.equal(serviceTasks.length, 1);
  assert.equal(serviceTasks[0].formData.serviceRequest.moduleKey, 'abnormal_followup');
  assert.deepEqual(result.abnormal_followup[0].sourceIds, evidence.map(item => item.id));
  assert.equal(result.templateNodes.length, 0);
  assert.equal(result.medical_treatment.length, 0);
  validateAnnualRaw(result, catalog, evidence);
  assert.equal(validatePlanCoverage({ abnormal_followup: { records: result.abnormal_followup } }, evidence), '');
  const split = result.abnormal_followup.map(row => ({ ...row, sourceIds: row.sourceIds.slice(0, 4), reviewItems: row.reviewItems.slice(0, 4) }));
  split.push({ ...result.abnormal_followup[0], sourceIds: result.abnormal_followup[0].sourceIds.slice(4), reviewItems: result.abnormal_followup[0].reviewItems.slice(4) });
  assert.match(validatePlanCoverage({ abnormal_followup: { records: split } }, evidence), /一次完整就诊安排/);
  assert.throws(() => normalizeConfirmedManagement({ ...raw, medical_treatment: [{ standardPlanId: 'visit', sourceIds: [evidence[0].id, 'other'] }] }, evidence, catalog), /混入同一事项/);
});

test('不同复查周期分别安排，年度重复项目须有独立依据', () => {
  const evidence = [source('a', '肝超声'), source('b', '胃镜', 6)];
  assert.equal(reviewGroups(evidence).length, 2);
  const result = normalizeConfirmedManagement(empty(evidence), evidence, catalog);
  assert.deepEqual(result.abnormal_followup.map(row => row.time), ['2027-01-26', '2027-04-26']);
  result.annual_checkup = { standardPlanId: 'annual', focus: '胃镜', date: '2027-10-26',
    basisSummary: '已审来源', sourceIds: ['other'] };
  result.evidenceCoverage.push({ sourceId: 'other', status: 'included', reason: '独立来源' });
  assert.throws(() => validateAnnualRaw(result, catalog, [...evidence, { id: 'other' }]), /重复列入/);
});

test('同月不同专科分别就诊，未记录专科的旧决定不被擅自合并', () => {
  const evidence = [source('a', '胃蛋白酶原', 3, '2026-10-26', '消化内科'),
    source('b', '肝超声', 3, '2026-10-26', '肝病科'),
    source('c', '尿酸', 3, '2026-10-26', '')];
  const groups = reviewGroups(evidence);
  assert.equal(groups.length, 3);
  const result = normalizeConfirmedManagement(empty(evidence), evidence, catalog);
  assert.deepEqual(result.abnormal_followup.map(row => row.department), ['消化内科', '肝病科', '']);
  assert.ok(result.abnormal_followup.every(row => row.bookingRequired));
  assert.equal(validatePlanCoverage({ abnormal_followup: { records: result.abnormal_followup } }, evidence), '');
});
