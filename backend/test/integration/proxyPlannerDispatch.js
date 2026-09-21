// Synthetic records in the existing isolated database; actual workflow functions, not HTTP/UI acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  const localFetch = global.fetch;
  const deny = () => { throw new Error('External side effects forbidden in isolated dispatch test'); };
  global.fetch = deny;
  for (const protocol of ['node:http', 'node:https']) {
    require(protocol).request = deny;
    require(protocol).get = deny;
  }
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User');
  const Order = require('../../src/models/Order');
  const FollowUp = require('../../src/models/FollowUp');
  const { advanceMedicalProxyWorkflow, validateMedicalProxyStage } = require('../../src/utils/medicalProxyWorkflow');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const account = role => session.accounts.find(a => a.role === role).id;
  const tokens = {};
  const complete = async (task, role) => {
    const request = async (path, body, method = 'POST', token) => {
      const response = await localFetch(session.api + path, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    };
    if (!tokens[role]) {
      const user = session.accounts.find(a => a.role === role);
      tokens[role] = (await request('/staff/login', { username: user.username, password: user.password })).data.token;
    }
    await request(`/staff/followups/${task._id}`, { status: 'completed', formData: task.formData, content: '隔离交接验证', executedContent: '隔离交接验证', executedType: 'other' }, 'PUT', tokens[role]);
  };
  const patient = await User.create({ name: '隔离代诊派单客户（纯虚构）', assignedHealthManager: account('healthManager'), assignedHealthPlanner: account('healthPlanner'), assignedFamilyDoctor: account('familyDoctor') });
  const order = await Order.create({ user: patient._id, serviceId: 'isolated-proxy-dispatch', serviceName: '医疗代诊服务', initiationSource: 'staff_direct' });
  const base = { patientId: patient._id, staffId: account('familyDoctor'), sourceType: 'order', sourceOrderId: order._id };
  await FollowUp.create({ ...base, assignedTo: account('healthPlanner'), workflowKey: 'medical_proxy:supervise', status: 'in_progress', formData: { currentStage: 'advisor' } });
  const advisor = await FollowUp.create({ ...base, assignedTo: account('familyDoctor'), workflowKey: 'medical_proxy:advisor', status: 'completed', formData: { initiationSource: 'staff_direct', hospital: '隔离医院', department: '隔离科室', expert: '虚构专家', proxyGoal: '测试交接', communicationContent: '合成资料交接验证' } });
  await advanceMedicalProxyWorkflow(advisor);
  const booking = await FollowUp.findOne({ sourceOrderId: order._id, workflowKey: 'medical_proxy:booking' });
  assert.equal(String(booking.assignedTo), account('healthManager'));
  booking.formData = { ...booking.formData, preferredDateStart: '2026-09-22', preferredDateEnd: '2026-09-24', appointmentDate: '2026-09-23', appointmentTime: '09:30' };
  assert.equal(await validateMedicalProxyStage(booking, { status: 'completed', formData: booking.formData }, { _id: account('healthManager'), role: 'healthManager' }), '');
  await complete(booking, 'healthManager');
  await complete(booking, 'healthManager');
  assert.equal(await FollowUp.countDocuments({ sourceOrderId: order._id, workflowKey: 'medical_proxy:planner' }), 1);
  assert.equal(await FollowUp.countDocuments({ sourceOrderId: order._id, workflowKey: 'medical_proxy:execute' }), 0);
  const planner = await FollowUp.findOne({ sourceOrderId: order._id, workflowKey: 'medical_proxy:planner' });
  assert.equal(String(planner.assignedTo), account('healthPlanner'));
  assert.equal(planner.formData.bookingSnapshot.appointmentDate, '2026-09-23');
  assert.equal(planner.formData.planSnapshot.communicationContent, '合成资料交接验证');
  planner.formData = { ...planner.formData, medicalAssistantId: account('medicalAssistant') };
  assert.equal(await validateMedicalProxyStage(planner, { status: 'completed', formData: planner.formData }, { _id: account('healthPlanner'), role: 'healthPlanner' }), '');
  await complete(planner, 'healthPlanner');
  await complete(planner, 'healthPlanner');
  const execution = await FollowUp.findOne({ sourceOrderId: order._id, workflowKey: 'medical_proxy:execute' });
  assert.equal(String(execution.assignedTo), account('medicalAssistant'));
  assert.equal(execution.formData.bookingSnapshot.appointmentDate, '2026-09-23');
  assert.equal(await FollowUp.countDocuments({ sourceOrderId: order._id, workflowKey: 'medical_proxy:execute' }), 1);
  assert.equal((await FollowUp.findById(booking._id)).status, 'completed');
  assert.equal((await Order.findById(order._id)).currentStage, 'execute');
  await complete(booking, 'healthManager');
  assert.equal((await FollowUp.findById(planner._id)).status, 'completed');
  assert.equal((await Order.findById(order._id)).currentStage, 'execute');
  console.log(JSON.stringify({ passed: true, orderId: order._id, patientId: patient._id, scope: 'synthetic advisor input; actual booking/planner HTTP dispatch and Mongo assertions; no UI/fulfillment acceptance' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
