// Exercises the same one-confirmation coordinator as the UI against actual local APIs.
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const manifest = process.argv[2], session = JSON.parse(fs.readFileSync(manifest));
  assert.equal(session.api, 'http://127.0.0.1:3000/api'); assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), FollowUp = require('../../src/models/FollowUp'), Report = require('../../src/models/MedicalReport'), Draft = require('../../src/models/ReportFollowUpDraft');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const roles = Object.fromEntries(session.accounts.map(a => [a.role, a]));
  const patient = await User.create({ name: '隔离合并审核（纯虚构）', assignedFamilyDoctor: roles.familyDoctor.id, assignedHealthManager: roles.healthManager.id, assignedHealthPlanner: roles.healthPlanner.id });
  let token;
  const post = async (route, body) => {
    const res = await fetch(session.api + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await res.json(); if (res.status !== 200) throw Error(`${res.status}: ${data.message}`); return data;
  };
  token = (await post('/staff/login', { username: roles.familyDoctor.username, password: roles.familyDoctor.password })).data.token;
  const api = { reviewReportFollowUpDraft: (id, body) => post(`/staff/report-followups/${id}/review`, body), reviewFollowUpOutcome: (id, body) => post(`/staff/followups/${id}/outcome-review`, body) };
  const { submitMergedOutcome } = await import(pathToFileURL(path.resolve(__dirname, '../../../staff/src/utils/mergedOutcomeReview.mjs')));
  const evidence = [];
  for (const decision of ['new_plan', 'no_further']) {
    const task = await FollowUp.create({ patientId: patient._id, assignedTo: roles.healthManager.id, staffId: roles.familyDoctor.id, status: 'in_progress', continuityRequired: true, theme: `隔离合并审核-${decision}` });
    // Seed synthetic audited source without triggering AI hooks; this is not real AI validation.
    const report = { _id: new mongoose.Types.ObjectId(), user: patient._id, title: `隔离合并来源-${decision}`, documentCategory: 'exam_report', audit_status: 'audited', followUpSourceEvent: { sequence: 1 }, createdAt: new Date(), updatedAt: new Date() };
    await Report.collection.insertOne(report);
    const drafts = decision === 'new_plan' ? [{ title: '后续模拟复查', date: '2026-10-21', content: '模拟建议，不是真实医疗意见', category: 'review', requiresService: true }] : [];
    const draft = await Draft.create({ patientId: patient._id, reportId: report._id, title: report.title, sourceSequence: 1,
      sourceKey: `${report._id}:1:${require('../../src/utils/reportFollowUpSource').sourceDigest(report)}`, sourceSnapshot: { title: report.title }, status: 'advisor_review', followUpAutomation: { status: 'ready' }, followUpDrafts: drafts });
    const args = { api, item: JSON.parse(JSON.stringify(task)), reportIds: [String(report._id)], decision, note: '隔离顾问一次确认', checked: true, draft: JSON.parse(JSON.stringify(draft)) };
    const result = await submitMergedOutcome(args);
    assert.equal(result.data.status, 'completed'); assert.equal(result.data.outcomeReview.sourceDraftId, String(draft._id));
    assert.equal(result.data.outcomeReview.nextFollowUpIds.length, decision === 'new_plan' ? 1 : 0);
    const count = await FollowUp.countDocuments({ sourceType: 'report_followup', sourceId: draft._id, taskRole: { $ne: 'supervisor' } });
    const replay = await submitMergedOutcome(args); assert.equal(replay.data.completedAt, result.data.completedAt);
    assert.equal(await FollowUp.countDocuments({ sourceType: 'report_followup', sourceId: draft._id, taskRole: { $ne: 'supervisor' } }), count);
    evidence.push({ decision, taskId: String(task._id), draftId: String(draft._id), nextCount: count });
  }
  fs.writeFileSync(path.join(path.dirname(manifest), 'merged-outcome-http.json'), JSON.stringify({ patientId: String(patient._id), evidence, syntheticAiInput: true }, null, 2));
  console.log('PASS one-confirmation actual review/publication/closure for new-plan + service handoff and empty conclusion; replay stable');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
