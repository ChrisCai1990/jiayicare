const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureInsuranceServiceTask, reconcilePatientInsuranceTasks } = require('../src/utils/insuranceServiceTasks');

const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const serviceTasks = route.slice(route.indexOf("router.get('/service-tasks'"), route.indexOf('// ── GET /api/staff/patients'));
const createCase = route.slice(route.indexOf("router.post('/patients/:id/insurance-cases'"), route.indexOf("router.patch('/insurance-cases/:caseId"));

test('open insurance cases self-heal into the current manager or planner workbench', () => {
  assert.match(route, /async function ensureOpenInsuranceTasksForStaff/);
  assert.match(route, /staff\.role === 'healthPlanner' \? 'supervisor'/);
  assert.match(route, /staff\.role === 'healthManager' \? 'executor'/);
  assert.match(serviceTasks, /await ensureOpenInsuranceTasksForStaff\(req\.staff\)/);
  assert.match(serviceTasks, /\['executor', 'supervisor'\]\.includes\(task\.taskRole\)/);
});

test('creating an insurance case assigns work to both configured roles', () => {
  assert.match(createCase, /assignedHealthManager assignedHealthPlanner/);
  assert.match(createCase, /ensureInsuranceServiceTask\(serviceCase, 'executor', assignee\)/);
  assert.match(createCase, /ensureInsuranceServiceTask\(serviceCase, 'supervisor', patient\.assignedHealthPlanner\)/);
});

test('completed insurance task prevents recreation and retires superseded older work and untouched duplicates', async () => {
  const cancelled = [];
  let created = false;
  const model = {
    findOne: () => ({ select: () => ({ lean: async () => ({ _id: 'done', sourceId: 'case', taskRole: 'executor', completedAt: '2026-10-16T05:20:24Z' }) }) }),
    find: () => ({ select: () => ({ lean: async () => [
      { _id: 'duplicate', createdAt: '2026-10-16T05:23:47Z', serviceChecklist: [{ purpose: '登记费用' }] },
      { _id: 'worked-on', createdAt: '2026-10-16T05:24:00Z', executedContent: '补充材料' },
      { _id: 'older', createdAt: '2026-09-09T11:00:00Z', updatedAt: '2026-09-09T11:30:00Z', executedContent: '已联系客户，待补资料' },
    ] }) }),
    updateMany: async (filter, update) => { cancelled.push({ filter, update }); },
    findOneAndUpdate: async () => { created = true; },
  };
  const result = await ensureInsuranceServiceTask(model, { _id: 'case' }, 'executor', 'manager', {});
  assert.equal(result._id, 'done');
  assert.equal(created, false);
  assert.deepEqual(cancelled[0].filter._id.$in, ['duplicate', 'older']);
  assert.equal(cancelled[0].update.$set.status, 'cancelled');
});

test('completed executor reconciliation also includes legacy insurance follow-ups', async () => {
  let activeFilter;
  const model = {
    findOne: () => ({ select: () => ({ lean: async () => ({ _id: 'done', sourceId: 'case', taskRole: 'executor', completedAt: '2026-10-16T05:20:24Z' }) }) }),
    find: filter => { activeFilter = filter; return { select: () => ({ lean: async () => [] }) }; },
  };
  await ensureInsuranceServiceTask(model, { _id: 'case' }, 'executor', 'manager', {});
  assert.ok(activeFilter.$or.some(item => item.sourceType === 'insurance_case'));
  assert.ok(activeFilter.$or.some(item => item.sourceType === 'scheduled' && item.tags === '保险服务'));
});

test('patient detail read reconciles completed insurance tasks before listing them', async () => {
  const queries = [];
  const model = {
    find: filter => {
      queries.push(filter);
      return { select: () => ({ lean: async () => filter.status === 'completed'
        ? [{ _id: 'done', sourceId: 'case', taskRole: 'executor', completedAt: '2026-10-16T05:20:24Z' }]
        : [{ _id: 'duplicate', createdAt: '2026-10-16T05:23:47Z' }] }) };
    },
    updateMany: async filter => { assert.deepEqual(filter._id.$in, ['duplicate']); },
  };
  await reconcilePatientInsuranceTasks(model, 'patient');
  assert.equal(queries[0].patientId, 'patient');
  assert.equal(queries[1].sourceId, 'case');
});

test('open insurance case without a completed task still has one active task', async () => {
  const model = {
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
    findOneAndUpdate: async (filter, update, options) => {
      assert.deepEqual(filter.status.$in, ['planned', 'in_progress', 'missed']);
      assert.equal(update.$set.assignedTo, 'manager');
      assert.equal(options.upsert, true);
      return { _id: 'active' };
    },
  };
  const result = await ensureInsuranceServiceTask(model, { _id: 'case' }, 'executor', 'manager', { theme: '保险事务' });
  assert.equal(result._id, 'active');
});
