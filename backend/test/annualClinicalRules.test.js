const test = require('node:test'), assert = require('node:assert/strict');
const { reportTimeline, validateClinicalRules, clinicalRulesPrompt } = require('../src/utils/annualClinicalRules');
const { customerModuleData, buildAnnualPlanDisplayItems } = require('../src/utils/annualPlanPresentation');
const reports = [
  { _id: 'jan', title: '阴道超声', checkDate: '2026-01-23', reportItems: [{ name: '子宫附件超声', value: '既往结果' }] },
  { _id: 'jun', title: '年度体检', checkDate: '2026-06-01', reportItems: [{ name: '子宫附件彩超', conclusion: '较新结果' }] },
  { _id: 'endo', title: '胃镜', checkDate: '2024-12-09', reportItems: [] },
];
const timeline = reportTimeline(reports);
test('latest item evidence includes comprehensive report; preserves method and exact source date', () => {
  assert.equal(timeline[0].date, '2026-06-01'); assert.equal(timeline[0].name, '子宫附件彩超');
  assert.equal(timeline[0].modality, ''); assert.equal(timeline[0].group, timeline[1].group);
  assert.equal(timeline[2].name, '胃镜'); assert.equal(timeline[2].date, '2024-12-09');
  const [item] = reportTimeline([{ _id: 'x', checkDate: '2026-06-01', createdAt: '2026-09-23', reportItems: [{ name: '检查', examDate: '2026-05-30' }] }]);
  assert.equal(item.date, '2026-05-30');
  assert.equal(reportTimeline([{ _id: 'x', checkDate: '2026-06-01', reportItems: [{ name: '检查', examDate: '未知' }] }])[0].date, '');
  assert.equal(reportTimeline([{ _id: 'x', title: '未知日期', createdAt: '2026-09-23' }])[0].date, '');
  assert.deepEqual(reportTimeline([...reports].reverse()), timeline);
  const pathology = reportTimeline([{ _id: 'p', title: '胃镜病理', type: 'pathology', checkDate: '2024-12-10', reportItems: [{ name: '胃镜' }] }]);
  assert.notEqual(pathology[0].group, timeline[2].group);
});
test('fabricated/mismatched dates blocked; old related evidence requires explanation, not silent replacement', () => {
  const row = { timingBaseDate: '2026-01-01', timingSourceId: 'report:jan:0' };
  const raw = { medical_treatment: [row] };
  assert.throws(() => validateClinicalRules(raw, timeline), /日期与报告不一致/);
  row.timingBaseDate = '2026-01-23';
  assert.throws(() => validateClinicalRules(raw, timeline), /较新相关检查/);
  row.dateSelectionReason = '6月彩超未明确途径，需顾问核对，保留原阴道超声依据';
  assert.equal(validateClinicalRules(raw, timeline), raw);
  row.timingSourceId = 'report:jun:0'; row.timingBaseDate = '2026-06-01'; delete row.dateSelectionReason;
  assert.equal(validateClinicalRules(raw, timeline), raw);
});
test('nearby cross-module appointments require coordination or explicit separation, never auto-delay', () => {
  const raw = { medical_treatment: [{ visit_time: '2026-10-01' }], checkup_completion: [{ time: '2026-10-04' }] };
  assert.throws(() => validateClinicalRules(raw, []), /尚未统筹/);
  raw.checkup_completion[0].time = '2026-10-01'; assert.equal(validateClinicalRules(raw, []), raw);
  raw.checkup_completion[0].time = '2026-10-04'; raw.checkup_completion[0].scheduleSeparationReason = '需先完成就医评估后由医生开单';
  assert.equal(validateClinicalRules(raw, []), raw); assert.equal(raw.medical_treatment[0].visit_time, '2026-10-01');
});
test('annual focus cannot repeat near-term checks without independent sourced repeat reason', () => {
  const raw = { checkup_completion: [{ items: '骨密度检测（DXA）', time: '2026-10-01' }], annual_checkup: { date: '2027-05-01', focus: '骨密度检测（DXA，已有近期安排）' } };
  assert.throws(() => validateClinicalRules(raw, [], [{ id: 'review:1' }]), /重复近期检查/);
  raw.annual_checkup.futureRepeatReason = '有独立复查医嘱'; raw.annual_checkup.futureRepeatSourceId = 'fake';
  assert.throws(() => validateClinicalRules(raw, [], [{ id: 'review:1' }]), /重复近期检查/);
  raw.annual_checkup.futureRepeatSourceId = 'review:1'; assert.equal(validateClinicalRules(raw, [], [{ id: 'review:1' }]), raw);
  raw.annual_checkup.focus = '有依据的胃肠镜复查'; delete raw.annual_checkup.futureRepeatReason;
  assert.equal(validateClinicalRules(raw, []), raw);
  assert.match(clinicalRulesPrompt, /胃镜\/肠镜/); assert.match(clinicalRulesPrompt, /不得.*按年重复/);
});
test('customer legacy raw data and display cards exclude internal timing reasoning without altering staff data', () => {
  const data = { medical_treatment: { records: [{ reason: '就医', timingReason: '内部推理', notes: '内部备注', timingSourceId: 'report:x', visit_time: '2026-10-01' }] }, annual_checkup: { enabled: true, focus: '关注', timingReason: '内部推理' } };
  const clean = customerModuleData(data);
  assert.ok(!JSON.stringify(clean).includes('内部')); assert.ok(!JSON.stringify(buildAnnualPlanDisplayItems(data)).includes('内部'));
  assert.equal(clean.medical_treatment.records[0].visit_time, '2026-10-01');
  assert.equal(data.medical_treatment.records[0].timingReason, '内部推理');
});
