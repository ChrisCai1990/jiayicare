// Local isolated MongoDB only. No .env, production access or AI provider.
const test = require('node:test'), assert = require('node:assert/strict');
const mongoose = require('mongoose'), express = require('express'), jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
test('annual execution review: authenticated HTTP and real Mongo', { skip: process.env.RUN_ANNUAL_EXECUTION_TEST !== 'true', timeout: 60000 }, async t => {
  const dbName = `jiayicare_execution_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(`mongodb://127.0.0.1:27963/${dbName}`, { autoIndex: false, serverSelectionTimeoutMS: 3000 });
  const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = 'isolated-execution-review-test-only';
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  const User = require('../../src/models/User'), Admin = require('../../src/models/Admin'), Plan = require('../../src/models/AnnualPlan'), Review = require('../../src/models/AiCaseReview');
  const FollowUp = require('../../src/models/FollowUp'), Task = require('../../src/models/Task');
  const logic = require('../../src/utils/annualExecutionReview');
  const id = () => new mongoose.Types.ObjectId();
  const tenant = id(), otherTenant = id(), patient = id(), planId = id(), topicId = id(), messageId = id();
  const actors = Object.fromEntries(['familyDoctor','healthManager','nutritionist','healthPlanner','superadmin'].map(role => [role, id()]));
  const outsider = id();
  await Admin.collection.insertMany([...Object.entries(actors).map(([role,_id]) => ({ _id, role, name: `合成${role}`, tenantId: tenant })), { _id: outsider, role: 'superadmin', name: '合成外部超管', tenantId: otherTenant }]);
  await User.collection.insertOne({ _id: patient, name: '合成会员', tenantId: tenant, assignedDoctor: actors.familyDoctor, assignedHealthManager: actors.healthManager, assignedNutritionist: actors.nutritionist, assignedHealthPlanner: actors.healthPlanner });
  const initial = { _id: planId, patientId: patient, year: 2026, planType: 'jygj_light', confirmedAt: new Date(), moduleData: {}, supplementRevisions: [], updatedAt: new Date('2026-09-01T00:00:00Z') };
  await Plan.collection.insertOne(initial);
  await Review.collection.insertOne({ _id: topicId, user: patient, title: '合成研判', messages: [{ _id: messageId, role: 'ai', content: '合成建议，仅用于软件测试', createdAt: new Date() }] });
  const getVisiblePlanPatientIds = async staff => staff.role === 'superadmin' ? null : [patient];
  const app = express(); app.use(express.json()); app.use(require('../../src/routes/annualExecutionReview')({ getVisiblePlanPatientIds })); app.use(require('../../src/routes/reviewPlanAmendments')({ getVisiblePlanPatientIds }));
  const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve)));
  const call = async (path, role = 'familyDoctor', body) => {
    const token = jwt.sign({ type: 'admin', id: String(role === 'outsider' ? outsider : actors[role]) }, process.env.JWT_SECRET);
    const res = await fetch(`http://127.0.0.1:${server.address().port}/${patient}/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, ...await res.json() };
  };
  const endpoint = `annual-plan-execution-review/${planId}`;
  const amend = async title => {
    const p = await call('review-plan-amendment', 'familyDoctor', { action: 'preview-manual', planId, topicId, messageId });
    assert.equal(p.success, true);
    const result = await call('review-plan-amendment', 'familyDoctor', { action: 'apply', planId, topicId, messageId, confirmed: true, ...p.data, items: [{ key: 'abnormal_followup', title, reason: '合成依据', advice: '合成行动建议', datePending: true }] });
    assert.equal(result.success, true, JSON.stringify(result)); return result;
  };
  await t.test('real amendment persists content and execution marker in the same plan write', async () => {
    await amend('合成事项一'); await amend('合成事项二');
    const plan = await Plan.findById(planId).select('+supplementRevisions').lean();
    assert.equal(logic.pending(plan).length, 2); assert.equal(plan.moduleData.abnormal_followup.records.length, 2);
    assert.equal(await FollowUp.countDocuments(), 0); assert.equal(await Task.countDocuments(), 0);
    assert.equal((await Plan.findById(planId).lean()).supplementRevisions, undefined, 'internal review stays out of default customer payload');
    assert.match(logic.todo({ ...plan, patientId: { _id: patient, name: '合成' } }).summary, /2次修订/);
  });
  const followId = id(), taskId = id();
  await FollowUp.collection.insertOne({ _id: followId, patientId: patient, staffId: actors.healthManager, assignedTo: actors.healthManager, sourceAnnualPlanId: planId, theme: '原执行事项', status: 'in_progress', date: new Date(), updatedAt: new Date(1) });
  await Task.collection.insertOne({ _id: taskId, user: patient, sourceAnnualPlanId: planId, title: '原会员任务', status: 'completed', updatedAt: new Date(2) });
  await t.test('four roles can read authorized context; only advisor/superadmin can close; cross-tenant denied', async () => {
    for (const role of ['familyDoctor','healthManager','nutritionist','healthPlanner']) assert.equal((await call(endpoint, role)).status, 200);
    assert.equal((await call(endpoint, 'outsider')).status, 403);
    assert.equal((await call(`annual-plan-execution-review/${id()}`)).status, 404);
    for (const role of ['healthManager','nutritionist','healthPlanner']) assert.equal((await call(endpoint, role, { outcome: 'unchanged', note: '合成' })).status, 403);
  });
  await t.test('empty note, stale task and stale plan snapshots cannot close revisions', async () => {
    const viewed = (await call(endpoint)).data;
    assert.equal(viewed.followUps[0].assignedTo.name, '合成healthManager');
    const body = { outcome: 'unchanged', note: '已实际核对', baseUpdatedAt: viewed.baseUpdatedAt, taskVersion: viewed.taskVersion };
    assert.equal((await call(endpoint, 'familyDoctor', { ...body, note: ' ' })).status, 400);
    await FollowUp.updateOne({ _id: followId }, { $set: { status: 'planned' } });
    assert.equal((await call(endpoint, 'familyDoctor', body)).status, 409);
    const fresh = (await call(endpoint)).data;
    await amend('合成新增事项三');
    assert.equal((await call(endpoint, 'familyDoctor', { ...body, baseUpdatedAt: fresh.baseUpdatedAt, taskVersion: fresh.taskVersion })).status, 409);
    assert.equal(logic.pending(await Plan.findById(planId).select('+supplementRevisions').lean()).length, 3);
  });
  await t.test('concurrent closure accepts once, preserves tasks, records actor and allows new future revision', async () => {
    const viewed = (await call(endpoint)).data;
    const beforeFollow = await FollowUp.findById(followId).lean(), beforeTask = await Task.findById(taskId).lean();
    const body = { outcome: 'arranged', note: '已在原流程核对负责人及计划；此说明不代表服务完成', baseUpdatedAt: viewed.baseUpdatedAt, taskVersion: viewed.taskVersion };
    const results = await Promise.all([call(endpoint, 'familyDoctor', body), call(endpoint, 'familyDoctor', body)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
    assert.deepEqual(await FollowUp.findById(followId).lean(), beforeFollow); assert.deepEqual(await Task.findById(taskId).lean(), beforeTask);
    const plan = await Plan.findById(planId).select('+supplementRevisions').lean();
    assert.equal(logic.todo(plan), null); assert.equal(plan.updatedAt.toISOString(), viewed.baseUpdatedAt, 'review acknowledgement does not stale the content editor');
    assert.equal(String(plan.supplementRevisions[0].executionReview.reviewedBy), String(actors.familyDoctor));
    await amend('合成新修订四');
    const newer = await Plan.findById(planId).select('+supplementRevisions').lean(); assert.equal(logic.pending(newer).length, 1);
    assert.equal(newer.supplementRevisions.filter(r => r.executionReview.status === 'reviewed').length, 3);
  });
  await t.test('actual workbench projection groups revisions and respects current advisor scope', async () => {
    const fs = require('fs'), vm = require('vm');
    const source = fs.readFileSync(require.resolve('../../src/routes/staff'), 'utf8');
    const block = source.slice(source.indexOf('    // New confirmed-plan amendments'), source.indexOf('    // Read-only projection: customer interest'));
    for (const [role, ids, expected] of [['familyDoctor', [patient], 1], ['familyDoctor', [], 0], ['nutritionist', [patient], 0], ['healthManager', [patient], 0], ['superadmin', null, 1]]) {
      const todos = [];
      await vm.runInNewContext('(async()=>{' + block + '})()', { User, AnnualPlan: Plan, req: { staff: { tenantId: tenant } }, role, isSuper: role === 'superadmin', myPatientIds: ids, todos, require: () => logic });
      assert.equal(todos.length, expected);
      if (expected) assert.equal(todos[0].type, 'annual_execution_review');
    }
  });

  await t.test('saving more than twenty supplement drafts never evicts pending reviews or audit history', async () => {
    const fs = require('fs'), vm = require('vm');
    const source = fs.readFileSync(require.resolve('../../src/routes/staff'), 'utf8');
    const routeStart = source.indexOf("router.post('/patients/:id/annual-supplement-revision'");
    const writeStart = source.indexOf('const saved = await AnnualPlan.updateOne', routeStart);
    const statement = source.slice(writeStart, source.indexOf(';', writeStart) + 1);
    const before = await Plan.findById(planId).select('+supplementRevisions').lean();
    for (let i = 0; i < 22; i++) {
      const plan = await Plan.findById(planId).lean(), revisionId = `synthetic-draft-${i}`;
      await vm.runInNewContext('(async()=>{' + statement + '})()', { AnnualPlan: Plan, plan, revisionId, revision: { id: revisionId, status: 'pending_review' } });
    }
    const after = await Plan.findById(planId).select('+supplementRevisions').lean();
    assert.equal(after.supplementRevisions.length, before.supplementRevisions.length + 22);
    assert.deepEqual(after.supplementRevisions.slice(0, before.supplementRevisions.length), before.supplementRevisions);
    assert.equal(logic.pending(after).length, 1);
  });

  await t.test('latest explicit removal is retained and creates a review without deleting execution records', async () => {
    const preview = await call('review-plan-amendment', 'familyDoctor', { action: 'preview-manual', planId, topicId, messageId });
    const result = await call('review-plan-amendment', 'familyDoctor', { action: 'apply', planId, topicId, messageId, confirmed: true, ...preview.data,
      items: [{ key: 'abnormal_followup', target: 0, operation: 'remove', deletionReason: '合成去重依据' }] });
    assert.equal(result.success, true);
    const plan = await Plan.findById(planId).select('+supplementRevisions').lean(), revision = plan.supplementRevisions.at(-1);
    assert.equal(revision.executionReview.status, 'pending'); assert.equal(logic.summary(revision.changes[0]).action, '移除事项');
    assert.equal(logic.summary(revision.changes[0]).deletionReason, '合成去重依据');
    assert.equal((await FollowUp.findById(followId)).status, 'planned'); assert.equal((await Task.findById(taskId)).status, 'completed');
  });

});
