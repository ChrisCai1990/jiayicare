const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { draftIssues } = require('../src/utils/annualDraftIssues');

test('已保存草稿一次列出多个执行日期问题并保留编辑行号', () => {
  const issues = draftIssues({ abnormal_followup: { records: [
    { reviewItems: ['心脏超声'], time: '' }, { reviewItems: ['血脂'], time: '2025-01-01' }
  ] } }, '2026-11-26');
  assert.deepEqual(issues.map(({key,index,title}) => [key,index,title]), [
    ['abnormal_followup',0,'心脏超声'], ['abnormal_followup',1,'血脂']
  ]);
});

test('实际预检处理器对草稿仅返回问题，对已发布方案不进入重试派发', async () => {
  const text = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
  const start = text.indexOf('async function reviewAnnualDraft');
  const code = text.slice(start, text.indexOf('\n}', start) + 2);
  const plan = { patientId: 'p', year: 2026, moduleData: { nutrition_assessment: { enabled: false },
    abnormal_followup: { records: [{ reviewItems: ['心脏超声'], time: '' }] } }, markModified() {},
    save() { throw Error('预检不能保存或发布'); } };
  const context = { getVisiblePlanPatientIds: async () => ['p'], AnnualPlan: { findOne: () => ({ sort: async () => plan }) },
    require: name => {
      if (name.endsWith('/annualReviewEligibility')) return { checkForAnnualPlan: async () => ({ allowed: true }) };
      if (name.endsWith('/annualFlowPilot')) return { enabledForPlan: () => true };
      if (name.endsWith('/healthManagementRollout')) return { enabledForPatient: () => false };
      if (name.endsWith('/annualNutrition.cjs')) return { isRow: () => false };
      return require('../src/utils/' + name.split('/').pop());
    } };
  const run = vm.runInNewContext('(' + code + ')', context);
  const req = { params: { id: 'p' }, query: { year: '2026' }, body: {}, staff: { role: 'familyDoctor' } };
  const res = { json(value) { this.body = value; }, status() { return this; } };
  await run(req,res,true);
  assert.equal(res.body.issues[0].key,'abnormal_followup');
  assert.equal(plan.pushedAt,undefined);
  plan.pushedAt = new Date();
  await run(req,res,true);
  assert.equal(res.body.issues.length,0);
});
