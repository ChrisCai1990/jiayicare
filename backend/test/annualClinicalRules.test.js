const test = require('node:test'), assert = require('node:assert/strict');
const { reportTimeline, validateClinicalRules, clinicalRulesPrompt, consolidateSameDayConsultations } = require('../src/utils/annualClinicalRules');
const { customerModuleData, buildAnnualPlanDisplayItems } = require('../src/utils/annualPlanPresentation');
const reports = [
  { _id: 'jan', title: '阴道超声', checkDate: '2026-01-23', reportItems: [{ name: '子宫附件超声', value: '既往结果' }] },
  { _id: 'jun', title: '年度体检', checkDate: '2026-06-01', reportItems: [{ name: '子宫附件彩超', conclusion: '较新结果' }] },
  { _id: 'endo', title: '胃镜', checkDate: '2024-12-09', reportItems: [] },
];
const timeline = reportTimeline(reports);
test('confirmed page date is used for every item in a multi-day report', () => {
  const rows = reportTimeline([{ _id: 'combined', checkDate: '', pageDates: { 40: '2026-09-23', 41: '2026-09-24' }, reportItems: [
    { name: '肝脏超声', sourcePage: 40, examDate: '' },
    { name: '胆囊超声', sourcePage: 40, examDate: '2026-09-22' },
    { name: '心脏超声', sourcePage: 41 },
  ] }]);
  assert.deepEqual(rows.map(row => [row.name, row.date, row.dateSource]), [
    ['心脏超声', '2026-09-24', '页检查日期'],
    ['肝脏超声', '2026-09-23', '页检查日期'],
    ['胆囊超声', '2026-09-23', '页检查日期'],
  ]);
});
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
test('same-day same-clinic consultation cannot be split by a merge note or a hospital alias', () => {
  const first = { standardPlanId: 'template', sourceIds: ['review:r'], visit_time: '2026-11-10', hospital: '浙二医院', department: '消化内科', reason: '核实直肠息肉', scheduleSeparationReason: '同一天协调合并办理' };
  const second = { ...first, hospital: '浙江大学医学院附属第二医院', reason: '核实盲肠管状腺瘤', scheduleSeparationReason: '合并至同一次就诊' };
  assert.throws(() => validateClinicalRules({ medical_treatment: [first, second] }, []), /拆成多条/);
  assert.equal(validateClinicalRules({ medical_treatment: [{ ...first, reason: '核实直肠息肉及盲肠管状腺瘤', scheduleSeparationReason: '' }] }, []).medical_treatment.length, 1);
  assert.equal(validateClinicalRules({ medical_treatment: [first, { ...second, hospital: '浙江医院' }] }, []).medical_treatment.length, 2);
  assert.equal(validateClinicalRules({ medical_treatment: [first, { ...second, scheduleSeparationReason: '不同医生分别预约，需两次就诊' }] }, []).medical_treatment.length, 2);
});
test('same-day consultation consolidation retains both issues and timing sources', () => {
  const first = { standardPlanId: 'template', sourceIds: ['review:r'], issueId: 'rectal', visit_time: '2026-11-10', hospital: '浙二医院', department: '消化内科', reason: '核实直肠息肉', timingSourceId: 'report:a', timingBaseDate: '2026-06-09' };
  const second = { ...first, issueId: 'cecal', hospital: '浙江大学医学院附属第二医院', reason: '核实盲肠腺瘤', timingSourceId: 'report:b', timingBaseDate: '2026-06-11' };
  const raw = { medical_treatment: [first, second] };
  const merged = consolidateSameDayConsultations(raw);
  assert.equal(merged.medical_treatment.length, 1);
  assert.deepEqual(merged.medical_treatment[0].issueIds, ['rectal', 'cecal']);
  assert.match(merged.medical_treatment[0].reason, /直肠息肉.*盲肠腺瘤/);
  assert.equal(merged.medical_treatment[0].additionalTimingSources.length, 2);
  assert.equal(consolidateSameDayConsultations(merged), merged);
  assert.equal(raw.medical_treatment.length, 2);
  assert.throws(() => validateClinicalRules(merged, [{ id: 'report:a', date: '2026-06-09', group: '直肠' }]), /日期与报告不一致/);
  assert.equal(validateClinicalRules(merged, [{ id: 'report:a', date: '2026-06-09', group: '直肠' }, { id: 'report:b', date: '2026-06-11', group: '盲肠' }]), merged);
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

test('draft scheduling is advisory without altering dates or bypassing report contradictions', () => {
  const raw={medical_treatment:[{visit_time:'2026-11-05',notes:'保留原说明'}], abnormal_followup:[{time:'2026-11-10'}]};
  validateClinicalRules(raw,[],[],{scheduleAsNote:true});
  const once=JSON.stringify(raw); validateClinicalRules(raw,[],[],{scheduleAsNote:true});
  assert.equal(JSON.stringify(raw),once);
  assert.match(raw.medical_treatment[0].notes,/保留原说明/);
  assert.match(raw.abnormal_followup[0].notes,/预约统筹提示/);
  assert.equal(raw.medical_treatment[0].visit_time,'2026-11-05');
  raw.medical_treatment[0].timingBaseDate='2026-01-01';
  assert.throws(()=>validateClinicalRules(raw,[],[],{scheduleAsNote:true}),/原检查日期/);
});
test('annual draft cannot label a different hemoglobin fraction as HbA1c', () => {
  const audited = reportTimeline([
    { _id: 'recent', checkDate: '2026-09-05', reportItems: [{ name: '糖化血红蛋白A1', value: '7.0' }, { name: '*糖化血红蛋白A1c', value: '5.6' }] },
    { _id: 'older', checkDate: '2026-06-01', reportItems: [{ name: '糖化血红蛋白A1', value: '7.5' }, { name: '糖化血红蛋白A1c', value: '6.0' }] },
  ]);
  const raw = { abnormal_followup: [{ reason: 'HbA1c由≤6.5%升至7.5%，需复查' }] };
  assert.throws(() => validateClinicalRules(raw, audited), /HbA1c 7.5%与已审核原始报告不符/);
  raw.abnormal_followup[0].reason = '2026-09-05 HbA1c 5.6%，较2026-06-01的6.0%下降';
  assert.equal(validateClinicalRules(raw, audited), raw);
  raw.abnormal_followup[0].reason = '最新HbA1c 6.0%';
  assert.throws(() => validateClinicalRules(raw, audited), /最新HbA1c应以2026-09-05报告的5.6%为准/);
});
test('customer legacy raw data and display cards exclude internal timing reasoning without altering staff data', () => {
  const data = { medical_treatment: { records: [{ reason: '就医', timingReason: '内部推理', notes: '内部备注', timingSourceId: 'report:x', visit_time: '2026-10-01' }] }, annual_checkup: { enabled: true, focus: '关注', timingReason: '内部推理' } };
  const clean = customerModuleData(data);
  assert.ok(!JSON.stringify(clean).includes('内部')); assert.ok(!JSON.stringify(buildAnnualPlanDisplayItems(data)).includes('内部'));
  assert.equal(clean.medical_treatment.records[0].visit_time, '2026-10-01');
  assert.equal(data.medical_treatment.records[0].timingReason, '内部推理');
});
