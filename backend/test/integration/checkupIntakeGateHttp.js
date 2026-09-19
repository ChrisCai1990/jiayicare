// Existing standard-template failure fixture: verify safe rejection, no repair by data mutation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const manifest = process.argv[2];
  const session = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  const evidence = JSON.parse(fs.readFileSync(path.join(path.dirname(manifest), 'service-http.json'), 'utf8'));
  assert.equal(evidence.standardTemplate, true);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`);
  const db = mongoose.connection.db;
  assert.equal((await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(session.patientId) })).name, '隔离验收客户（纯虚构）');
  const filter = { sourceHealthPlanId: new mongoose.Types.ObjectId(evidence.serviceId) };
  const before = JSON.stringify(await db.collection('followups').find(filter).sort({ _id: 1 }).toArray());
  const account = session.accounts.find(x => x.role === 'familyDoctor');
  const login = await fetch(session.api + '/staff/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: account.username, password: account.password }) });
  const token = (await login.json()).data.token;
  const response = await fetch(session.api + `/staff/plans/${evidence.serviceId}/push`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
  const body = await response.json();
  assert.equal(response.status, 409); assert.match(body.message, /尚未绑定问卷/);
  assert.equal(JSON.stringify(await db.collection('followups').find(filter).sort({ _id: 1 }).toArray()), before);
  console.log('Actual publish rejects unbound customer intake; existing task evidence unchanged. Positive questionnaire flow remains unverified.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
