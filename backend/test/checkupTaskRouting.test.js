const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('only explicit design stage opens AI design; review never regenerates a plan', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/utils/checkupTaskRouting.js'), 'utf8');
  const { isCheckupDesignStage: match } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.equal(match({ followUpSchemeId: { workflowStageKey: 'plan_design' } }), true);
  for (const stage of ['result_review', 'abnormal_followup', 'final_acceptance']) assert.equal(match({ followUpSchemeId: { workflowStageKey: stage, name: '体检方案定制' } }), false);
  assert.equal(match({ theme: '执行体检结果评估与随访计划' }), false);
  assert.equal(match({ theme: '体检方案定制与审核' }), true);
  assert.equal(match({}), false);
});

test('conclusion stages are explicit, source-scoped and never inherit another stage', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/utils/checkupTaskRouting.js'), 'utf8');
  const { checkupConclusionStage: match } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  for (const stage of ['result_review', 'final_acceptance']) {
    assert.equal(match({ sourceType: 'health_plan', followUpSchemeId: { workflowStageKey: stage } }), stage);
    assert.equal(match({ sourceType: 'annual_plan', followUpSchemeId: { workflowStageKey: stage } }), '');
  }
  assert.equal(match({ sourceType: 'health_plan', theme: '体检结果评估与随访计划' }), 'result_review');
  assert.equal(match({ sourceType: 'health_plan', theme: '体检最终验收' }), 'final_acceptance');
  assert.equal(match({ sourceType: 'health_plan', theme: '体检结果评估', followUpSchemeId: { workflowStageKey: 'report_collection' } }), '');
  assert.equal(match({}), '');
});

test('both staff entry points isolate conclusion content and suppress duplicate input', () => {
  for (const page of ['FollowUpsPage', 'PatientDetailPage']) {
    const source = fs.readFileSync(path.join(__dirname, '../../staff/src/pages', page + '.jsx'), 'utf8');
    assert.match(source, /checkupConclusionStage\(f\) \? \[\] : normalizeServiceChecklist/);
    assert.match(source, /CheckupConclusionForm[^\r\n]*task=\{execItem\} value=\{execForm.content\}/);
    assert.match(source, /!checkupConclusionStage\(execItem\) && !isCheckupAppointmentBookingTask/);
    assert.match(source, /请填写本阶段结论及后续安排/);
  }
});
