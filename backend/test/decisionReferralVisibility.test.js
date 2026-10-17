const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const FollowUp = require('../src/models/FollowUp');
const Order = require('../src/models/Order');
const HealthPlan = require('../src/models/HealthPlan');
const CareFlow = require('../src/models/CareFlow');
const Insurance = require('../src/models/InsuranceServiceCase');
const Link = require('../src/models/FollowUpServiceLink');
const Request = require('../src/models/ServiceSupervisionRequest');
const { loadServices } = require('../src/utils/advisorSupervision');
const supervisionRouter = require('../src/routes/advisorSupervision');

test('advisor sees the transferred decision service as an actionable stage with planner intake', async () => {
  const models = [User, Admin, FollowUp, Order, HealthPlan, CareFlow, Insurance, Link];
  const originals = models.map(model => model.find);
  const originalRequestFind = Request.find;
  const query = rows => ({ select() { return this; }, lean: async () => rows });
  const now = new Date();
  try {
    User.find = () => query([{ _id: 'patient', name: '测试客户', tenantId: 'tenant', assignedFamilyDoctor: 'advisor', assignedHealthPlanner: 'planner' }]);
    Admin.find = () => query([{ _id: 'advisor', name: '健康顾问', role: 'familyDoctor' }, { _id: 'planner', name: '健康规划师', role: 'healthPlanner' }]);
    FollowUp.find = () => query([
      { _id: 'intake', patientId: 'patient', sourceType: 'order', sourceOrderId: 'order', taskRole: 'executor',
        status: 'in_progress', theme: '订单服务：企业家健康决策计划', assignedTo: 'planner',
        executedContent: '肺结节、巧克力囊肿，需要专科解析', updatedAt: now },
      { _id: 'advisor-task', patientId: 'patient', sourceType: 'order', sourceOrderId: 'order', taskRole: 'executor',
        status: 'planned', workflowKey: 'decision_referral:advisor', theme: '顾问确认解析方案并转介',
        assignedTo: 'advisor', date: now, updatedAt: now },
    ]);
    Order.find = () => query([{ _id: 'order', user: 'patient', serviceName: '企业家健康决策计划', status: 'scheduled',
      paymentStatus: 'paid', tradeStatus: 'paid', refundStatus: 'none', servicePrice: 5980,
      currentStage: 'advisor', currentAssignee: 'advisor', supervisorId: 'planner', supervisionStatus: 'in_progress', updatedAt: now }]);
    for (const model of [HealthPlan, CareFlow, Insurance, Link]) model.find = () => query([]);
    const rows = await loadServices({ _id: 'advisor', role: 'familyDoctor', tenantId: 'tenant' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].current[0].taskId, 'advisor-task');
    assert.equal(rows[0].actionTaskId, 'advisor-task');
    assert.equal(rows[0].attention, true);
    assert.equal(rows[0].progress.label, '顾问确定方案并转介');
    assert.equal(rows[0].progress.step, 2);
    assert.equal(rows[0].current[0].person.name, '健康顾问');
    assert.match(rows[0].latest.content, /肺结节、巧克力囊肿/);
    const plannerRows = await loadServices({ _id: 'planner', role: 'healthPlanner', tenantId: 'tenant' },
      { patientIds: ['patient'], includeOwn: true });
    assert.equal(plannerRows[0].current[0].person.name, '健康顾问');
    assert.equal(plannerRows[0].progress.step, 2);
    assert.equal(plannerRows[0].actionTaskId, '');
    Request.find = () => ({ sort() { return this; }, lean: async () => [] });
    const handler = supervisionRouter.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack[0].handle;
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ staff: { _id: 'planner', role: 'healthPlanner', tenantId: 'tenant' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.services.length, 1);
    assert.equal(response.body.data.services[0].progress.label, '顾问确定方案并转介');
    assert.equal(response.body.data.services[0].current[0].person.name, '健康顾问');
  } finally { models.forEach((model, index) => { model.find = originals[index]; }); Request.find = originalRequestFind; }
});
