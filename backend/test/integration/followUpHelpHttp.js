// Real local user/staff routes; synthetic original plan only, no external calls.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const manifest = process.argv[2], session = JSON.parse(fs.readFileSync(manifest));
  assert.equal(session.api, 'http://127.0.0.1:3000/api'); assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  const customer = JSON.parse(fs.readFileSync(path.join(path.dirname(manifest), 'customer-test-token.json')));
  assert.equal(customer.patientId, session.patientId);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), FollowUp = require('../../src/models/FollowUp');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const manager = session.accounts.find(a => a.role === 'healthManager');
  const request = async (route, method, body, token, status = 200) => {
    const response = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const json = await response.json(); assert.equal(response.status, status, JSON.stringify(json)); return json.data;
  };
  const staffToken = (await request('/staff/login', 'POST', { username: manager.username, password: manager.password })).token;
  const task = await FollowUp.create({ patientId: session.patientId, assignedTo: manager.id, staffId: manager.id,
    status: 'in_progress', continuityRequired: true, theme: '隔离等待服务过程与求助（纯虚构）', type: 'phone', isBlocked: true,
    serviceTracking: { status: 'waiting', revision: 2 }, content: '模拟检查尚未完成' });
  const userRoute = `/user/followup-tasks/${task._id}/done`;
  await request(userRoute, 'PATCH', { done: true }, customer.token, 409);
  const helped = await request(userRoute, 'PATCH', { needFollowUp: true }, customer.token);
  assert.equal(helped.status, 'in_progress'); assert.equal(helped.isBlocked, true);
  assert.equal(helped.completedByUser, false); assert.ok(helped.tags.includes('人工跟进'));
  const progressBody = { updatedAt: helped.updatedAt, requestId: 'isolated-help-progress-1', content: '已沟通，等待检查，保留原计划', type: 'phone' };
  const progress = await request(`/staff/followups/${task._id}/progress`, 'POST', progressBody, staffToken);
  assert.equal(progress.status, 'in_progress'); assert.equal(progress.isBlocked, true);
  assert.equal(progress.serviceTracking.status, 'waiting'); assert.equal(progress.progressRecords.length, 1);
  await request(`/staff/followups/${task._id}`, 'PUT', { status: 'completed' }, staffToken, 409);
  const closed = await FollowUp.create({ patientId: session.patientId, assignedTo: manager.id, staffId: manager.id,
    status: 'completed', continuityRequired: true, theme: '隔离已关闭保护（纯虚构）' });
  await request(`/user/followup-tasks/${closed._id}/done`, 'PATCH', { needFollowUp: true }, customer.token, 409);
  assert.equal((await FollowUp.findById(closed._id)).status, 'completed');
  fs.writeFileSync(path.join(path.dirname(manifest), 'followup-help-http.json'), JSON.stringify({ patientId: session.patientId,
    taskId: String(task._id), closedTaskId: String(closed._id), status: progress.status, progressCount: 1, syntheticOnly: true }, null, 2));
  console.log('PASS actual customer help/staff progress routes; waiting lock preserved, premature closure and reopening denied');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
