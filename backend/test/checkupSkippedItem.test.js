const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('annual checkup item closes as documented not done, with no report or false completion', async () => {
  const source = fs.readFileSync(require.resolve('../src/routes/staff.js'), 'utf8');
  const start = source.indexOf("router.patch('/plans/:id/items/:itemId'");
  const end = source.indexOf('// ── AI体检方案讨论区', start);
  let handler, written;
  const item = { _id: 'item-1', name: '维生素D', status: 'pending', reportId: null };
  const plan = { _id: 'plan-1', patientId: 'patient-1', type: 'annual_checkup', status: 'active',
    items: { id: value => value === item._id ? item : null } };
  const HealthPlan = { findById: async () => plan, updateOne: async (_filter, update) => { written = update.$set; return { modifiedCount: 1 }; } };
  vm.runInNewContext(source.slice(start, end), {
    router: { patch: (_path, _auth, _review, fn) => { handler = fn; } }, staffAuth: () => {}, checkupReviewOrPlanEdit: () => {},
    HealthPlan, canReviewAnnualCheckup: async () => true, Date,
  });
  const request = reason => ({ params: { id: plan._id, itemId: item._id }, body: { status: 'skipped', reason }, staff: { _id: 'advisor' } });
  let status = 200, payload;
  const response = { status: code => { status = code; return response; }, json: value => { payload = value; return response; } };
  await handler(request(''), response);
  assert.equal(status, 400);
  assert.equal(written, undefined);
  status = 200;
  await handler(request('客户自行体检，本次未做该项目'), response);
  assert.equal(status, 200);
  assert.equal(payload.success, true);
  assert.equal(written['items.$.status'], 'skipped');
  assert.equal(written['items.$.reportId'], null);
  assert.equal(written['items.$.completedAt'], null);
  assert.equal(written['items.$.completionSource'], 'screening_skipped');
  assert.equal(written['items.$.completionNote'], '客户自行体检，本次未做该项目');
  assert.equal(written['items.$.completionReviewedBy'], 'advisor');
  item.status = 'skipped';
  status = 200;
  await handler({ ...request(''), body: { status: 'pending' } }, response);
  assert.equal(status, 200);
  assert.equal(written['items.$.completionSource'], '');
  assert.equal(written['items.$.completionNote'], '');
});
