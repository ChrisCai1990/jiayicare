const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
function route(method, url) {
  const start = source.indexOf(`router.${method}('${url}'`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n});', start) + 4);
}
function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
}
async function generate({ role = 'familyDoctor', templateName = '住院一站式服务', orderName, visible = ['patient'] } = {}) {
  let handler, created, aiCalls = 0;
  const template = templateName ? { _id: 'template', name: templateName, content: {} } : null;
  const query = value => ({ select: () => query(value), lean: async () => value, then: resolve => Promise.resolve(value).then(resolve) });
  vm.runInNewContext(route('post', '/patients/:id/ai-medical-assist-plan'), {
    router: { post: (...args) => { handler = args.at(-1); } }, staffAuth: () => {},
    getVisiblePlanPatientIds: async () => visible,
    User: { findById: () => query({ _id: 'patient', name: '测试客户', healthProfile: {} }) },
    Order: { findOne: () => query(orderName ? { _id: 'order', serviceName: orderName } : null) },
    PlanTemplate: { findOne: () => query(template), find: () => query([]) },
    HealthPlan: { create: async data => { created = data; return data; } },
    require: name => { assert.equal(name, '../utils/ai'); return { chat: async () => { aiCalls++; return '{"tasks":"确认就医需求\\n确认预约安排"}'; } }; },
  });
  const res = response();
  await handler({ staff: { role, _id: 'creator' }, params: { id: 'patient' }, query: {
    ...(templateName ? { templateId: 'template' } : {}), ...(orderName ? { orderId: 'order' } : {}),
  } }, res);
  return { res, created, aiCalls };
}
test('advisor generates inpatient plan from selected template without an order', async () => {
  const { res, created, aiCalls } = await generate();
  assert.equal(res.code, 200, res.data?.message);
  assert.equal(aiCalls, 1);
  assert.equal(created.staffId, 'creator');
  assert.equal(created.content.serviceScene, 'inpatient_one_stop');
  assert.equal(created.content.aiStatus, 'pending');
  assert.equal(created.status, 'draft');
});
test('advisor generates inpatient order plan without template', async () => {
  const { res, created } = await generate({ templateName: null, orderName: '住院一站式服务' });
  assert.equal(res.code, 200, res.data?.message);
  assert.equal(created.sourceOrderId, 'order');
  assert.equal(created.content.serviceScene, 'inpatient_one_stop');
});
test('advisor cannot use another template or unspecified service, even with inpatient order', async () => {
  for (const options of [{ templateName: '就医陪同服务' }, { templateName: null }, { templateName: '就医陪同服务', orderName: '住院一站式服务' }]) {
    const { res, created, aiCalls } = await generate(options);
    assert.equal(res.code, 403);
    assert.equal(created, undefined);
    assert.equal(aiCalls, 0);
  }
});
test('planner and superadmin retain ordinary plan generation', async () => {
  for (const role of ['healthPlanner', 'superadmin']) {
    const { res } = await generate({ role, templateName: '就医陪同服务' });
    assert.equal(res.code, 200, res.data?.message);
  }
});
test('unrelated staff and inaccessible patients are rejected before AI or writes', async () => {
  for (const options of [{ role: 'nutritionist' }, { role: 'healthManager' }, { role: 'medicalAssistant' }, { visible: [] }]) {
    const { res, created, aiCalls } = await generate(options);
    assert.equal(res.code, 403);
    assert.equal(created, undefined);
    assert.equal(aiCalls, 0);
  }
});
function permissions() {
  const start = source.indexOf('const PLAN_TYPE_OWNER_ROLE =');
  const end = source.indexOf('// 自定义角色的', start);
  const ctx = { Admin: { findById: () => ({ select: () => ({ lean: async () => ({ role: 'familyDoctor' }) }) }) } };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  return ctx;
}
test('inpatient advisor owner passes role and ownership gates, unrelated advisor does not', async () => {
  const ctx = permissions();
  for (const content of [{ templateName: '住院一站式服务' }, { serviceScene: 'inpatient_one_stop' }]) {
    const plan = { type: 'medical_assist', staffId: 'creator', content };
    assert.equal(ctx.checkPlanTypeRole(plan, 'familyDoctor'), true);
    assert.equal(await ctx.canManagePlan({ staff: { _id: 'creator', role: 'familyDoctor' } }, plan), true);
    assert.equal(await ctx.canManagePlan({ staff: { _id: 'other', role: 'familyDoctor' } }, plan), false);
    assert.equal(ctx.checkPlanTypeRole(plan, 'nutritionist'), false);
  }
  assert.equal(ctx.checkPlanTypeRole({ type: 'medical_assist', content: { templateName: '就医陪同服务' } }, 'familyDoctor'), false);
});
test('actual update route lets advisor save own inpatient plan', async () => {
  const ctx = permissions();
  let handler, saved = 0;
  const plan = { type: 'medical_assist', staffId: 'creator', content: { templateName: '住院一站式服务' }, markModified() {}, save: async () => { saved++; } };
  Object.assign(ctx, { router: { put: (...args) => { handler = args.at(-1); } }, staffAuth: () => {}, checkPermission: () => () => {}, planTypeAllowed: async () => true, HealthPlan: { findById: async () => plan } });
  vm.runInContext(route('put', '/plans/:id'), ctx);
  const res = response();
  await handler({ params: { id: 'plan' }, staff: { role: 'familyDoctor', _id: 'creator' }, body: { description: '已核对预约信息' } }, res);
  assert.equal(res.code, 200, res.data?.message);
  assert.equal(saved, 1);
  assert.equal(plan.description, '已核对预约信息');
});
test('actual push route permits own inpatient plan and rejects another advisor', async () => {
  for (const staffId of ['creator', 'other']) {
    const ctx = permissions();
    let handler, saves = 0, pushes = 0;
    const plan = { _id: 'plan', patientId: 'patient', type: 'medical_assist', staffId: 'creator', content: { serviceScene: 'inpatient_one_stop' }, save: async () => { saves++; } };
    Object.assign(ctx, {
      router: { patch: (...args) => { handler = args.at(-1); } }, staffAuth: () => {},
      getVisiblePlanPatientIds: async () => ['patient'], planTypeAllowed: async () => true,
      HealthPlan: { findById: async () => plan }, PushRecord: { create: async () => { pushes++; } },
      FollowUp: { findOneAndUpdate: async () => ({}) }, ServiceRecord: { findOneAndUpdate: async () => ({}) },
    });
    vm.runInContext(route('patch', '/plans/:id/push'), ctx);
    const res = response();
    await handler({ params: { id: 'plan' }, staff: { role: 'familyDoctor', _id: staffId } }, res);
    assert.equal(res.code, staffId === 'creator' ? 200 : 403, res.data?.message);
    assert.equal(saves, staffId === 'creator' ? 1 : 0);
    assert.equal(pushes, saves);
  }
});
