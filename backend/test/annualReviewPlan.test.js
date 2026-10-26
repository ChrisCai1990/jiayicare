const test = require('node:test');
const assert = require('node:assert/strict');
const { addMonths, reviewPlanFromInput, legacyReviewNote, reviewGroups } = require('../src/utils/annualReviewPlan');
const { normalizeConfirmedManagement } = require('../src/utils/annualOutputRepair');
const { validateAnnualRaw } = require('../src/utils/annualGenerationConsistency');
const { validatePlanCoverage } = require('../src/utils/annualManagementEvidence');

const catalog = [
  { id: 'recheck', name: '定期复查', category: 'abnormal_followup' },
  { id: 'daily', name: '【日常跟进】', category: 'personalized' },
  { id: 'annual', name: '年度体检', category: 'annual_checkup' },
];
const source = (id, item, months = 3, day = '2026-10-26') => ({
  id: `management_issue:${id}`, content: { problem: `${item}异常`, direction: 'ongoing_management',
    reviewPlan: { kind: 'recheck', intervalMonths: months, anchorDate: day, items: [item] } },
});
const empty = evidence => ({ medical_treatment: [], checkup_completion: [], abnormal_followup: [], vaccine: [], annual_checkup: {}, templateNodes: [],
  evidenceCoverage: evidence.map(item => ({ sourceId: item.id, status: 'included', reason: '顾问确认' })) });

test('复查间隔按自然月计算，旧自由文本不得静默当作完整计划', () => {
  assert.equal(addMonths('2026-10-31', 3), '2027-01-31');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(legacyReviewNote('3个月复查'), true);
  assert.throws(() => reviewPlanFromInput({ kind: 'recheck', intervalMonths: 3, anchorDate: '2026-10-26', items: '' }), /逐项填写/);
  assert.throws(() => reviewPlanFromInput({ kind: 'recheck', intervalMonths: 3, items: '肝超声' }), /起算日期/);
  assert.deepEqual(reviewPlanFromInput({ kind: 'recheck', intervalMonths: 3, anchorDate: '2026-10-26', items: '肝超声、ALT、肝超声' }).items, ['肝超声', 'ALT']);
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
  assert.deepEqual(result.abnormal_followup[0].sourceIds, evidence.map(item => item.id));
  assert.equal(result.templateNodes.length, 0);
  assert.equal(result.medical_treatment.length, 0);
  validateAnnualRaw(result, catalog, evidence);
  assert.equal(validatePlanCoverage({ abnormal_followup: { records: result.abnormal_followup } }, evidence), '');
  const split = result.abnormal_followup.map(row => ({ ...row, sourceIds: row.sourceIds.slice(0, 4), reviewItems: row.reviewItems.slice(0, 4) }));
  split.push({ ...result.abnormal_followup[0], sourceIds: result.abnormal_followup[0].sourceIds.slice(4), reviewItems: result.abnormal_followup[0].reviewItems.slice(4) });
  assert.match(validatePlanCoverage({ abnormal_followup: { records: split } }, evidence), /一次完整安排/);
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
