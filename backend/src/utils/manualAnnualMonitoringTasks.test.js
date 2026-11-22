const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const saved = new Set();
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'mongoose') return { Types: { ObjectId: class { constructor(value) { this.value = value; } toString() { return this.value; } } } };
  if (request === '../models/FollowUp') return {
    exists: async query => query._id ? saved.has(String(query._id)) : false,
    updateOne: async query => { if (saved.has(String(query._id))) return { upsertedCount: 0 }; saved.add(String(query._id)); return { upsertedCount: 1 }; },
  };
  return originalLoad.call(this, request, parent, isMain);
};
const { firstFollowUpDate, createManualAnnualMonitoringTasks } = require('./manualAnnualMonitoringTasks');
Module._load = originalLoad;

test('不用客户端按项目建立内部随访且重试不重复建', async () => {
  assert.equal(firstFollowUpDate('2026-02-30', new Date('2026-01-01')), null);
  assert.equal(firstFollowUpDate('2026-01-01', new Date('2026-01-02')), null);
  const input = { plan: { _id: 'plan', moduleData: { monitoring: { clientAppUsage: 'no', firstManualFollowUpDate: '2099-01-01',
    records: [{ metricType: 'bloodPressure', items: '血压', frequency: '每周1次' },
      { metricType: 'weight', items: '体重', frequency: '每日1次' }] } } },
  patient: { _id: 'patient', tenantId: 'tenant', assignedHealthManager: 'manager' },
  manager: { _id: 'manager' }, staffId: 'advisor' };
  assert.deepEqual(await createManualAnnualMonitoringTasks(input), { created: 2, total: 2 });
  assert.deepEqual(await createManualAnnualMonitoringTasks(input), { created: 0, total: 2 });
});
