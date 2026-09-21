const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api'); assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const source = await User.findById(session.patientId).lean();
  const patient = await User.create({ name: '隔离验收客户（纯虚构）', clientBrand: source.clientBrand,
    assignedFamilyDoctor: source.assignedFamilyDoctor, assignedHealthPlanner: source.assignedHealthPlanner,
    assignedHealthManager: source.assignedHealthManager, serviceStartDate: source.serviceStartDate, serviceExpiry: source.serviceExpiry });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiayicare-round-two-'));
  const output = path.join(dir, 'session.json');
  fs.writeFileSync(output, JSON.stringify({ ...session, patientId: String(patient._id) }, null, 2));
  console.log(output);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
