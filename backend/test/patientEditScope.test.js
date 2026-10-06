const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const routeRequire = require('node:module').createRequire(require.resolve('../src/routes/staff'));
const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.put('/patients/:id',");
const route = source.slice(start, source.indexOf('\nrouter.', start + 1));
class ObjectId { constructor(v) { this.v = String(v); } toString() { return this.v; } }
function matches(doc, query) {
  return Object.entries(query).every(([key, value]) => key === '$or'
    ? value.some(q => matches(doc, q))
    : value?.$in ? value.$in.some(id => String(doc[key]) === String(id))
    : value && typeof value === 'object' && '$ne' in value ? doc[key] !== value.$ne
    : value === null ? doc[key] == null : String(doc[key]) === String(value));
}
async function call({ patient = {}, staff = {}, visible = ['owner'], body = {}, race = false, claim = false } = {}) {
  const doc = { _id: 'patient', tenantId: 'tenant', assignedHealthManager: 'owner', ...patient };
  let handler, writes = 0, sideEffects = 0, status = 200, response;
  const User = {
    findOne(filter) { return { select() { return this; }, async lean() { return matches(doc, filter) ? doc : null; } }; },
    collection: { async updateOne(filter, ops) {
      if (race) doc.assignedHealthManager = 'outsider';
      if (!matches(doc, filter)) return { matchedCount: 0 };
      writes++; Object.assign(doc, ops.$set); return { matchedCount: 1 };
    } },
    findById() { return { populate() { return this; }, then(resolve) { resolve(doc); } }; },
  };
  const claimStart = source.indexOf("router.post('/patients/assign',");
  const testedRoute = claim ? source.slice(claimStart, source.indexOf('\nrouter.', claimStart + 1)) : route;
  const capture = (...args) => { handler = args.at(-1); };
  vm.runInNewContext(testedRoute, {
    router: { put: capture, post: capture }, staffAuth() {}, checkPermission: () => () => {},
    User, mongoose: { Types: { ObjectId } }, getVisibleStaffIds: async () => visible,
    require(name) {
      if (name === '../utils/annualPlanMonitoringReminders') return { async syncServiceCycleMonitoringReminders() { sideEffects++; } };
      return routeRequire(name);
    },
  });
  await handler({ staff: { _id: 'owner', tenantId: 'tenant', role: 'healthManager', ...staff }, params: { id: 'patient' }, body },
    { status(s) { status = s; return this; }, json(value) { response = value; } });
  return { status, response, writes, sideEffects, doc };
}
test('unassigned staff cannot change identity, beliefs or assign themselves', async () => {
  for (const body of [{ name: 'changed' }, { belief: 'test', culturalPreferencesConfirmed: true }, { assignedHealthManager: 'outsider' }]) {
    const r = await call({ visible: ['outsider'], body });
    assert.equal(r.status, 403); assert.equal(r.writes, 0); assert.equal(r.sideEffects, 0);
  }
});
test('cross-tenant and deleted patients are denied even to tenant superadmin', async () => {
  for (const patient of [{ tenantId: 'other' }, { isDeleted: true }]) {
    const r = await call({ patient, staff: { role: 'superadmin' } });
    assert.equal(r.status, 403); assert.equal(r.writes, 0);
  }
});
test('own assignment, visible subordinate, and tenant admin can save', async () => {
  for (const options of [{}, { visible: ['mentor', 'owner'] }, { patient: { assignedHealthManager: 'other' }, staff: { role: 'superadmin' } }]) {
    const r = await call({ ...options, body: { name: 'synthetic' } });
    assert.equal(r.status, 200); assert.equal(r.writes, 1); assert.equal(r.doc.name, 'synthetic');
  }
});
test('authorized staff still need explicit cultural preference confirmation', async () => {
  assert.equal((await call({ body: { belief: 'synthetic' } })).status, 400);
  assert.equal((await call({ body: { belief: 'synthetic', culturalPreferencesConfirmed: true } })).status, 200);
});
test('assignment changed during editing prevents write and subsequent side effects', async () => {
  const r = await call({ race: true, body: { name: 'blocked' } });
  assert.equal(r.status, 403); assert.equal(r.writes, 0); assert.equal(r.sideEffects, 0);
});
test('self-assignment cannot bypass another team or tenant boundary', async () => {
  for (const options of [{ visible: ['outsider'] }, { patient: { tenantId: 'other' }, staff: { role: 'superadmin' } }, { patient: { isDeleted: true } }]) {
    const r = await call({ ...options, claim: true, body: { userId: 'patient' } });
    assert.equal(r.status, 403); assert.equal(r.writes, 0);
  }
});
test('unassigned claim and existing team assignment remain supported', async () => {
  for (const options of [{ patient: { assignedHealthManager: null } }, {}, { staff: { role: 'superadmin' }, visible: [] }]) {
    const r = await call({ ...options, claim: true, body: { userId: 'patient' } });
    assert.equal(r.status, 200); assert.equal(r.writes, 1);
  }
});
test('concurrent assignment cannot overwrite a changed team', async () => {
  const r = await call({ claim: true, race: true, body: { userId: 'patient' } });
  assert.equal(r.status, 409); assert.equal(r.writes, 0);
});
