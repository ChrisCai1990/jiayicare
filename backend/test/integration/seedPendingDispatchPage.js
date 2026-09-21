// Page-only fixture. Synthetic age is not evidence of real crash recovery.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User');
  const Report = require('../../src/models/MedicalReport');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const manager = session.accounts.find(row => row.role === 'healthManager');
  const patient = await User.create({ name: '隔离待恢复页面客户（纯虚构）', assignedHealthManager: manager.id });
  const report = new Report({ user: patient._id, title: '隔离待恢复页面验收', audit_status: 'audited' });
  require('../../src/utils/legacyDispatchIntent').armLegacyDispatchIntent(report, { _id: manager.id, name: '隔离健管' }, { abnormalItems: [{ name: '合成异常' }] });
  report.legacyDispatchIntent.createdAt = new Date(Date.now() - 6 * 60 * 1000);
  await report.save();
  console.log(JSON.stringify({ patientId: patient._id, reportId: report._id, fixture: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
