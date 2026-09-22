// Synthetic source inputs, real application HTTP routes and real Qwen outputs.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const file = process.argv[2], s = JSON.parse(fs.readFileSync(file));
  assert.equal(s.api, 'http://127.0.0.1:3002/api'); assert.match(s.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${s.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), Report = require('../../src/models/MedicalReport');
  const Draft = require('../../src/models/ReportFollowUpDraft'), FollowUp = require('../../src/models/FollowUp');
  assert.equal((await User.findById(s.patientId)).name, '隔离验收客户（纯虚构）');
  // Additional local usage cap; no changes to supplier or production policy.
  await mongoose.connection.db.collection('ai_control').updateOne({ _id: 'policy' }, { $set: { dailyCalls: 6, dailyTokens: 150000, otherDailyTokens: 150000, monthlyTokens: 150000 } }, { upsert: true });
  const tokens = {};
  async function api(route, method = 'GET', body, role = 'familyDoctor', expected = 200) {
    const r = await fetch(s.api + route, { method, headers: { 'content-type': 'application/json', ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(110000) });
    const data = await r.json(); assert.equal(r.status, expected, `${route}: ${data.message}`); return data;
  }
  for (const a of s.accounts) tokens[a.role] = (await api('/staff/login', 'POST', { username: a.username, password: a.password }, a.role)).data.token;
  const target = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), year = new Date().getFullYear();
  const report = await Report.findOne({ user: s.patientId, title: '纯虚构复查建议报告' }) || await Report.create({ user: s.patientId, title: '纯虚构复查建议报告', documentCategory: 'exam_report', type: 'other', status: 'pending', examConclusion: `纯虚构验收资料，非医疗建议。原报告明确建议于${target}复查血常规，并上传结果由健康顾问核对。`, uploadedBy: s.accounts.find(a => a.role === 'healthManager').id });
  await api(`/staff/medical-reports/${report._id}/audit`, 'PATCH', { action: 'approve' }, 'healthManager');
  let draft;
  for (let i = 0; i < 90; i++) {
    draft = await Draft.findOne({ reportId: report._id }).lean();
    if (draft && ['ready', 'failed', 'skipped'].includes(draft.followUpAutomation?.status)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.equal(draft?.followUpAutomation?.status, 'ready', JSON.stringify(draft?.followUpAutomation));
  assert.equal(draft.status, 'advisor_review'); assert.ok(draft.followUpDrafts.length);
  assert.ok(draft.followUpDrafts.some(d => d.date === target && /血常规/.test(d.title + d.content)));
  assert.equal(await FollowUp.countDocuments({ sourceType: 'report_followup', sourceId: draft._id, workflowKey: { $ne: 'report_followup:advisor_review' } }), 0);
  const approved = await api(`/staff/report-followups/${draft._id}/review`, 'POST', { action: 'approve', revision: draft.__v, followUpDrafts: draft.followUpDrafts });
  assert.equal(approved.data.followUpPublication.status, 'published');
  const count = await FollowUp.countDocuments({ sourceType: 'report_followup', sourceId: draft._id });
  await api(`/staff/report-followups/${draft._id}/review`, 'POST', { action: 'approve', revision: draft.__v, followUpDrafts: draft.followUpDrafts });
  assert.equal(await FollowUp.countDocuments({ sourceType: 'report_followup', sourceId: draft._id }), count);
  console.log('PASS live report AI -> advisor review -> publication; no pre-review dispatch; repeat stable');
  const evidence = { reportId: String(report._id), draftId: String(draft._id), reportDrafts: draft.followUpDrafts, reportPublished: true };
  fs.writeFileSync(path.join(path.dirname(file), 'live-ai-evidence.json'), JSON.stringify(evidence, null, 2));
  await api(`/staff/patients/${s.patientId}/ai-annual-plan`, 'POST', { year }, 'familyDoctor', 409);
  const assessment = (await api(`/staff/patients/${s.patientId}/professional-health-assessments`, 'POST', { purpose: 'annual_input', domain: '综合健康', title: '纯虚构年度综合健康评估', facts: ['纯虚构成人，无当前用药和营养素'], recommendations: { examinations: [{ item: '血常规', date: target, reason: '纯虚构专业评估明确建议' }] } }, 'familyDoctor', 201)).data;
  await api(`/staff/professional-health-assessments/${assessment._id}/review`, 'PATCH', { action: 'approve_advisor', revision: assessment.__v, followUpDrafts: [] });
  await api(`/staff/patients/${s.patientId}/annual-plan-preparation`, 'PUT', { year, requiredAssessmentDomains: ['综合健康'], medicationStatus: 'none', supplementStatus: 'none', advisorReady: true });
  await User.updateOne({ _id: s.patientId }, { $set: { aiHealthSummary: { sections: { medical_priority: { items: [] } } } } });
  const Scheme = require('../../src/models/FollowUpPlan'), Template = require('../../src/models/PlanTemplate');
  const standardActionPlans = {};
  for (const [key, name] of Object.entries({ medical_treatment: '需要安排就医', checkup_completion: '需要完善体检', abnormal_followup: '需要定期复查', vaccine: '疫苗接种', annual_checkup: '年度体检' })) {
    const row = await Scheme.create({ name, status: 'active', reviewStatus: 'approved', defaultRole: 'healthManager' });
    standardActionPlans[key] = { id: String(row._id), name };
  }
  const template = await Template.create({ name: '纯虚构年度验收模板', type: 'health_management', content: { standardActionPlans } });
  const annual = await api(`/staff/patients/${s.patientId}/ai-annual-plan`, 'POST', { year, planType: 'health_prevention', templateId: String(template._id), notes: '纯虚构技术验收，依据已审核专业评估，不新增无依据事项。' });
  assert.ok(annual.data && Object.keys(annual.data).length);
  assert.match(JSON.stringify(annual.data), /血常规/);
  evidence.annual = annual; evidence.assessmentId = assessment._id;
  evidence.usage = await mongoose.connection.db.collection('ai_usage').find({}, { projection: { provider: 1, model: 1, status: 1, actualTokens: 1, inputTokens: 1, outputTokens: 1 } }).toArray();
  assert.ok(evidence.usage.filter(x => x.status === 'success' && x.actualTokens > 0).length >= 2);
  fs.writeFileSync(path.join(path.dirname(file), 'live-ai-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('PASS approved professional assessment -> live annual AI; source recommendation retained');
  console.log('USAGE', JSON.stringify(evidence.usage));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
