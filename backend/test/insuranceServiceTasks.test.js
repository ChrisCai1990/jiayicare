const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureInsuranceServiceTask, reconcilePatientInsuranceTasks, closeInsuranceCaseFromExecution } = require('../src/utils/insuranceServiceTasks');

const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const serviceTasks = route.slice(route.indexOf("router.get('/service-tasks'"), route.indexOf('// ── GET /api/staff/patients'));
const createCase = route.slice(route.indexOf("router.post('/patients/:id/insurance-cases'"), route.indexOf("router.patch('/insurance-cases/:caseId"));

test('open insurance cases self-heal into the manager workbench and retire planner supervision', () => {
  assert.match(route, /async function ensureOpenInsuranceTasksForStaff/);
  assert.match(route, /staff\.role === 'healthPlanner'[\s\S]*?retireInsuranceSupervisionTasks/);
  assert.match(route, /staff\.role !== 'healthManager'/);
  assert.doesNotMatch(route, /ensureInsuranceServiceTask\(serviceCase, 'supervisor'/);
  assert.match(serviceTasks, /await ensureOpenInsuranceTasksForStaff\(req\.staff\)/);
  assert.match(serviceTasks, /task\.sourceType === 'insurance_service' && task\.taskRole === 'executor'/);
});

test('creating an insurance case assigns only execution work', () => {
  assert.match(createCase, /ensureInsuranceServiceTask\(serviceCase, 'executor', assignee\)/);
  assert.doesNotMatch(createCase, /ensureInsuranceServiceTask\(serviceCase, 'supervisor'/);
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
  let cancelledSupervisor = false;
  const model = {
    find: filter => {
      queries.push(filter);
      return { select: () => ({ lean: async () => filter.status === 'completed'
        ? [{ _id: 'done', patientId: 'patient', sourceType: 'insurance_service', sourceId: 'case', taskRole: 'executor', status: 'completed', completedAt: '2026-10-16T05:20:24Z', serviceChecklist: [{ purpose: '登记费用', executionStatus: 'completed', executionResult: '已登记' }] }]
        : [{ _id: 'duplicate', createdAt: '2026-10-16T05:23:47Z' }] }) };
    },
    updateMany: async filter => {
      if (filter.taskRole === 'supervisor') cancelledSupervisor = true;
      else assert.deepEqual(filter._id.$in, ['duplicate']);
    },
  };
  let saved = false;
  const cases = { findById: async () => ({ patientId: 'patient', steps: [{ title: '登记费用', status: 'pending' }], status: 'verifying', save: async function () { saved = this.status === 'closed'; } }) };
  await reconcilePatientInsuranceTasks(model, cases, 'patient');
  assert.equal(cancelledSupervisor, true);
  assert.equal(queries[0].patientId, 'patient');
  assert.equal(queries[1].sourceId, 'case');
  assert.equal(saved, true);
});

test('completed executor checklist closes the insurance case without another review', async () => {
  const serviceCase = { patientId: 'patient', status: 'verifying', steps: [
    { title: '登记费用', status: 'pending', note: '' },
    { title: '提交理赔', status: 'pending', note: '' },
  ], save: async () => {} };
  const task = { patientId: 'patient', sourceType: 'insurance_service', sourceId: 'case', taskRole: 'executor', status: 'completed',
    completedAt: new Date('2026-10-16T05:20:24Z'), serviceChecklist: [
      { purpose: '登记费用', executionStatus: 'completed', executionResult: '1108元' },
      { purpose: '提交理赔', executionStatus: 'completed', executionResult: '受理号123' },
    ] };
  assert.equal(await closeInsuranceCaseFromExecution({ findById: async () => serviceCase }, task, '执行人', 'staff'), true);
  assert.equal(serviceCase.status, 'closed');
  assert.deepEqual(serviceCase.steps.map(step => step.note), ['1108元', '受理号123']);
  assert.equal(serviceCase.updatedBy, 'staff');
  task.serviceChecklist[1].executionStatus = 'partial';
  serviceCase.status = 'verifying';
  assert.equal(await closeInsuranceCaseFromExecution({ findById: async () => serviceCase }, task), false);
  assert.equal(serviceCase.status, 'verifying');
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
