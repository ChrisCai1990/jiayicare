// Real HTTP workflow over a synthetic isolated fixture. No annual AI/review claims.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

async function main() {
  const sessionPath = process.argv[2];
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User');
  const AnnualPlan = require('../../src/models/AnnualPlan');
  const PlanTemplate = require('../../src/models/PlanTemplate');
  const FollowUp = require('../../src/models/FollowUp');
  const patient = await User.findById(session.patientId);
  assert.equal(patient.name, '隔离验收客户（纯虚构）');
  const resultFile = path.join(path.dirname(sessionPath), 'preparation-http.json');
  const report = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : { checks: [] };
  const save = () => fs.writeFileSync(resultFile, JSON.stringify(report, null, 2));
  const check = label => { if (!report.checks.includes(label)) report.checks.push(label); save(); console.log(label); };
  const request = async (route, token, method = 'GET', body, status = 200) => {
    const res = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const json = await res.json();
    assert.equal(res.status, status, `${method} ${route}: ${JSON.stringify(json)}`);
    return json;
  };
  const tokens = {};
  for (const account of session.accounts) tokens[account.role] = (await request('/staff/login', null, 'POST', { username: account.username, password: account.password })).data.token;
  const phone = `isolated-${session.patientId}`; // deliberately not a dialable number
  patient.phone = phone; patient.clientBrand = 'jiayiguanjia'; await patient.save();
  const code = crypto.randomBytes(12).toString('hex');
  await mongoose.connection.db.collection('verificationcodes').updateOne({ phone }, { $set: { phone, code, expiresAt: new Date(Date.now() + 60000) } }, { upsert: true });
  const client = (await request('/auth/login', null, 'POST', { phone, code })).data.token;
  check('Synthetic customer authenticated through actual login route; no SMS sent');
  await FollowUp.collection.createIndex({ annualDispatchKey: 1 }, { unique: true, sparse: true });
  if (!report.annualId) {
    const targetDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const plan = await AnnualPlan.create({ patientId: patient._id, year: new Date().getFullYear(), planType: 'young_state',
      createdBy: patient.assignedFamilyDoctor, reviewStatus: 'approved', reviewedBy: patient.assignedFamilyDoctor,
      reviewedAt: new Date(), pushedAt: new Date(), moduleData: { annual_checkup: { enabled: true, date: targetDate } },
      notes: 'ISOLATED FIXTURE: approved annual input only; professional assessment and AI generation not tested.' });
    const template = await PlanTemplate.create({ type: 'annual_checkup', name: '隔离验收标准模板（非诊疗建议）', clientBrand: 'jiayiguanjia',
      content: { checkItems: [{ name: '隔离验收项目（非诊疗建议）', type: 'exam' }], addons: [] } });
    Object.assign(report, { annualId: String(plan._id), templateId: String(template._id), targetDate }); save();
  }
  await request(`/user/annual-mgmt-plans/${report.annualId}/confirm`, client, 'PATCH', {});
  await request(`/user/annual-mgmt-plans/${report.annualId}/confirm`, client, 'PATCH', {});
  const tasks = await FollowUp.find({ sourceAnnualPlanId: report.annualId, workflowKey: /^annual_checkup_preparation:/ }).lean();
  assert.equal(tasks.length, 2);
  check('Actual customer confirmation and replay created exactly two preparation tasks');
  const advisor = tasks.find(t => t.workflowKey.endsWith('familyDoctor'));
  const planner = tasks.find(t => t.workflowKey.endsWith('healthPlanner'));
  report.advisorTaskId = String(advisor._id); report.plannerTaskId = String(planner._id); save();
  const root = id => `/staff/followups/${id}/checkup-preparation`;
  await request(root(advisor._id), tokens.healthManager, 'GET', undefined, 403);
  check('Wrong-role preparation access rejected');
  let state = (await request(root(advisor._id), tokens.familyDoctor)).data.task;
  if (!report.preparedPlanId) {
    const draft = await request(root(advisor._id) + '/draft', tokens.familyDoctor, 'POST', { updatedAt: state.updatedAt, templateId: report.templateId });
    report.preparedPlanId = String(draft.data._id); save();
  }
  const plan = (await request(`/staff/plans/${report.preparedPlanId}`, tokens.familyDoctor)).data;
  if (plan.content.aiStatus !== 'approved') await request(`/staff/plans/${report.preparedPlanId}`, tokens.familyDoctor, 'PUT', { content: { ...plan.content, aiStatus: 'adopted' } });
  if (!plan.pushedAt) await request(`/staff/plans/${report.preparedPlanId}/push`, tokens.familyDoctor, 'PATCH', {});
  state = (await request(root(advisor._id), tokens.familyDoctor)).data.task;
  assert.equal(state.status, 'completed');
  check('Template draft reviewed and published through real advisor routes; original preparation task completed');
  state = (await request(root(planner._id), tokens.healthPlanner)).data.task;
  if (state.status !== 'completed') await request(root(planner._id), tokens.healthPlanner, 'PUT', { updatedAt: state.updatedAt,
    date: report.targetDate, institution: '隔离验收机构（虚构）', note: '模拟沟通凭据，仅用于隔离流程验证，未联系真实机构或客户', customerConfirmed: true, resourceConfirmed: true });
  check('Planner resource evidence saved through actual route (simulated conversation only)');
  report.readiness = (await request(root(planner._id) + '/readiness', tokens.healthPlanner)).data; save();
  if (!report.readiness.readyForServiceLink) {
    assert.equal(report.readiness.state, 'awaiting_customer');
    check('Two completed role tasks alone do not bypass customer checkup-plan confirmation');
    await request(`/user/plans/${report.preparedPlanId}/confirm`, client, 'PATCH', {});
  }
  report.readiness = (await request(root(planner._id) + '/readiness', tokens.healthPlanner)).data; save();
  assert.equal(report.readiness.readyForServiceLink, true);
  check('Customer confirmed published checkup plan; both-role readiness gate passed');
  const options = (await request(root(planner._id) + '/services', tokens.healthPlanner)).data;
  assert.equal(Array.isArray(options.services), true);
  report.availableServiceCount = options.services.length; save();
  if (!options.link) {
    const todos = (await request('/staff/ai-todos', tokens.healthPlanner)).data;
    assert.equal(todos.filter(todo => todo.type === 'checkup_handoff_pending' && todo.taskId === report.plannerTaskId).length, 1);
    check('Exactly one actionable handoff entry remains in planner workbench after preparation completion');
  }
  console.log('Evidence saved locally; service handoff and later closure not yet tested.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
