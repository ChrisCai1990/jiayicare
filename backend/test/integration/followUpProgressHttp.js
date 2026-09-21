// Local API acceptance, synthetic customer only; no AI, notifications or production.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const manifest = process.argv[2], session = JSON.parse(fs.readFileSync(manifest));
  assert.equal(session.api, 'http://127.0.0.1:3000/api'); assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), FollowUp = require('../../src/models/FollowUp');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const call = async (route, token, body) => {
    const res = await fetch(session.api + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    return { status: res.status, body: await res.json() };
  };
  const tokens = {};
  for (const role of ['healthManager', 'familyDoctor']) {
    const a = session.accounts.find(x => x.role === role); const login = await call('/staff/login', null, { username: a.username, password: a.password });
    assert.equal(login.status, 200); tokens[role] = login.body.data.token;
  }
  const task = await FollowUp.create({ patientId: session.patientId, staffId: session.accounts.find(x => x.role === 'familyDoctor').id,
    assignedTo: session.accounts.find(x => x.role === 'healthManager').id, status: 'planned', theme: '隔离持续复查过程测试（纯模拟）', content: '完成本次模拟复查并审核报告' });
  const route = `/staff/followups/${task._id}/progress`;
  const firstBody = { requestId: 'http-contact-0001', content: '已提醒，客户下周安排', updatedAt: task.updatedAt, nextContactAt: '2026-09-28T01:00:00Z' };
  assert.equal((await call(route, tokens.familyDoctor, firstBody)).status, 403);
  const first = await call(route, tokens.healthManager, firstBody); assert.equal(first.status, 200, JSON.stringify(first));
  assert.equal((await call(route, tokens.healthManager, firstBody)).status, 200);
  const stale = await call(route, tokens.healthManager, { ...firstBody, requestId: 'http-contact-stale' }); assert.equal(stale.status, 409);
  const second = await call(route, tokens.healthManager, { ...firstBody, updatedAt: first.body.data.updatedAt, requestId: 'http-contact-0002', content: '已预约，检查尚未完成' });
  assert.equal(second.status, 200, JSON.stringify(second));
  const stored = await FollowUp.findById(task._id).lean();
  assert.equal(stored.status, 'in_progress'); assert.equal(stored.progressRecords.length, 2);
  assert.equal(stored.content, task.content); assert.equal(stored.plannedContent, task.content); assert.equal(stored.completedAt, null);
  assert.equal(stored.nextFollowUpDate.toISOString(), firstBody.nextContactAt.replace('Z', '.000Z'));
  fs.writeFileSync(path.join(path.dirname(manifest), 'followup-progress-http.json'), JSON.stringify({ patientId: session.patientId, taskId: String(task._id), checks: ['403 creator', '200 append twice', '200 idempotent replay', '409 stale', 'one ongoing original task', 'original requirements retained'] }, null, 2));
  console.log('Actual HTTP: two contacts, one ongoing task; owner/date/history, replay and stale protection passed. Task=' + task._id);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
