const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User'), Report = require('../../src/models/MedicalReport');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const { withConditionalReportClaim } = require('../../src/utils/conditionalReportClaim');
  for (const scenario of ['revoked_before', 'revoked_during', 'cas_miss', 'unknown_error']) {
    const report = await Report.create({ user: session.patientId, title: '隔离条件来源-' + scenario, audit_status: 'audited' });
    if (scenario === 'revoked_before') {
      await Report.updateOne({ _id: report._id }, { $set: { audit_status: 'rejected' } });
      let called = false;
      await assert.rejects(withConditionalReportClaim(report, [], async () => { called = true; }), error => error.status === 409);
      assert.equal(called, false);
    } else if (scenario === 'revoked_during') {
      await withConditionalReportClaim(report, [], async () => {
        assert.equal((await Report.updateOne({ _id: report._id }, { $set: { audit_status: 'rejected' } })).modifiedCount, 0);
        assert.equal((await Report.deleteOne({ _id: report._id })).deletedCount, 0);
        await assert.rejects(withConditionalReportClaim(report, [], async () => assert.fail('double owner')), error => error.status === 409);
      });
      assert.equal((await Report.findById(report._id)).legacyReviewWrite.status, 'completed');
      assert.equal((await Report.findById(report._id)).audit_status, 'audited');
    } else {
      await assert.rejects(withConditionalReportClaim(report, [], async () => {
        throw Object.assign(new Error('injected'), { code: scenario === 'cas_miss' ? 'CONDITIONAL_DRAFT_CONFLICT' : 'UNKNOWN' });
      }), /injected/);
      assert.equal((await Report.findById(report._id)).legacyReviewWrite.status, scenario === 'cas_miss' ? 'completed' : 'running');
      if (scenario === 'unknown_error') assert.equal((await Report.updateOne({ _id: report._id }, { $set: { audit_status: 'rejected' } })).modifiedCount, 0);
    }
    console.log(JSON.stringify({ scenario, reportId: report._id, passed: true }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
