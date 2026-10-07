const test = require('node:test');
const assert = require('node:assert/strict');
const { OUTPATIENT_RECORD_PARSE_PROMPT, normalizeOutpatientPage, mergeOutpatientPages, supplementOutpatientDraft, isExplicitExamReport, hasOutpatientRecordContent } = require('../src/utils/outpatientRecordExtraction');

test('补提只填空字段并保留人工审核内容', () => {
  const result = supplementOutpatientDraft(
    { chiefComplaint: '人工核对主诉', sourceReviewed: true, reviewConclusion: '人工结论' },
    { chiefComplaint: 'AI 主诉', treatmentPlan: '原件处理方案', sourceReviewed: false, reviewConclusion: '' },
  );
  assert.equal(result.chiefComplaint, '人工核对主诉');
  assert.equal(result.treatmentPlan, '原件处理方案');
  assert.equal(result.sourceReviewed, true);
  assert.equal(result.reviewConclusion, '人工结论');
});

test('outpatient extraction produces clinical review draft requiring source review', () => {
  const first = normalizeOutpatientPage({ visitDate: '2026-09-23', visitType:'复诊', chiefComplaint: '原文主诉', presentIllness:'症状三日，无发热', pastHistory:'既往高血压', allergyHistory:'青霉素过敏', diagnoses: ['原文诊断'], reviewIssues: [] });
  const second = normalizeOutpatientPage({ familyHistory:'父亲患病', vitalSigns:'血压 130/80', otherRecordContent:'病历备注：已告知', treatmentPlan: '原文处理方案', diagnoses: ['原文诊断'], reviewIssues: ['用药文字不清'] });
  const { draft, reviewIssues } = mergeOutpatientPages([first, second]);
  assert.equal(draft.chiefComplaint, '原文主诉');
  assert.equal(draft.visitType, '复诊');
  assert.equal(draft.treatmentPlan, '原文处理方案');
  assert.equal(draft.presentIllness, '症状三日，无发热');
  assert.equal(draft.pastHistory, '既往高血压');
  assert.equal(draft.allergyHistory, '青霉素过敏');
  assert.equal(draft.familyHistory, '父亲患病');
  assert.equal(draft.vitalSigns, '血压 130/80');
  assert.equal(draft.otherRecordContent, '病历备注：已告知');
  assert.deepEqual(draft.diagnoses, ['原文诊断']);
  assert.equal(draft.sourceReviewed, false);
  assert.equal(draft.reviewConclusion, '');
  assert.deepEqual(reviewIssues, ['用药文字不清']);
  assert.match(OUTPATIENT_RECORD_PARSE_PROMPT, /不得把病历拆成体检/);
});

test('empty or malformed outpatient output cannot replace an existing report', () => {
  assert.throws(() => mergeOutpatientPages([normalizeOutpatientPage({ items: [{ name: '血常规', value: '正常' }] })]), /未提取到可核对的文字/);
  assert.throws(() => normalizeOutpatientPage(null), /未返回有效结构/);
});

test('legacy audited record without structured fields must be extracted from its attachment', () => {
  assert.equal(hasOutpatientRecordContent(null), false);
  assert.equal(hasOutpatientRecordContent({ sourceReviewed:true, reviewConclusion:'已审核' }), false);
  assert.equal(hasOutpatientRecordContent({ diagnoses:['原件诊断'] }), true);
  assert.equal(hasOutpatientRecordContent({ presentIllness:'头晕三日' }), true);
});

test('only an explicit printed exam report title changes the parser route', () => {
  assert.equal(isExplicitExamReport([normalizeOutpatientPage({ documentKind: 'exam_report', documentTitle: '耳鼻咽喉内窥镜检查报告单' })]), true);
  assert.equal(isExplicitExamReport([normalizeOutpatientPage({ documentKind: 'exam_report', documentTitle: '门诊病历', testsAndOrders: '检查报告待取' })]), false);
  assert.equal(isExplicitExamReport([normalizeOutpatientPage({ documentKind: 'exam_report', documentTitle: '' })]), false);
});
