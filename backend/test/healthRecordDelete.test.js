const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf("router.delete('/patients/:patientId/health-records/:recordId',");
assert.ok(start > 0);
const route = source.slice(start, source.indexOf('\n});', start) + 4);
async function run({ role = 'healthManager', reason = '测试数据', visible = true, missing = false, deletedPatient = false, type = 'bloodPressure', fail = false } = {}) {
  let handler, mutation, followup;
  vm.runInNewContext(route, {
    router: { delete: (p, a, h) => { handler = h; } }, staffAuth() {},
    PLAN_ASSIGN_FIELDS: ['assignedHealthManager'],
    getVisibleStaffIds: async () => ['editor'],
    User: { findById: async () => ({ isDeleted: deletedPatient, assignedHealthManager: visible ? 'editor' : 'other' }) },
    HealthRecord: { findOneAndUpdate: async (filter, update) => {
      mutation = { filter, update };
      if (fail) throw new Error('storage unavailable');
      return missing ? null : { _id: 'record', type };
    } },
    FollowUp: { updateMany: async (filter, update) => { followup = { filter, update }; } },
  });
  const res = { code: 200, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; } };
  await handler({ params: { patientId: 'patient', recordId: 'record' }, staff: { role, _id: 'editor', name: '操作人' }, body: { reason } }, res);
  return { res, mutation, followup };
}
test('authorized deletion is scoped to patient and active record, preserving audit fields', async () => {
  for (const role of ['healthManager', 'familyDoctor', 'superadmin']) {
    const { res, mutation, followup } = await run({ role });
    assert.equal(res.code, 200);
    assert.equal(mutation.filter.user, 'patient');
    assert.equal(mutation.filter._id, 'record');
    assert.equal(mutation.filter.deletedAt, null);
    assert.equal(mutation.update.$set.deletedBy, 'editor');
    assert.equal(mutation.update.$set.deletedByName, '操作人');
    assert.equal(mutation.update.$set.deleteReason, '测试数据');
    assert.ok(mutation.update.$set.deletedAt);
    assert.equal(mutation.update.$set.aiAlertStatus, null);
    assert.equal(followup, undefined);
  }
});
test('unrelated patient and disallowed role cannot mutate records', async () => {
  for (const options of [{ visible: false }, { role: 'nutritionist' }, { role: 'medicalAssistant' }]) {
    const result = await run(options);
    assert.equal(result.res.code, 403);
    assert.equal(result.mutation, undefined);
  }
});
test('reason is required and bounded before writing', async () => {
  for (const reason of ['', '   ', 'x'.repeat(501)]) {
    const result = await run({ reason });
    assert.equal(result.res.code, 400);
    assert.equal(result.mutation, undefined);
  }
});
test('missing or previously deleted record returns 404', async () => {
  assert.equal((await run({ missing: true })).res.code, 404);
});
test('deleted patient cannot be changed', async () => {
  const result = await run({ deletedPatient: true });
  assert.equal(result.res.code, 404);
  assert.equal(result.mutation, undefined);
});
test('symptom deletion cancels only active same-source tasks', async () => {
  const { followup } = await run({ type: 'symptom' });
  assert.equal(followup.filter.sourceId, 'record');
  assert.equal(followup.filter.sourceType, 'symptom');
  assert.deepEqual(Array.from(followup.filter.status.$in), ['planned', 'in_progress', 'missed']);
  assert.equal(followup.update.$set.status, 'cancelled');
});
test('database failure is reported instead of success', async () => {
  const { res } = await run({ fail: true });
  assert.equal(res.code, 500);
  assert.equal(res.data.success, false);
});
