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
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ params: { id: 'patient', medId: 'med' }, staff: { role, _id: 'editor' }, body }, res);
  return { res, med, saves, deletes };
}

test('health advisor can edit another staff member medication without approving it', async () => {
  const { res, med, saves } = await update('familyDoctor', { name: 'Corrected', aiStatus: 'approved' });
  assert.equal(res.code, 200);
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

test('advisor editing grant does not grant stopping or restoring others records', async () => {
  for (const stopped of [true, false]) {
    const { res, saves, deletes } = await update('familyDoctor', { stopped, stopReason: 'reason' });
    assert.equal(res.code, 403);
    assert.equal(saves, 0);
    assert.equal(deletes, 0);
  }
});

test('stopped historical records remain immutable', async () => {
  const { res, saves } = await update('familyDoctor', { name: 'Changed' }, 'creator', true);
  assert.equal(res.code, 400);
  assert.equal(saves, 0);
});
