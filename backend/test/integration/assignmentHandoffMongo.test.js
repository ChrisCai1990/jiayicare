// Explicit localhost-only opt-in; never loads .env or contacts a provider.
const test = require('node:test'), assert = require('node:assert/strict');
const mongoose = require('mongoose'), { randomUUID } = require('crypto');
const { loadAssignmentAttention } = require('../../src/utils/workbenchAssignmentAttention');
test('new handoff sources: real Mongo owner exception projection', { skip: process.env.RUN_ASSIGNMENT_HANDOFF_TEST !== 'true', timeout: 45000 }, async t => {
  const db = `jiayicare_handoff_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(`mongodb://127.0.0.1:27964/${db}`, { autoIndex: false, serverSelectionTimeoutMS: 3000 });
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const User = require('../../src/models/User'), Admin = require('../../src/models/Admin'), Plan = require('../../src/models/AnnualPlan');
  const Recommendation = require('../../src/models/AnnualServiceRecommendation'), Job = require('../../src/models/ChatFollowupJob');
  const Medication = require('../../src/models/Medication');
  const id = () => new mongoose.Types.ObjectId(), tenant = id(), foreignTenant = id();
  const actor = { role: 'superadmin', tenantId: tenant, _id: id() };
  const reset = async () => { for (const M of [User,Admin,Plan,Recommendation,Job,Medication]) await M.deleteMany({}); };
  const patient = async (extra = {}) => { const _id = id(); await User.collection.insertOne({ _id, name: '合成会员', tenantId: tenant, ...extra }); return _id; };
  const plan = async (patientId, reviews = [{ status: 'applied', executionReview: { version: 1, status: 'pending' } }]) => {
    const _id = id(); await Plan.collection.insertOne({ _id, patientId, supplementRevisions: reviews }); return _id;
  };
  const recommendation = async (patientId, planId, extra = {}) => Recommendation.collection.insertOne({ _id: id(), patientId, planId, status: 'published', response: 'none', handledAt: null, followUpReminderEnabled: true, plannedFollowUpDate: '2000-01-01', ...extra });
  const job = async (patientId, extra = {}) => Job.collection.insertOne({ _id: `${patientId}_nutritionist`, patientId, status: 'failed', ...extra });
  const owner = async (role, extra = {}) => { const _id = id(); await Admin.collection.insertOne({ _id, role, tenantId: tenant, staffStatus: 'active', ...extra }); return _id; };
  const snapshot = async () => JSON.stringify(await Promise.all([User,Admin,Plan,Recommendation,Job,Medication].map(M => M.collection.find({}).sort({ _id: 1 }).toArray())));
  await t.test('missing advisor consolidates due recommendations and confirmed-plan reviews without writes', async () => {
    await reset(); const p = await patient(), pl = await plan(p);
    await recommendation(p, pl); await Medication.collection.insertOne({ _id: id(), user: p, tenantId: tenant, aiStatus: 'pending' });
    const before = await snapshot(); const todos = await loadAssignmentAttention(actor);
    assert.equal(todos.length, 1); assert.match(todos[0].summary, /执行安排待核对/); assert.match(todos[0].summary, /年度服务建议待联系/); assert.match(todos[0].summary, /用药待核对/);
    assert.match(todos[0].summary, /3项/); assert.equal(await snapshot(), before);
  });
  await t.test('inactive, wrong-role and cross-tenant owners are invalid; corrected owner disappears immediately', async () => {
    await reset(); const p = await patient(); await plan(p);
    for (const [role, extra] of [['familyDoctor', { staffStatus: 'inactive' }], ['nutritionist', {}], ['familyDoctor', { tenantId: foreignTenant }]]) {
      const assignedFamilyDoctor = await owner(role, extra); await User.updateOne({ _id: p }, { $set: { assignedFamilyDoctor } });
      assert.equal((await loadAssignmentAttention(actor)).length, 1);
    }
    const assignedFamilyDoctor = await owner('familyDoctor'); await User.updateOne({ _id: p }, { $set: { assignedFamilyDoctor } });
    assert.equal((await loadAssignmentAttention(actor)).length, 0);
  });
  await t.test('tenant-scoped patients protect models without tenantId; foreign and deleted patients stay hidden', async () => {
    await reset();
    for (const extra of [{}, { tenantId: foreignTenant }, { isDeleted: true }]) { const p = await patient(extra); await plan(p); await job(p); }
    const rows = await loadAssignmentAttention(actor); assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map(r => r.patientId)).size, 1);
    const legacy = await patient({ tenantId: null }); await plan(legacy);
    assert.equal((await loadAssignmentAttention({ ...actor, tenantId: null })).length, 1);
  });
  await t.test('future/legacy/declined/handled/draft recommendations and orphan sources do not alert', async () => {
    await reset(); const p = await patient(), pl = await plan(p, []), other = await patient(), otherPlan = await plan(other, []);
    for (const extra of [{ plannedFollowUpDate: '0000-invalid' }, { plannedFollowUpDate: '2099-01-01' }, { followUpReminderEnabled: false }, { response: 'declined' }, { handledAt: new Date() }, { status: 'draft' }]) await recommendation(p, pl, extra);
    await recommendation(p, id()); await recommendation(p, otherPlan);
    assert.equal((await loadAssignmentAttention(actor)).length, 0);
    await recommendation(p, pl, { response: 'interested', followUpReminderEnabled: false, plannedFollowUpDate: '' });
    assert.equal((await loadAssignmentAttention(actor)).length, 1);
  });
  await t.test('old or resolved revisions do not alert and pending review disappears when handled', async () => {
    await reset(); const p = await patient();
    await plan(p, [{ status: 'applied' }, { status: 'applied', executionReview: { version: 1, status: 'reviewed' } }, { status: 'pending_review', executionReview: { version: 1, status: 'pending' } }]);
    assert.equal((await loadAssignmentAttention(actor)).length, 0);
    const active = await plan(p); assert.equal((await loadAssignmentAttention(actor)).length, 1);
    await Plan.updateOne({ _id: active }, { $set: { 'supplementRevisions.0.executionReview.status': 'reviewed' } });
    assert.equal((await loadAssignmentAttention(actor)).length, 0);
  });
  await t.test('only failed or expired chat jobs require owner correction', async () => {
    await reset();
    for (const extra of [{ status: 'failed' }, { status: 'running', leaseUntil: new Date(0) }, { status: 'committing', leaseUntil: new Date(0) }, { status: 'running', leaseUntil: new Date(Date.now() + 3600000) }, { status: 'done' }]) await job(await patient(), extra);
    const rows = await loadAssignmentAttention(actor); assert.equal(rows.length, 3); rows.forEach(r => assert.match(r.summary, /营养聊天草稿异常待处理/));
    const assignedNutritionist = await owner('nutritionist'); await User.updateMany({}, { $set: { assignedNutritionist } });
    assert.equal((await loadAssignmentAttention(actor)).length, 0);
  });
  await t.test('the four service roles never receive administrator correction tasks', async () => {
    for (const role of ['familyDoctor','healthManager','nutritionist','healthPlanner']) assert.deepEqual(await loadAssignmentAttention({ ...actor, role }), []);
  });
});
