// Actual local routes with synthetic report/AI input. Never real medical acceptance.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const manifest = process.argv[2], session = JSON.parse(fs.readFileSync(manifest));
  assert.equal(session.api, 'http://127.0.0.1:3000/api'); assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), FollowUp = require('../../src/models/FollowUp'), Report = require('../../src/models/MedicalReport'), Draft = require('../../src/models/ReportFollowUpDraft');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const roles = Object.fromEntries(session.accounts.map(a => [a.role, a]));
  const patient = await User.create({ name: '隔离持续随访验收（纯虚构）', assignedFamilyDoctor: roles.familyDoctor.id,
    assignedHealthManager: roles.healthManager.id, assignedHealthPlanner: roles.healthPlanner.id });
  const request = async (route, role, body, expected = 200, method = 'POST') => {
    const res = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const json = await res.json(); assert.equal(res.status, expected, JSON.stringify(json)); return json.data;
  };
  const tokens = {};
  for (const role of ['healthManager', 'familyDoctor', 'healthPlanner']) tokens[role] = (await request('/staff/login', role, { username: roles[role].username, password: roles[role].password })).token;
  const createTask = () => FollowUp.create({ patientId: patient._id, staffId: roles.familyDoctor.id, assignedTo: roles.healthManager.id,
    status: 'in_progress', sourceType: 'scheduled', sourceScheduleKey: 'abnormal_followup:2026-09-21:test', theme: '隔离结果处置复查（纯模拟）' });
  const first = await createTask();
  const report = await Report.create({ user: patient._id, title: '隔离已审核结果（纯模拟）', documentCategory: 'exam_report', audit_status: 'audited', examConclusion: '隔离验收内容，不是医疗建议' });
  const payload = { updatedAt: first.updatedAt, reportIds: [String(report._id)], decision: 'no_further', checksComplete: true, note: '模拟顾问确认本次已完成，无需继续' };
  await request(`/staff/followups/${first._id}`, 'healthManager', { status: 'completed', content: '已联系' }, 409, 'PUT');
  await request(`/staff/followups/${first._id}/outcome-review`, 'healthManager', payload, 403);
  await request(`/staff/followups/${first._id}/outcome-review`, 'familyDoctor', { ...payload, checksComplete: false }, 400);
  await request(`/staff/followups/${first._id}/outcome-review`, 'familyDoctor', { ...payload, reportIds: [] }, 400);
  const closed = await request(`/staff/followups/${first._id}/outcome-review`, 'familyDoctor', payload);
  assert.equal(closed.status, 'completed'); assert.equal(closed.outcomeReview.nextFollowUpIds.length, 0);
  const replay = await request(`/staff/followups/${first._id}/outcome-review`, 'familyDoctor', payload);
  assert.equal(replay.completedAt, closed.completedAt);
  const second = await createTask();
  const { sourceDigest } = require('../../src/utils/reportFollowUpSource');
  const freshReport = await Report.findById(report._id).lean();
  const draft = await Draft.create({ patientId: patient._id, reportId: report._id, title: report.title,
    sourceSequence: freshReport.followUpSourceEvent.sequence, sourceKey: `${report._id}:${freshReport.followUpSourceEvent.sequence}:${sourceDigest(freshReport)}`,
    sourceSnapshot: { title: report.title }, followUpAutomation: { status: 'ready' }, status: 'advisor_review' });
  const nextPayload = { ...payload, updatedAt: second.updatedAt, decision: 'new_plan', reportDraftId: String(draft._id), note: '模拟顾问确认后续按新计划跟进' };
  await request(`/staff/followups/${second._id}/outcome-review`, 'familyDoctor', nextPayload, 409);
  const approved = await request(`/staff/report-followups/${draft._id}/review`, 'familyDoctor', { action: 'approve', revision: draft.__v,
    followUpDrafts: [{ title: '下一次模拟复查', content: '模拟资料，不是医疗建议', category: 'review', date: '2026-10-21', requiresService: false }] });
  assert.equal(approved.followUpPublication.status, 'published');
  const finished = await request(`/staff/followups/${second._id}/outcome-review`, 'familyDoctor', nextPayload);
  assert.equal(finished.outcomeReview.nextFollowUpIds.length, 1);
  assert.equal((await FollowUp.findById(finished.outcomeReview.nextFollowUpIds[0])).status, 'planned');
  const displayTask = await createTask();
  fs.writeFileSync(path.join(path.dirname(manifest), 'followup-outcome-http.json'), JSON.stringify({ patientId: String(patient._id), noFurtherTaskId: String(first._id), nextPlanTaskId: String(second._id), displayTaskId: String(displayTask._id), reportId: String(report._id), reportDraftId: String(draft._id), nextTaskIds: finished.outcomeReview.nextFollowUpIds }, null, 2));
  console.log('Actual HTTP: premature completion/role/missing proof blocked; no-further and published-next-plan close exact original; replay preserves timestamp');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
