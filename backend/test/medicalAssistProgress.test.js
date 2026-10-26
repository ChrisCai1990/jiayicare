const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf("router.get('/medical-assist-progress'");
const end = source.indexOf("router.get('/service-tasks'", start);
assert.ok(start >= 0 && end > start);

const query = rows => {
  const result = Promise.resolve(rows);
  for (const method of ['select', 'populate', 'sort', 'limit']) result[method] = () => result;
  result.lean = () => result;
  return result;
};

async function progressFor({ plans = [], orders = [], tasks = [] }) {
  let handler;
  const context = {
    router: { get: (_route, _auth, fn) => { handler = fn; } },
    staffAuth: () => {},
    User: { find: () => query([{ _id: 'patient', name: '测试客户', assignedHealthPlanner: { name: '规划师' } }]) },
    HealthPlan: { find: () => query(plans) },
    Order: { find: () => query(orders) },
    FollowUp: { find: filter => query(filter?.status?.$in ? tasks.filter(task => filter.status.$in.includes(task.status || 'planned')) : tasks) },
    require: name => {
      assert.equal(name, '../utils/supervisionProgress');
      return { loadSupervisionProgress: async () => new Map() };
    },
  };
  vm.runInNewContext(source.slice(start, end), context);
  let response;
  await handler({ staff: { role: 'familyDoctor', _id: 'advisor' }, query: {} }, { json: value => { response = value; } });
  return response.data;
}

test('old open service records without active tasks do not remain in advisor progress', async () => {
  const rows = await progressFor({
    plans: [{ _id: 'old-plan', patientId: 'patient', title: '旧就医陪同方案', status: 'active' }],
    orders: [{ _id: 'old-order', user: 'patient', serviceName: '医疗代办服务' }],
  });
  assert.equal(rows.length, 0);
});

test('actual executor work remains visible even when no planner supervisor task exists', async () => {
  const rows = await progressFor({
    orders: [{ _id: 'active-order', user: 'patient', serviceName: '医疗代办服务' }],
    tasks: [{ _id: 'execution', sourceOrderId: 'active-order', taskRole: 'executor', theme: '健管专员核对资料', assignedTo: { name: '健管专员' } }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, '健管专员核对资料');
  assert.equal(rows[0].assignee, '健管专员');
});

test('a linked order task keeps its active plan visible without a duplicate order card', async () => {
  const rows = await progressFor({
    plans: [{ _id: 'plan', patientId: 'patient', sourceOrderId: 'order', title: '就医方案', status: 'active' }],
    orders: [{ _id: 'order', user: 'patient', serviceName: '医疗代办服务' }],
    tasks: [{ _id: 'execution', sourceOrderId: 'order', taskRole: 'executor', theme: '预约门诊' }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'plan:plan');
  assert.equal(rows[0].stage, '预约门诊');
});

test('detail includes earlier completed stages and the active stage for the same service', async () => {
  const rows = await progressFor({
    orders: [{ _id: 'order', user: 'patient', serviceName: '陪同看诊服务' }],
    tasks: [
      { _id: 'done', sourceOrderId: 'order', taskRole: 'executor', status: 'completed', theme: '核对资料', assignedTo: { name: '健管专员' }, createdAt: '2026-10-20' },
      { _id: 'active', sourceOrderId: 'order', taskRole: 'executor', status: 'in_progress', theme: '陪同看诊', assignedTo: { name: '就医专员' }, createdAt: '2026-10-21' },
      { _id: 'other', sourceOrderId: 'another-order', taskRole: 'executor', status: 'completed', theme: '其他服务' },
    ],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(Array.from(rows[0].stages, stage => [stage.label, stage.status, stage.assignee]), [
    ['核对资料', 'completed', '健管专员'],
    ['陪同看诊', 'in_progress', '就医专员'],
  ]);
});
test('initiated medical service projects creation time, appointment and request', async () => {
  const rows = await progressFor({
    plans: [{ _id: 'plan', patientId: 'patient', title: '专家约诊服务方案', status: 'active',
      initiatedByStaff: 'advisor', createdAt: '2026-10-26T02:00:00.000Z', description: '安排心内科专家复诊',
      content: { serviceDate: '2026-11-02' } }],
    tasks: [{ _id: 'task', sourceHealthPlanId: 'plan', taskRole: 'executor', theme: '预约专家' }],
  });
  assert.equal(rows[0].startedBySelf, true);
  assert.equal(rows[0].createdAt, '2026-10-26T02:00:00.000Z');
  assert.equal(rows[0].serviceTime, '2026-11-02');
  assert.equal(rows[0].requestContent, '安排心内科专家复诊');
});
