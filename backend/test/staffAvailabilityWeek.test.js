const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const router = require('../src/routes/staffAvailability');
const Admin = require('../src/models/Admin');
const StaffAvailability = require('../src/models/StaffAvailability');

const oid = () => new mongoose.Types.ObjectId();
const handler = (method, route) => router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('health manager copies a colleague’s prior week without carrying over bookings', async t => {
  const originals = { findOne: Admin.findOne, find: StaffAvailability.find, exists: StaffAvailability.exists, insertMany: StaffAvailability.insertMany };
  t.after(() => { Admin.findOne = originals.findOne; StaffAvailability.find = originals.find; StaffAvailability.exists = originals.exists; StaffAvailability.insertMany = originals.insertMany; });
  const tenantId = oid(), managerId = oid(), expertId = oid();
  const target = new Date(Date.now() + 14 * 86400000);
  const sourceStart = new Date(+target - 7 * 86400000);
  const first = new Date(+sourceStart + 9 * 3600000);
  const source = [
    { startAt: first, endAt: new Date(+first + 20 * 60000), status: 'booked' },
    { startAt: new Date(+first + 86400000), endAt: new Date(+first + 86400000 + 30 * 60000), status: 'unavailable' },
  ];
  let staffFilter, sourceFilter, saved;
  Admin.findOne = filter => { staffFilter = filter; return { select: () => ({ lean: async () => ({ _id: expertId }) }) }; };
  StaffAvailability.find = filter => { sourceFilter = filter; return { sort: () => ({ lean: async () => source }) }; };
  StaffAvailability.exists = async () => false;
  StaffAvailability.insertMany = async rows => { saved = rows; };
  const req = { staff: { _id: managerId, tenantId, role: 'healthManager' }, body: { staffId: String(expertId), targetWeekStart: target.toISOString() } };
  const res = response();
  await handler('post', '/copy-week')(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.count, 2);
  assert.equal(String(staffFilter.tenantId), String(tenantId));
  assert.equal(String(sourceFilter.tenantId), String(tenantId));
  assert.deepEqual(saved.map(row => row.status), ['available', 'unavailable']);
  assert.equal(+saved[0].startAt - +source[0].startAt, 7 * 86400000);
  assert.equal(saved[0].source, 'planner');
});

test('copying a week rejects overlaps before creating any slots', async t => {
  const originals = { findOne: Admin.findOne, find: StaffAvailability.find, exists: StaffAvailability.exists, insertMany: StaffAvailability.insertMany };
  t.after(() => { Admin.findOne = originals.findOne; StaffAvailability.find = originals.find; StaffAvailability.exists = originals.exists; StaffAvailability.insertMany = originals.insertMany; });
  const tenantId = oid(), staffId = oid(), target = new Date(Date.now() + 14 * 86400000);
  Admin.findOne = () => ({ select: () => ({ lean: async () => ({ _id: staffId }) }) });
  const startAt = new Date(+target - 7 * 86400000 + 9 * 3600000);
  StaffAvailability.find = () => ({ sort: () => ({ lean: async () => [{ startAt, endAt: new Date(+startAt + 20 * 60000), status: 'available' }] }) });
  StaffAvailability.exists = async () => true;
  let inserted = false;
  StaffAvailability.insertMany = async () => { inserted = true; };
  const res = response();
  await handler('post', '/copy-week')({ staff: { _id: staffId, tenantId, role: 'specialist' }, body: { targetWeekStart: target.toISOString() } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(inserted, false);
});

test('health manager sees only their tenant in the month team view', async t => {
  const originals = { find: Admin.find, availabilityFind: StaffAvailability.find };
  t.after(() => { Admin.find = originals.find; StaffAvailability.find = originals.availabilityFind; });
  const tenantId = oid();
  let peopleFilter, slotFilter;
  Admin.find = filter => { peopleFilter = filter; return { select: () => ({ sort: () => ({ lean: async () => [] }) }) }; };
  StaffAvailability.find = filter => { slotFilter = filter; return { sort: () => ({ lean: async () => [] }) }; };
  const res = response();
  await handler('get', '/team')({ staff: { _id: oid(), tenantId, role: 'healthManager' }, query: {
    start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 43 * 86400000).toISOString(),
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(String(peopleFilter.tenantId), String(tenantId));
  assert.equal(String(slotFilter.tenantId), String(tenantId));
});

test('a one-hour window becomes three 20-minute or two 30-minute slots', async t => {
  const originals = { findOne: Admin.findOne, exists: StaffAvailability.exists, insertMany: StaffAvailability.insertMany };
  t.after(() => { Admin.findOne = originals.findOne; StaffAvailability.exists = originals.exists; StaffAvailability.insertMany = originals.insertMany; });
  const tenantId = oid(), managerId = oid(), expertId = oid();
  const startAt = new Date(Date.now() + 2 * 86400000), endAt = new Date(+startAt + 3600000);
  let staffFilter, overlapFilter, saved;
  Admin.findOne = filter => { staffFilter = filter; return { select: () => ({ lean: async () => ({ _id: expertId }) }) }; };
  StaffAvailability.exists = async filter => { overlapFilter = filter; return false; };
  StaffAvailability.insertMany = async rows => { saved = rows; };
  for (const [segmentMinutes, expected] of [[20, 3], [30, 2]]) {
    const res = response();
    await handler('post', '/batch')({ staff: { _id: managerId, tenantId, role: 'healthManager' }, body: {
      staffId: String(expertId), startAt: startAt.toISOString(), endAt: endAt.toISOString(), segmentMinutes, status: 'available',
    } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.count, expected);
    assert.equal(saved.length, expected);
    assert.equal(+saved[0].startAt, +startAt);
    assert.equal(+saved.at(-1).endAt, +endAt);
    assert.equal(String(staffFilter.tenantId), String(tenantId));
    assert.equal(String(overlapFilter.tenantId), String(tenantId));
    assert.equal(saved[0].source, 'planner');
  }
});

test('segmented scheduling rejects a leftover interval and existing appointments', async t => {
  const originals = { findOne: Admin.findOne, exists: StaffAvailability.exists, insertMany: StaffAvailability.insertMany };
  t.after(() => { Admin.findOne = originals.findOne; StaffAvailability.exists = originals.exists; StaffAvailability.insertMany = originals.insertMany; });
  const tenantId = oid(), staffId = oid(), startAt = new Date(Date.now() + 2 * 86400000);
  let inserted = false;
  Admin.findOne = () => ({ select: () => ({ lean: async () => ({ _id: staffId }) }) });
  StaffAvailability.exists = async () => true;
  StaffAvailability.insertMany = async () => { inserted = true; };
  const request = endAt => ({ staff: { _id: staffId, tenantId, role: 'specialist' }, body: {
    startAt: startAt.toISOString(), endAt: endAt.toISOString(), segmentMinutes: 20, status: 'available',
  } });
  const leftover = response();
  await handler('post', '/batch')(request(new Date(+startAt + 50 * 60000)), leftover);
  assert.equal(leftover.statusCode, 400);
  const overlap = response();
  await handler('post', '/batch')(request(new Date(+startAt + 60 * 60000)), overlap);
  assert.equal(overlap.statusCode, 409);
  assert.equal(inserted, false);
});
