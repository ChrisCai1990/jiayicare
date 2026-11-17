const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/staff.js'), 'utf8');
const start = source.indexOf("router.post('/followups/:id/continue'");
const end = source.indexOf("router.put('/followups/:id'", start);
assert.ok(start > 0 && end > start);

async function request({ actor = { _id: 'manager', name: '健管专员', role: 'healthManager' }, patch = {}, body = {} } = {}) {
  let handler;
  let successor = null;
  let ended = false;
  const original = {
    _id: 'old', tenantId: 'tenant', patientId: 'patient', staffId: 'advisor', assignedTo: 'manager',
    status: 'in_progress', type: 'phone', content: '原计划要求',
    progressRecords: [{ requestId: 'first-contact', content: '客户未能按期检查', staffId: 'manager' }],
    ...patch,
    save: async () => {},
  };
  class FollowUp {
    constructor(fields) { Object.assign(this, fields); this._id = 'new'; }
    async save() { successor = this; }
    async populate() { return this; }
    static findById() { return { session: async () => original }; }
    static async startSession() {
      return { withTransaction: async fn => fn(), endSession: async () => { ended = true; } };
    }
  }
  vm.runInNewContext(source.slice(start, end), {
    router: { post: (_path, _auth, _permission, fn) => { handler = fn; } },
    staffAuth: () => {}, checkPermission: () => {}, FollowUp,
    Admin: { findById: id => ({ select: () => ({ lean: async () => id ? { _id: id, name: '新执行人' } : null }) }) },
    require: path => path === 'crypto' ? require('node:crypto') : { requiresOutcomeReview: () => false },
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  await handler({ params: { id: 'old' }, staff: actor, body: {
    unfinishedReason: '客户预约延期，检查未完成', date: '2026-11-20', type: 'phone',
    theme: '专项筛查续访', content: '核实检查结果', assignedTo: 'manager2', ...body,
  } }, response);
  return { response, original, successor, ended };
}

test('continuation preserves old creator and process, records reason, and gives new plan its own creator and executor', async () => {
  const { response, original, successor, ended } = await request();
  assert.equal(response.statusCode, 200);
  assert.equal(ended, true);
  assert.equal(original.staffId, 'advisor');
  assert.equal(original.status, 'cancelled');
  assert.equal(original.progressRecords.length, 2);
  assert.equal(original.progressRecords[1].staffId, 'manager');
  assert.equal(original.continuedByFollowUpId, 'new');
  assert.equal(successor.staffId, 'manager');
  assert.equal(successor.assignedTo, 'manager2');
  assert.equal(successor.predecessorFollowUpId, 'old');
  assert.equal(successor.predecessorUnfinishedRecord.content, '客户预约延期，检查未完成');
});

test('unassigned staff and protected workflows cannot close an old plan by continuation', async () => {
  const unrelated = await request({ actor: { _id: 'other', role: 'healthManager' } });
  assert.equal(unrelated.response.statusCode, 403);
  assert.equal(unrelated.successor, null);
  assert.equal(unrelated.original.status, 'in_progress');
  const protectedTask = await request({ patch: { taskRole: 'executor' } });
  assert.equal(protectedTask.response.statusCode, 409);
  assert.equal(protectedTask.successor, null);
  const repeated = await request({ patch: { continuedByFollowUpId: 'existing' } });
  assert.equal(repeated.response.statusCode, 409);
  assert.equal(repeated.successor, null);
  const invalidDate = await request({ body: { date: '2026-11-31' } });
  assert.equal(invalidDate.response.statusCode, 400);
  assert.equal(invalidDate.successor, null);
});
