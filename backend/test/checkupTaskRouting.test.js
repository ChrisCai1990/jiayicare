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
