// Explicit test-only preloader for startIsolatedAcceptance.js. Never production-imported.
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.equal(process.env.RUN_ISOLATED_ACCEPTANCE, 'true');
const session = JSON.parse(fs.readFileSync(process.env.ISOLATED_ACCEPTANCE_SESSION, 'utf8'));
assert.equal(session.api, 'http://127.0.0.1:3000/api');
assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
const writer = require('../../src/utils/conditionalDraftWrite');
const original = writer.saveConditionalDrafts;
writer.saveConditionalDrafts = async (Model, plan, snapshot, decisions, claim) => {
  if (plan.title === '隔离HTTP条件竞争（仅测试）') {
    assert.equal(process.env.MONGODB_URI, `mongodb://127.0.0.1:27134/${session.database}`);
    assert.equal(Model.db.name, session.database);
    const user = await require('../../src/models/User').findById(plan.patientId);
    assert.equal(user.name, '隔离HTTP条件竞争客户（纯虚构）');
    // Deterministic interleaving: a real target write after the route's read,
    // before its CAS. No fake HTTP response or fake model return value.
    await Model.updateOne({ _id: plan._id }, { $set: {
      'content.workflowModuleDecisions': [{ id: 'condition', decision: 'not_needed', evidence: '隔离人工决定' }],
      'content.note': '并发人工修改保留',
    } });
  }
  return original(Model, plan, snapshot, decisions, claim);
};
