const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualPlanPreparationChecklist } = require('../src/utils/annualPlanPreparationChecklist');

const assignedPatient = {
  onboardingCompleted: true,
  assignedFamilyDoctor: 'doctor',
  assignedHealthManager: 'manager',
  assignedHealthPlanner: 'planner',
};

test('首次年度方案在必需准备项缺失时保持阻断', () => {
  const result = buildAnnualPlanPreparationChecklist({ patient: assignedPatient });
  assert.equal(result.ready, false);
  assert.ok(result.blockingKeys.includes('audited_reports'));
  assert.ok(result.blockingKeys.includes('medications'));
  assert.ok(result.blockingKeys.includes('assessment_scope'));
});

test('健康顾问可对无法取得的关键资料留痕后放行该资料项', () => {
  const preparation = {
    year: 2026,
    medicationStatus: 'none', supplementStatus: 'none',
    requiredAssessmentDomains: ['生长发育'], advisorReadyConfirmedAt: new Date(),
    waivers: [{ key: 'audited_reports', reason: '首次服务暂无历史报告', waivedAt: new Date() }],
  };
  const assessments = [{ purpose: 'annual_input', domain: '生长发育', status: 'approved' }];
  const result = buildAnnualPlanPreparationChecklist({ patient: assignedPatient, preparation, assessments });
  assert.equal(result.ready, true);
  assert.equal(result.items.find(item => item.key === 'audited_reports').waived, true);
});

test('所有必需专业领域都必须存在已审核年度输入评估', () => {
  const preparation = {
    medicationStatus: 'documented', supplementStatus: 'documented',
    requiredAssessmentDomains: ['心血管', '营养'], advisorReadyConfirmedAt: new Date(),
  };
  const result = buildAnnualPlanPreparationChecklist({
    patient: assignedPatient, preparation, auditedReportCount: 1,
    assessments: [{ purpose: 'annual_input', domain: '心血管', status: 'approved' }],
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.blockingKeys, ['assessment:营养']);
});

test('固定三岗位未分配时不得生成正式年度方案', () => {
  const preparation = {
    medicationStatus: 'none', supplementStatus: 'none', requiredAssessmentDomains: ['综合'], advisorReadyConfirmedAt: new Date(),
  };
  const result = buildAnnualPlanPreparationChecklist({
    patient: { onboardingCompleted: true }, preparation, auditedReportCount: 1,
    assessments: [{ purpose: 'annual_input', domain: '综合', status: 'approved' }],
  });
  assert.deepEqual(result.blockingKeys.slice(0, 3), ['family_doctor', 'health_manager', 'health_planner']);
});
