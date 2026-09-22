// Local-only synthetic persistence test; no application startup or external I/O.
const mongoose = require('mongoose'), assert = require('node:assert/strict');
const { ensureServiceReviewSuccessor } = require('../../src/utils/serviceReviewSuccessor');
(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27134/jiayicare_successor_${require('crypto').randomBytes(12).toString('hex')}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const FollowUp = require('../../src/models/FollowUp');
  const patient = { _id: new mongoose.Types.ObjectId(), assignedHealthManager: new mongoose.Types.ObjectId() };
  const review = { _id: new mongoose.Types.ObjectId(), patientId: patient._id, sourceHealthPlanId: new mongoose.Types.ObjectId(), assignedTo: new mongoose.Types.ObjectId(), status: 'completed', completedAt: new Date(), formData: { followUpDate: '2026-10-10', followUpContent: '纯合成测试建议' } };
  const rows = await Promise.all(Array.from({ length: 10 }, () => ensureServiceReviewSuccessor({ FollowUp, review, patient })));
  assert.equal(new Set(rows.map(x => String(x._id))).size, 1);
  assert.equal(await FollowUp.countDocuments({}), 1);
  assert.equal(String(rows[0].assignedTo), String(patient.assignedHealthManager));
  await FollowUp.updateOne({ _id: rows[0]._id }, { $set: { status: 'completed', completedAt: new Date(), content: '保留人工内容' } });
  const before = await FollowUp.findById(rows[0]._id).lean();
  await ensureServiceReviewSuccessor({ FollowUp, review, patient });
  assert.deepEqual(await FollowUp.findById(rows[0]._id).lean(), before);
  console.log('PASS 10 concurrent requests create one manager task; replay preserves completed row byte-for-byte');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
