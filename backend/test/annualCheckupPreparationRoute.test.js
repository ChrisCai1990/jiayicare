require('express-async-errors');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const FollowUp = require('../src/models/FollowUp');
const AnnualPlan = require('../src/models/AnnualPlan');
const HealthPlan = require('../src/models/HealthPlan');
const flow = require('../src/utils/annualCheckupEvidence');
const ids = { task: '000000000000000000000001', patient: '000000000000000000000002', annual: '000000000000000000000003',
  advisor: '000000000000000000000004', planner: '000000000000000000000005', plan: '000000000000000000000006' };
let actor;
const auth = require.resolve('../src/middleware/staffAuth');
require(auth); require.cache[auth].exports = (req, res, next) => { req.staff = actor; next(); };
const router = require('../src/routes/annualCheckupPreparation');
const suggestionService = require('../src/utils/checkupPreparationSuggestion');
const updatedAt = new Date('2026-09-01T01:00:00Z');
const annual = { _id: ids.annual, patientId: ids.patient, confirmedAt: '2026-09-01', pushedAt: '2026-08-30', reviewStatus: 'approved' };
const checkup = { _id: ids.plan, patientId: ids.patient, title: '体检方案', type: 'annual_checkup', status: 'draft', createdAt: '2026-09-02', content: { aiStatus: 'pending' } };
const task = (role = 'familyDoctor') => ({ _id: ids.task, patientId: ids.patient, sourceAnnualPlanId: ids.annual,
  assignedTo: role === 'familyDoctor' ? ids.advisor : ids.planner, updatedAt, status: 'planned',
  sourceType: 'annual_service', workflowKey: `annual_checkup_preparation:${role}`, sourceScheduleKey: `annual_checkup:2027-03-15:prepare:${role}`,
  formData: { annualCheckupPreparation: { version: 1, role, targetDate: '2027-03-15' } } });

async function request(t, method = 'GET', body = {}, id = ids.task, suffix = '') {
  const app = express(); app.use(express.json()); app.use('/followups', router);
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/followups/${id}/checkup-preparation${suffix}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
function setup(t, row = task()) {
  t.mock.method(require('../src/utils/checkupSuggestionQueue'), 'wakeCheckupSuggestionQueue', () => {});
  actor = { _id: row.assignedTo, role: row.formData.annualCheckupPreparation.role };
  t.mock.method(FollowUp, 'findById', () => ({ lean: async () => row, populate: async () => row }));
  t.mock.method(AnnualPlan, 'findById', () => ({ lean: async () => annual }));
  t.mock.method(HealthPlan, 'findById', () => ({ lean: async () => checkup }));
  t.mock.method(flow, 'reconcileCheckupPreparation', async () => 0);
  t.mock.method(FollowUp, 'updateOne', async () => ({ matchedCount: 1 }));
}

test('预约激活与恢复接口传入当前规划师任务及操作者', async t => {
  setup(t, task('healthPlanner'));
  t.mock.method(require('../src/utils/checkupPreparationActivation'), 'createActivationService', () => ({
    activate: async (id, staff) => { assert.equal(id, ids.task); assert.equal(staff.role, 'healthPlanner'); return { status: 'active' }; },
    recover: async (id, staff, input) => { assert.equal(input.token, 'run'); return { status: 'activation_failed' }; },
  }));
  assert.equal((await request(t, 'POST', {}, ids.task, '/activate')).body.data.status, 'active');
  assert.equal((await request(t, 'POST', { token: 'run' }, ids.task, '/activation-recover')).body.data.status, 'activation_failed');
});

test('预约激活流程缺失明确返回409，不创建替代任务', async t => {
  setup(t, task('healthPlanner'));
  t.mock.method(require('../src/utils/checkupPreparationActivation'), 'createActivationService', () => ({ activate: async () => {
    throw Object.assign(new Error('原任务不存在'), { statusCode: 409 });
  } }));
  t.mock.method(FollowUp, 'create', () => assert.fail('不得创建替代任务'));
  const result = await request(t, 'POST', {}, ids.task, '/activate');
  assert.equal(result.status, 409); assert.equal(result.body.success, false);
});

test('具体体检服务候选和关联接口使用独立承接处理器', async t => {
  setup(t, task('healthPlanner'));
  t.mock.method(require('../src/utils/checkupPreparationHandoff'), 'createHandoffService', () => ({
    options: async (id, staff) => { assert.equal(id, ids.task); assert.equal(staff.role, 'healthPlanner'); return { services: [] }; },
    link: async (id, staff, input) => { assert.equal(input.servicePlanId, ids.plan); return { status: 'linked_pending_activation' }; },
  }));
  assert.equal((await request(t, 'GET', {}, ids.task, '/services')).status, 200);
  const result = await request(t, 'POST', { servicePlanId: ids.plan }, ids.task, '/service-link');
  assert.equal(result.status, 200); assert.equal(result.body.data.status, 'linked_pending_activation');
});

test('承接索引未就绪的冲突明确返回，不伪造预约成功', async t => {
  setup(t, task('healthPlanner'));
  t.mock.method(require('../src/utils/checkupPreparationHandoff'), 'createHandoffService', () => ({ link: async () => {
    throw Object.assign(new Error('唯一索引未就绪'), { statusCode: 409 });
  } }));
  const result = await request(t, 'POST', {}, ids.task, '/service-link');
  assert.equal(result.status, 409); assert.equal(result.body.success, false);
});

test('双岗位汇合接口只读返回当前状态，不启动服务或写入任务', async t => {
  setup(t, task('healthPlanner'));
  t.mock.method(require('../src/utils/checkupPreparationReadiness'), 'loadReadiness', async (id, staff, models, gate) => {
    assert.equal(id, ids.task); assert.equal(staff.role, 'healthPlanner'); assert.equal(models.FollowUp, FollowUp);
    assert.equal(typeof gate, 'function'); return { state: 'ready_for_service_link', readyForServiceLink: true, serviceStarted: false };
  });
  t.mock.method(FollowUp, 'updateOne', () => assert.fail('只读不可写任务'));
  t.mock.method(HealthPlan, 'updateOne', () => assert.fail('只读不可启动服务'));
  const result = await request(t, 'GET', {}, ids.task, '/readiness');
  assert.equal(result.status, 200); assert.equal(result.body.data.serviceStarted, false);
});

test('其他顾问无法读取双岗位汇合结果', async t => {
  setup(t); actor._id = ids.planner;
  t.mock.method(require('../src/utils/checkupPreparationReadiness'), 'loadReadiness', () => assert.fail('不得读取其他客户准备信息'));
  assert.equal((await request(t, 'GET', {}, ids.task, '/readiness')).status, 403);
});

test('AI加项读取、生成、审核及恢复接口传入当前任务和真实操作者', async t => {
  setup(t); const calls = [];
  t.mock.method(suggestionService, 'createSuggestionService', models => {
    assert.equal(models.HealthPlan, HealthPlan);
    assert.equal(models.Suggestion.modelName, 'CheckupPreparationSuggestion');
    return Object.fromEntries(['read', 'generate', 'review', 'recover'].map(action => [action, async (id, staff, body) => {
      calls.push({ action, id, staff, body }); return { action };
    }]));
  });
  for (const [method, suffix, action] of [['GET', '/addons', 'read'], ['POST', '/addons', 'generate'],
    ['POST', '/addons/review', 'review'], ['POST', '/addons/recover', 'recover']]) {
    const result = await request(t, method, { token: 'run', indexes: [] }, ids.task, suffix);
    assert.equal(result.status, 200); assert.equal(result.body.data.action, action);
    assert.equal(calls.at(-1).id, ids.task); assert.equal(calls.at(-1).staff._id, ids.advisor);
  }
});

test('AI加项任务不归本人或无方案编辑权限时不调用生成服务', async t => {
  setup(t);
  t.mock.method(suggestionService, 'createSuggestionService', () => assert.fail('不能进入AI处理器'));
  actor = { _id: ids.planner, role: 'familyDoctor' };
  assert.equal((await request(t, 'POST', {}, ids.task, '/addons')).status, 403);
  actor = { _id: ids.advisor, role: 'familyDoctor', customRoleId: ids.plan };
  const Role = require('../src/models/StaffRole');
  t.mock.method(Role, 'findById', () => ({ select: () => ({ lean: async () => ({ permissions: { followups: { edit: true }, plans: { view: true, edit: false } } }) }) }));
  assert.equal((await request(t, 'POST', {}, ids.task, '/addons/review')).status, 403);
});

test('AI业务冲突以409返回，不伪造审核成功', async t => {
  setup(t);
  t.mock.method(suggestionService, 'createSuggestionService', () => ({ review: async () => {
    throw Object.assign(new Error('方案或审核资料已变化'), { statusCode: 409 });
  } }));
  const result = await request(t, 'POST', { token: 'old', indexes: [0] }, ids.task, '/addons/review');
  assert.equal(result.status, 409); assert.equal(result.body.success, false);
});

test('错误ID、不存在任务及同角色他人均不能读取准备信息', async t => {
  setup(t);
  assert.equal((await request(t, 'GET', {}, 'invalid')).status, 400);
  actor = { _id: ids.planner, role: 'familyDoctor' };
  assert.equal((await request(t)).status, 403);
  t.mock.method(FollowUp, 'findById', () => ({ lean: async () => null }));
  assert.equal((await request(t)).status, 404);
});

test('顾问候选方案查询限定同一客户、本年度确认后、有效体检方案', async t => {
  setup(t);
  t.mock.method(HealthPlan, 'find', query => {
    assert.equal(query.patientId, ids.patient); assert.equal(query.type, 'annual_checkup');
    assert.equal(query.createdAt.$gte, annual.confirmedAt); assert.deepEqual(query.status.$in, ['draft', 'active']);
    const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => [checkup] }; return chain;
  });
  assert.equal((await request(t)).body.data.plans.length, 1);
});

test('规划师只读取资源准备，不加载顾问方案列表', async t => {
  setup(t, task('healthPlanner'));
  t.mock.method(HealthPlan, 'find', () => assert.fail('规划师不查询顾问方案列表'));
  assert.deepEqual((await request(t)).body.data.plans, []);
});

test('读取期间任务改派，第二次鉴权拒绝方案列表', async t => {
  setup(t); let reads = 0;
  t.mock.method(FollowUp, 'findById', () => ({ lean: async () => ({ ...task(), assignedTo: reads++ ? ids.planner : ids.advisor }) }));
  t.mock.method(HealthPlan, 'find', () => assert.fail('改派后不得查询方案'));
  assert.equal((await request(t)).status, 403);
});

test('顾问可关联草稿但不能通过body伪造准备完成、服务关联或审批', async t => {
  setup(t); let update;
  t.mock.method(FollowUp, 'updateOne', async (filter, value) => { update = value; return { matchedCount: 1 }; });
  const response = await request(t, 'PUT', { healthPlanId: ids.plan, updatedAt, status: 'completed', review: { by: ids.advisor }, sourceOrderId: ids.plan });
  assert.equal(response.status, 200); assert.equal(update.$set.status, 'in_progress');
  assert.equal(update.$set['formData.annualCheckupPreparation.evidence'].review, undefined);
  assert.equal(update.$set.sourceOrderId, undefined);
});

test('跨客户方案或不匹配年度来源保存被拒绝', async t => {
  setup(t);
  t.mock.method(HealthPlan, 'findById', () => ({ lean: async () => ({ ...checkup, patientId: ids.planner }) }));
  assert.equal((await request(t, 'PUT', { healthPlanId: ids.plan, updatedAt })).status, 400);
  t.mock.method(AnnualPlan, 'findById', () => ({ lean: async () => ({ ...annual, patientId: ids.planner }) }));
  assert.equal((await request(t, 'PUT', { healthPlanId: ids.plan, updatedAt })).status, 409);
});

test('保存并发冲突返回409而不是成功；客户消息、订单和方案不写入', async t => {
  setup(t);
  t.mock.method(HealthPlan, 'create', () => assert.fail('不能生成服务方案'));
  t.mock.method(HealthPlan, 'updateOne', () => assert.fail('不能修改实际方案'));
  t.mock.method(FollowUp, 'updateOne', async () => ({ matchedCount: 0 }));
  assert.equal((await request(t, 'PUT', { healthPlanId: ids.plan, updatedAt })).status, 409);
});

test('重复提交已经完成的准备记录不重开也不覆盖证据', async t => {
  setup(t, { ...task(), status: 'completed' });
  t.mock.method(FollowUp, 'updateOne', () => assert.fail('不能重写完成证据'));
  assert.equal((await request(t, 'PUT', { healthPlanId: ids.plan, updatedAt })).status, 409);
});

test('新建准备接口路由到独立草稿处理器', async t => {
  setup(t);
  const generator = require('../src/utils/checkupPreparationDraft');
  t.mock.method(generator, 'createPreparationDraft', async (row, source, input, staff) => {
    assert.equal(row._id, ids.task); assert.equal(source._id, ids.annual); assert.equal(staff._id, ids.advisor);
    return { plan: checkup, reused: false };
  });
  const response = await request(t, 'POST', { templateId: ids.plan, updatedAt, startService: true }, ids.task, '/draft');
  assert.equal(response.status, 200); assert.equal(response.body.data._id, ids.plan);
});

test('其他顾问或无创建方案权限的自定义角色不能新建准备草稿', async t => {
  setup(t);
  actor = { _id: ids.planner, role: 'familyDoctor' };
  assert.equal((await request(t, 'POST', { updatedAt }, ids.task, '/draft')).status, 403);
  const Role = require('../src/models/StaffRole');
  actor = { _id: ids.advisor, role: 'familyDoctor', customRoleId: ids.plan };
  t.mock.method(Role, 'findById', () => ({ select: () => ({ lean: async () => ({ permissions: { followups: { edit: true }, plans: { create: false } } }) }) }));
  assert.equal((await request(t, 'POST', { updatedAt }, ids.task, '/draft')).status, 403);
});
