const m = require('mongoose'), assert = require('node:assert/strict');
(async () => {
  await m.connect(`mongodb://127.0.0.1:27134/jiayicare_upsert_${require('crypto').randomBytes(12).toString('hex')}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const FollowUp = require('../../src/models/FollowUp');
  const planId = new m.Types.ObjectId();
  const filter = { sourceHealthPlanId: planId, sourceType: 'health_plan', taskRole: 'executor', workflowKey: 'test-stage' };
  const task = await FollowUp.findOneAndUpdate(filter, { $set: { patientId: new m.Types.ObjectId(), staffId: new m.Types.ObjectId(), status: 'planned' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  assert.equal(String(task.sourceHealthPlanId), String(planId)); assert.equal(task.sourceType, 'health_plan'); assert.equal(task.taskRole, 'executor');
  await FollowUp.findOneAndUpdate(filter, { $set: { content: 'retry' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  assert.equal(await FollowUp.countDocuments({}), 1);
  await FollowUp.collection.updateOne({ _id: task._id }, { $set: { outcomeEvidenceLock: { token: 'held' } } });
  assert.equal((await FollowUp.updateOne(filter, { $set: { content: 'must block' } })).matchedCount, 0);
  assert.equal((await FollowUp.findById(task._id)).content, 'retry');
  console.log('PASS upsert preserves source equality, replay finds same task, held evidence still rejects writes');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => m.disconnect());
