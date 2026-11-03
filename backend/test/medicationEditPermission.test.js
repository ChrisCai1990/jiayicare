const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual route with persistence mocked: no patient data is touched.
const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf("router.patch('/patients/:id/medications/:medId',");
const end = source.indexOf('\n});', start) + 4;

async function update(role, body, owner = 'creator', stopped = false) {
  let handler;
  let saves = 0;
  let deletes = 0;
  const med = { staffId: owner, stopped, aiStatus: 'pending', name: 'Original',
    save: async () => { saves++; } };
  vm.runInNewContext(source.slice(start, end), {
    router: { patch: (_path, _auth, callback) => { handler = callback; } },
    staffAuth: () => {},
    Medication: { findOne: async () => med },
    FollowUp: { deleteMany: async () => { deletes++; } },
    require: name => name.endsWith('/combinedMedicationReminder') ? { refreshExistingPlan: async () => {} }
      : name.endsWith('/medicationAttachmentStorage') ? { normalizeMedicationAttachments: async urls => urls }
        : null,
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ params: { id: 'patient', medId: 'med' }, staff: { role, _id: 'editor' }, body }, res);
  return { res, med, saves, deletes };
}

test('health advisor can edit another staff member medication without approving it', async () => {
  const { res, med, saves } = await update('familyDoctor', { name: 'Corrected', aiStatus: 'approved' });
  assert.equal(res.code, 200, res.data?.message);
  assert.equal(med.name, 'Corrected');
  assert.equal(med.aiStatus, 'pending');
  assert.equal(saves, 1);
});

test('unrelated non-reviewer roles cannot edit', async () => {
  for (const role of ['healthManager', 'medicalAssistant', 'nutritionist', 'healthPlanner']) {
    const { res, saves } = await update(role, { name: 'Changed' });
    assert.equal(res.code, 403);
    assert.equal(saves, 0);
  }
});

test('owner and superadmin retain editing access', async () => {
  for (const [role, owner] of [['healthManager', 'editor'], ['superadmin', 'creator']]) {
    assert.equal((await update(role, { name: 'Changed' }, owner)).res.code, 200);
  }
});

test('health advisor can stop another staff member medication', async () => {
  const { res, med, saves, deletes } = await update('familyDoctor', { stopped: true, stopReason: '今日就诊医生确认停用' });
  assert.equal(res.code, 200);
  assert.equal(med.stopped, true);
  assert.equal(med.stopReason, '今日就诊医生确认停用');
  assert.equal(saves, 1);
  assert.equal(deletes, 2);
});

test('stopped historical records remain immutable', async () => {
  const { res, saves } = await update('familyDoctor', { name: 'Changed' }, 'creator', true);
  assert.equal(res.code, 400);
  assert.equal(saves, 0);
});

test('stopped correction requires an authorized editor and keeps status unchanged', async () => {
  const begin = source.indexOf("router.patch('/patients/:id/medications/:medId/correct-stopped',");
  const finish = source.indexOf('\n});', begin) + 4;
  let handler, writes = 0;
  const med = { _id: 'med', user: 'patient', staffId: 'creator', stopped: true, active: true,
    name: '药物', dosage: '1粒', frequency: '每日1次', stopReason: '已停用', startDate: '2016-11-03',
    updatedAt: new Date('2026-11-03T02:00:00Z') };
  vm.runInNewContext(source.slice(begin, finish), {
    router: { patch: (_path, _auth, callback) => { handler = callback; } }, staffAuth: () => {},
    Medication: { findOne: async () => med, findOneAndUpdate: async (filter, mutation) => {
      writes++; assert.equal(filter.stopped, true); assert.equal(mutation.$set.stopped, undefined); return { ...med, ...mutation.$set };
    } },
    require: name => name.endsWith('/stoppedMedicationCorrection') ? require('../src/utils/stoppedMedicationCorrection') : null,
  });
  async function call(role) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ params: { id: 'patient', medId: 'med' }, staff: { role, _id: 'advisor', name: '顾问' },
      body: { updatedAt: med.updatedAt.toISOString(), correctionReason: '核对原资料', startDate: '2026-11-03' } }, res);
    return res;
  }
  assert.equal((await call('nutritionist')).code, 403);
  assert.equal(writes, 0);
  assert.equal((await call('familyDoctor')).code, 200);
  assert.equal(writes, 1);
});
