// Continue the same isolated checkup case after redemption, never replace its history.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), m = require('mongoose');
(async () => {
  const manifest = process.argv[2], s = JSON.parse(fs.readFileSync(manifest)), dir = path.dirname(manifest);
  assert.equal(s.api, 'http://127.0.0.1:3000/api'); assert.match(s.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  const closure = JSON.parse(fs.readFileSync(path.join(dir, 'closure-http.json'))), redemption = JSON.parse(fs.readFileSync(path.join(dir, 'redemption-http.json')));
  assert.equal(redemption.patientId, s.patientId); assert.equal(redemption.syntheticPaymentOnly, true);
  await m.connect(`mongodb://127.0.0.1:27134/${s.database}`, { autoIndex: false, autoCreate: false });
  const FollowUp = require('../../src/models/FollowUp'), User = require('../../src/models/User');
  assert.equal((await User.findById(s.patientId)).name, '隔离验收客户（纯虚构）');
  const task = await FollowUp.findById(redemption.managerTaskId).lean(); assert.equal(String(task.patientId), s.patientId);
  let token;
  async function post(route, body) {
    const r = await fetch(s.api + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const json = await r.json(); assert.equal(r.status, 200, JSON.stringify(json)); return json.data;
  }
  const a = s.accounts.find(x => x.role === 'familyDoctor'); token = (await post('/staff/login', { username: a.username, password: a.password })).token;
  const payload = { updatedAt: task.updatedAt, reportIds: [closure.reportId], checksComplete: true, decision: 'no_further', note: '隔离合成案例：顾问确认本次资料齐全，无需新增后续事项；非真实医疗结论' };
  const closed = await post(`/staff/followups/${task._id}/outcome-review`, payload);
  assert.equal(closed.status, 'completed'); assert.equal(closed.outcomeReview.decision, 'no_further');
  const repeated = await post(`/staff/followups/${task._id}/outcome-review`, payload); assert.equal(repeated.completedAt, closed.completedAt);
  fs.writeFileSync(path.join(dir, 'checkup-outcome-http.json'), JSON.stringify({ patientId: s.patientId, originalId: String(task._id), completedAt: closed.completedAt, decision: 'no_further', separateAdvisorConfirmation: true, syntheticEvidence: true }, null, 2));
  console.log('PASS same checkup case: advisor explicit no-further closes exact original; replay preserves completion. Separate confirmation, not merged service review.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => m.disconnect());
