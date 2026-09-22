const m = require('mongoose'), assert = require('node:assert/strict');
const { buildConfirmation } = require('../src/utils/archiveConfirmation');
(async () => {
  await m.connect(`mongodb://127.0.0.1:27135/archive_test_${require('crypto').randomBytes(12).toString('hex')}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const users = m.connection.db.collection('users'), path = 'lifestyle_data.breakfastTime';
  const user = { _id: new m.Types.ObjectId(), archiveDraft: { responseId: new m.Types.ObjectId(), questionnaireId: new m.Types.ObjectId(), items: [{ path }] }, lifestyle_data: {} };
  await users.insertOne(user);
  const first = buildConfirmation(user, [{ path, value: '08:00' }], { _id: new m.Types.ObjectId() });
  const writes = await Promise.all([1, 2].map(() => users.updateOne(first.filter, first.update)));
  assert.equal(writes.reduce((n, r) => n + r.modifiedCount, 0), 1);
  const saved = await users.findOne({ _id: user._id });
  assert.equal(saved.lifestyle_data.breakfastTime, '08:00'); assert.equal(saved.archiveVersionHistory, undefined);
  assert.equal(saved.archiveConfirmLog.length, 1);
  await users.updateOne({ _id: user._id }, { $set: { archiveDraft: user.archiveDraft } });
  const next = buildConfirmation(await users.findOne({ _id: user._id }), [{ path, value: '09:00' }], { _id: new m.Types.ObjectId() });
  await users.updateOne({ _id: user._id }, { $set: { 'lifestyle_data.breakfastTime': '10:00' } });
  assert.equal((await users.updateOne(next.filter, next.update)).matchedCount, 0);
  console.log('PASS first baseline persisted once, zero change entries; concurrent manual edit rejects stale confirmation');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => m.disconnect());
