// Deterministic interleaving against isolated real Mongo, not HTTP/AI acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User');
  const Report = require('../../src/models/MedicalReport');
  const Task = require('../../src/models/Task');
  const Review = require('../../src/models/AbnormalReview');
  const { ensureLegacyReportReview } = require('../../src/utils/legacyReportReview');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const staff = session.accounts.find(a => a.role === 'healthManager');
  let failures = 0;
  for (const phase of ['before_review', 'before_task']) {
    const patient = await User.create({ name: '隔离撤销竞争客户（纯虚构）', assignedHealthManager: staff.id });
    const report = await Report.create({ user: patient._id, title: `隔离撤销竞争-${phase}`, audit_status: 'audited' });
    let revoked = false, sourceModified = null;
    const wrap = Model => ({
      find: (...args) => Model.find(...args), findById: (...args) => Model.findById(...args), exists: (...args) => Model.exists(...args),
      updateOne: async (...args) => {
        if (!revoked) {
          revoked = true;
          const result = await Report.updateOne({ _id: report._id }, { $set: { audit_status: 'rejected' } });
          sourceModified = result.modifiedCount;
        }
        return Model.updateOne(...args);
      },
    });
    await ensureLegacyReportReview({ Task: phase === 'before_task' ? wrap(Task) : Task,
      AbnormalReview: phase === 'before_review' ? wrap(Review) : Review, report,
      staff: { _id: staff.id, name: '隔离健管' }, input: { abnormalItems: [{ name: '合成项（非医疗意见）' }] } });
    const source = await Report.findById(report._id);
    const tasks = await Task.countDocuments({ user: patient._id });
    const reviews = await Review.countDocuments({ reportId: report._id });
    assert.equal(revoked, true, 'source write must be attempted inside target write boundary');
    const safe = (sourceModified === 0 && source.audit_status === 'audited') || (source.audit_status === 'rejected' && tasks === 0);
    console.log(JSON.stringify({ phase, safe, sourceModified, reportId: String(report._id), audit: source.audit_status, tasks, reviews }));
    if (!safe) failures++;
  }
  assert.equal(failures, 0, 'Revoked source still creates legacy tasks; preserve evidence and block rollout');
  const HealthPlan = require('../../src/models/HealthPlan');
  const { arm, createQueue } = require('../../src/utils/reportPlanItemQueue');
  for (const first of ['legacy', 'plan']) {
    const patient = await User.create({ name: '隔离双队列互斥客户（纯虚构）', assignedHealthManager: staff.id });
    const plan = await HealthPlan.create({ patientId: patient._id, staffId: staff.id, type: 'annual_checkup',
      title: '隔离双队列方案', items: [{ name: '合成项目', status: 'pending' }] });
    const report = new Report({ user: patient._id, title: `隔离双队列-${first}`, audit_status: 'audited',
      planId: plan._id, planItemId: plan.items[0]._id });
    arm(report); await report.save();
    const queue = createQueue({ MedicalReport: Report, HealthPlan });
    const args = { Task, AbnormalReview: Review, report, staff: { _id: staff.id, name: '隔离健管' },
      input: { abnormalItems: [{ name: '合成项' }] } };
    let attempted = false;
    if (first === 'legacy') {
      const wrappedReview = { find: (...a) => Review.find(...a), findById: (...a) => Review.findById(...a),
        exists: (...a) => Review.exists(...a), updateOne: async (...a) => {
          attempted = true;
          await queue.reconcile(report._id, report.planItemSync.token);
          assert.equal((await Report.findById(report._id)).planItemSync.status, 'pending');
          assert.equal((await HealthPlan.findById(plan._id)).items[0].status, 'pending');
          return Review.updateOne(...a);
        } };
      await ensureLegacyReportReview({ ...args, AbnormalReview: wrappedReview });
      await queue.reconcile(report._id, report.planItemSync.token);
    } else {
      const wrappedPlan = { findOne: (...a) => HealthPlan.findOne(...a), updateOne: async (...a) => {
        if (!attempted) {
          attempted = true;
          await assert.rejects(ensureLegacyReportReview({ ...args, report: await Report.findById(report._id) }), error => error.status === 409);
          assert.equal(await Review.countDocuments({ reportId: report._id }), 0);
          assert.equal(await Task.countDocuments({ user: patient._id }), 0);
        }
        return HealthPlan.updateOne(...a);
      } };
      await createQueue({ MedicalReport: Report, HealthPlan: wrappedPlan }).reconcile(report._id, report.planItemSync.token);
      await ensureLegacyReportReview({ ...args, report: await Report.findById(report._id) });
    }
    assert.equal(attempted, true);
    const latest = await Report.findById(report._id);
    assert.equal(latest.planItemSync.status, 'completed');
    assert.equal(latest.legacyReviewWrite.status, 'completed');
    assert.equal(await Review.countDocuments({ reportId: report._id }), 1);
    assert.equal(await Task.countDocuments({ user: patient._id }), 1);
    console.log(JSON.stringify({ first, mutualExclusion: 'PASS', reportId: String(report._id), bothCompletedAfterRelease: true }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
