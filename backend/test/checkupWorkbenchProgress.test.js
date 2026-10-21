const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { summarizeCheckupItems, buildCheckupWorkbenchRows } = require('../src/utils/checkupWorkbenchProgress');
const patients = [{ _id: 'patient', name: '测试客户', phone: '000' }];
const plan = { _id: 'plan', patientId: 'patient', type: 'annual_checkup', status: 'active', items: [
  { name: '已关联项目', itemType: 'labTest', status: 'pending' },
  { name: '未关联项目', itemType: '', status: 'pending' },
  { name: '其他项目', itemType: 'other', status: 'pending' },
] };

test('partial completion stays visible until every item is completed, then reopening restores it', () => {
  const current = structuredClone(plan);
  assert.equal(buildCheckupWorkbenchRows([current], patients)[0].progressStatus, 'pending');
  current.items[0].status = 'completed';
  let row = buildCheckupWorkbenchRows([current], patients)[0];
  assert.equal(row.progressStatus, 'in_progress');
  assert.equal(row.pendingCount, 2);
  assert.deepEqual(row.pendingNames, ['未关联项目', '其他项目']);
  current.items.forEach(item => { item.status = 'completed'; });
  assert.deepEqual(buildCheckupWorkbenchRows([current], patients), []);
  row = buildCheckupWorkbenchRows([current], patients, true)[0];
  assert.equal(row.progressStatus, 'completed');
  assert.equal(row.completedCount, row.totalItems);
  current.items[1].status = 'pending';
  assert.equal(buildCheckupWorkbenchRows([current], patients)[0].pendingCount, 1);
});

test('missing statuses and skipped items never count as completed, and plan-level completed cannot hide unfinished items', () => {
  const items = [{ status: 'completed' }, { status: 'skipped' }, {}];
  const progress = summarizeCheckupItems(items);
  assert.equal(progress.pendingCount, 2);
  assert.equal(progress.completedCount, 1);
  assert.equal(progress.skippedCount, 1);
  assert.equal(progress.progressStatus, 'in_progress');
  assert.equal(buildCheckupWorkbenchRows([{ ...plan, status: 'completed', items }], patients).length, 1);
  assert.equal(summarizeCheckupItems([]).progressStatus, 'pending');
});

test('cancelled, empty and out-of-scope plans are excluded; more than five plans are retained', () => {
  const records = Array.from({ length: 7 }, (_, i) => ({ ...plan, _id: 'plan-' + i }));
  const before = JSON.stringify(records);
  assert.equal(buildCheckupWorkbenchRows(records, patients).length, 7);
  assert.equal(JSON.stringify(records), before);
  for (const patch of [{ status: 'cancelled' }, { items: [] }, { patientId: 'other' }, { type: 'nutrition' }]) {
    assert.deepEqual(buildCheckupWorkbenchRows([{ ...plan, ...patch }], patients, true), []);
  }
});

test('actual route keeps staff scope and defaults to unfinished while supporting completed history', async () => {
  const source = fs.readFileSync(require.resolve('../src/routes/staff.js'), 'utf8');
  const start = source.indexOf("router.get('/checkup-progress'");
  const end = source.indexOf('// ── GET /api/staff/patients/search-registered', start);
  let handler, userFilter, planFilter;
  const current = { ...plan, items: [{ status: 'completed' }, { status: 'pending', itemType: '' }] };
  const finished = { ...plan, _id: 'finished', items: [{ status: 'completed' }] };
  vm.runInNewContext(source.slice(start, end), {
    router: { get: (_path, _auth, fn) => { handler = fn; } },
    staffAuth: () => {},
    getVisibleStaffIds: async () => ['staff'],
    User: { find: filter => { userFilter = filter; return { select: () => ({ lean: async () => patients }) }; } },
    HealthPlan: { find: filter => { planFilter = filter; return { select: () => ({ lean: async () => [current, finished] }) }; } },
    require: name => { assert.equal(name, '../utils/checkupWorkbenchProgress'); return { buildCheckupWorkbenchRows }; },
  });
  let response;
  const res = { json: value => { response = value; }, status: () => res };
  await handler({ staff: { _id: 'staff', role: 'healthManager' }, query: {} }, res);
  assert.equal(userFilter.assignedHealthManager.$in[0], 'staff');
  assert.equal(planFilter.patientId.$in[0], 'patient');
  assert.equal(planFilter.status.$ne, 'cancelled');
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].progressStatus, 'in_progress');
  await handler({ staff: { _id: 'staff', role: 'healthManager' }, query: { includeCompleted: '1' } }, res);
  assert.equal(response.data.length, 2);
});
