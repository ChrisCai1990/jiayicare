const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf("router.put('/patients/:id/supply-reminders/:kind/:recordId',");
const end = source.indexOf('\n});', start) + 4;

async function generate(mode) {
  let handler;
  let inserted = [];
  const record = { _id: 'record-1', name: '维生素D', staffId: 'record-owner', save: async () => {} };
  vm.runInNewContext(source.slice(start, end), {
    router: { put: (_path, _auth, _permission, callback) => { handler = callback; } },
    staffAuth: () => {},
    checkPermission: () => () => {},
    Medication: { findOne: async () => record },
    Supplement: { findOne: async () => record },
    User: { findById: () => ({ select: async () => ({ assignedHealthManager: 'health-manager' }) }) },
    FollowUp: {
      deleteMany: async () => {},
      create: async row => { inserted = [row]; },
    },
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({
    params: { id: 'patient-1', kind: 'medication', recordId: 'record-1' },
    body: { firstDate: '2099-01-01', intervalDays: 30, cycles: 1, mode },
    staff: { _id: 'operator-1' },
  }, res);
  return { res, row: inserted[0] };
}

test('就医配取提醒归当前操作人并立即出现在其随访列表', async () => {
  const { res, row } = await generate('visit');
  assert.equal(res.code, 200);
  assert.equal(row.staffId, 'operator-1');
  assert.equal(row.assignedTo, 'operator-1');
  assert.equal(row.sourceType, 'supply_reminder');
  assert.match(row.theme, /提醒客户配取/);
  assert.match(row.plannedContent, /提醒会员自行/);
});

test('代配待办也归当前操作人，可在其随访列表中查看', async () => {
  const { res, row } = await generate('proxy');
  assert.equal(res.code, 200);
  assert.equal(row.staffId, 'operator-1');
  assert.equal(row.assignedTo, 'operator-1');
  assert.equal(row.sourceType, 'supply_reminder');
  assert.match(row.theme, /我方代配/);
  assert.match(row.plannedContent, /安排我方代配/);
});
