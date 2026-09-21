const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const Plan = require('../../src/models/HealthPlan');
  const User = require('../../src/models/User');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const { saveConditionalDrafts } = require('../../src/utils/conditionalDraftWrite');
  for (const scenario of ['needed', 'not_needed', 'other_content', 'normal']) {
    const plan = await Plan.create({ patientId: session.patientId, staffId: session.accounts[0].id,
      type: 'medical_assist', status: 'active', title: '隔离条件草稿竞争-' + scenario,
      content: { note: 'original', workflowModules: [{ id: 'condition', mode: 'conditional' }], workflowModuleDecisions: [] } });
    const snapshot = structuredClone(plan.content);
    if (scenario === 'other_content') await Plan.updateOne({ _id: plan._id }, { $set: { 'content.note': '人工新内容' } });
    else if (scenario !== 'normal') await Plan.updateOne({ _id: plan._id }, { $set: { 'content.workflowModuleDecisions': [{ id: 'condition', decision: scenario, evidence: '人工决定' }] } });
    const write = () => saveConditionalDrafts(Plan, plan, snapshot, [{ id: 'condition', decision: 'pending', evidence: '规则草稿' }]);
    if (scenario === 'normal') await write();
    else await assert.rejects(write(), error => error.status === 409);
    const saved = await Plan.findById(plan._id);
    assert.equal(saved.content.note, scenario === 'other_content' ? '人工新内容' : 'original');
    assert.equal(saved.content.workflowModuleDecisions[0]?.decision, scenario === 'normal' ? 'pending' : scenario === 'other_content' ? undefined : scenario);
    console.log(JSON.stringify({ scenario, planId: plan._id, passed: true }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
