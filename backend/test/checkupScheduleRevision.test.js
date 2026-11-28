const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCheckupScheduleRevision } = require('../src/utils/checkupScheduleRevision');

const plan = { year: 2026, checkupDate: null };
const staff = { _id: 'staff-1', name: '健康顾问' };
const at = new Date('2026-10-29T08:00:00Z');

test('changing an unpushed plan from 2026 to 2027 records both original and corrected schedule', () => {
  const revision = makeCheckupScheduleRevision(plan, 2027, '2027-06-01', staff, at);
  assert.deepEqual(revision, {
    at, by: 'staff-1', byName: '健康顾问',
    fromYear: 2026, toYear: 2027,
    fromCheckupDate: null, toCheckupDate: '2027-06-01',
  });
  assert.deepEqual(plan, { year: 2026, checkupDate: null });
});

test('saving unrelated edits does not create a schedule revision', () => {
  assert.equal(makeCheckupScheduleRevision(plan, 2026, null, staff, at), null);
  assert.equal(makeCheckupScheduleRevision({ ...plan, checkupDate: new Date('2026-06-01') }, 2026, '2026-06-01', staff, at), null);
});

test('a previously pushed undated checkup can reopen, acquire a date and retain it', async () => {
  const source = require('node:fs').readFileSync(require.resolve('../src/routes/staff.js'), 'utf8');
  const route = source.slice(source.indexOf("router.put('/plans/:id',"), source.indexOf('// Draft-only rewrite:'));
  const record = { ...plan, type: 'annual_checkup', status: 'active', pushedAt: at, items: [],
    checkupScheduleHistory: [], markModified() {}, async save() {} };
  let update;
  require('node:vm').runInNewContext(route, {
    router: { put: (_path, _auth, _permission, handler) => { update = handler; } },
    staffAuth() {}, checkPermission() {}, HealthPlan: { findById: async () => record },
    canUsePlanOwnerRole: () => true, planTypeAllowed: async () => true, canManagePlan: async () => true,
    require: name => {
      if (name === '../utils/checkupScheduleRevision') return { makeCheckupScheduleRevision };
      assert.equal(name, '../utils/checkupPreparationNotice');
      return { syncNotice: async () => {} };
    },
  });
  async function submit(body) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json() {} };
    await update({ params: { id: 'plan' }, staff, body }, res);
    return res.code;
  }
  assert.equal(await submit({ status: 'draft', title: 'unrelated edit' }), 400);
  assert.equal(await submit({ status: 'draft' }), 200);
  assert.equal(record.status, 'draft');
  assert.equal(record.pushedAt, at);
  assert.equal(await submit({ checkupDate: '2027-01-15' }), 400);
  assert.equal(await submit({ checkupDate: '2026-12-05' }), 200);
  assert.equal(record.checkupScheduleHistory.length, 1);
  assert.equal(await submit({ checkupDate: null }), 400);
  assert.equal(record.checkupDate, '2026-12-05');
});
