const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const router = require('../src/routes/staffAvailability');
const Admin = require('../src/models/Admin');
const StaffAvailability = require('../src/models/StaffAvailability');
const StaffScheduleBooking = require('../src/models/StaffScheduleBooking');
const User = require('../src/models/User');
const Order = require('../src/models/Order');

const oid = () => new mongoose.Types.ObjectId();
const handler = (method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const query = rows => ({ sort: () => ({ lean: async () => rows }) });

test('staff can reserve adjacent free slots for a general appointment', async t => {
  const original = { find: StaffAvailability.find, updateOne: StaffAvailability.updateOne, findOne: Admin.findOne,
    create: StaffScheduleBooking.create, bookingUpdate: StaffScheduleBooking.updateOne };
  t.after(() => { StaffAvailability.find = original.find; StaffAvailability.updateOne = original.updateOne; Admin.findOne = original.findOne;
    StaffScheduleBooking.create = original.create; StaffScheduleBooking.updateOne = original.bookingUpdate; });
  const tenantId = oid(), staffId = oid(), creatorId = oid(), bookingId = oid();
  const startAt = new Date(Date.now() + 86400000);
  const slots = [0, 1].map(index => ({ _id: oid(), tenantId, staffId, status: 'available', source: 'planner',
    startAt: new Date(+startAt + index * 20 * 60000), endAt: new Date(+startAt + (index + 1) * 20 * 60000) }));
  let readFilter, created, reserved = [];
  StaffAvailability.find = filter => { readFilter = filter; return query(slots); };
  StaffAvailability.updateOne = async (filter, update) => { reserved.push({ filter, update }); return { modifiedCount: 1 }; };
  Admin.findOne = () => ({ select: () => ({ lean: async () => ({ _id: staffId }) }) });
  StaffScheduleBooking.create = async data => { created = data; return { ...data, _id: bookingId }; };
  StaffScheduleBooking.updateOne = async () => ({ modifiedCount: 1 });
  const res = response();
  await handler('post', '/bookings')({ staff: { _id: creatorId, tenantId, role: 'nutritionist' }, body: {
    slotIds: slots.map(slot => String(slot._id)), category: 'partner_exchange', content: '讨论服务方案', note: '' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(String(readFilter.tenantId), String(tenantId));
  assert.equal(String(created.staffId), String(staffId));
  assert.equal(created.title, '讨论服务方案');
  assert.equal(created.reason, '讨论服务方案');
  assert.equal(created.category, 'partner_exchange');
  assert.equal(reserved.length, 2);
  assert.ok(reserved.every(item => item.filter.status === 'available' && item.update.$set.source === 'general_booking'));
});

test('a conflict rolls back only slots reserved by this booking', async t => {
  const original = { find: StaffAvailability.find, updateOne: StaffAvailability.updateOne, findOne: Admin.findOne,
    create: StaffScheduleBooking.create, bookingUpdate: StaffScheduleBooking.updateOne };
  t.after(() => { StaffAvailability.find = original.find; StaffAvailability.updateOne = original.updateOne; Admin.findOne = original.findOne;
    StaffScheduleBooking.create = original.create; StaffScheduleBooking.updateOne = original.bookingUpdate; });
  const tenantId = oid(), staffId = oid(), creatorId = oid(), bookingId = oid(), startAt = new Date(Date.now() + 86400000);
  const slots = [0, 1].map(index => ({ _id: oid(), staffId, status: 'available', source: 'planner',
    startAt: new Date(+startAt + index * 30 * 60000), endAt: new Date(+startAt + (index + 1) * 30 * 60000) }));
  const writes = [];
  StaffAvailability.find = () => query(slots);
  StaffAvailability.updateOne = async (filter, update) => { writes.push({ filter, update }); return { modifiedCount: writes.length === 2 ? 0 : 1 }; };
  Admin.findOne = () => ({ select: () => ({ lean: async () => ({ _id: staffId }) }) });
  StaffScheduleBooking.create = async data => ({ ...data, _id: bookingId });
  StaffScheduleBooking.updateOne = async () => ({ modifiedCount: 1 });
  const res = response();
  await handler('post', '/bookings')({ staff: { _id: creatorId, tenantId, role: 'nutritionist' }, body: {
    slotIds: slots.map(slot => String(slot._id)), category: 'task', title: '内部事务', reason: '核对客户资料' } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(writes.length, 3);
  assert.equal(String(writes[2].filter.bookingId), String(bookingId));
  assert.equal(writes[2].update.$set.source, 'planner');
});

test('only participants and managers can cancel a general booking', async t => {
  const original = { findOne: StaffScheduleBooking.findOne, bookingUpdate: StaffScheduleBooking.updateOne, slotUpdate: StaffAvailability.updateOne };
  t.after(() => { StaffScheduleBooking.findOne = original.findOne; StaffScheduleBooking.updateOne = original.bookingUpdate; StaffAvailability.updateOne = original.slotUpdate; });
  const tenantId = oid(), staffId = oid(), creatorId = oid(), slotId = oid(), bookingId = oid();
  const booking = { _id: bookingId, tenantId, staffId, createdBy: creatorId, slotIds: [slotId], originalSources: ['planner'] };
  StaffScheduleBooking.findOne = () => ({ lean: async () => booking });
  let slotWrite;
  StaffScheduleBooking.updateOne = async () => ({ modifiedCount: 1 });
  StaffAvailability.updateOne = async (filter, update) => { slotWrite = { filter, update }; return { modifiedCount: 1 }; };
  const denied = response();
  await handler('post', '/bookings/:id/cancel')({ params: { id: String(bookingId) }, staff: { _id: oid(), tenantId, role: 'nutritionist' } }, denied);
  assert.equal(denied.statusCode, 403);
  const allowed = response();
  await handler('post', '/bookings/:id/cancel')({ params: { id: String(bookingId) }, staff: { _id: creatorId, tenantId, role: 'nutritionist' } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(slotWrite.update.$set.status, 'available');
  assert.equal(slotWrite.update.$set.source, 'planner');
});

test('colleagues can see occupied times but booking details stay participant scoped', async t => {
  const original = { find: Admin.find, slotFind: StaffAvailability.find, bookingFind: StaffScheduleBooking.find };
  t.after(() => { Admin.find = original.find; StaffAvailability.find = original.slotFind; StaffScheduleBooking.find = original.bookingFind; });
  const tenantId = oid(), viewerId = oid(), targetId = oid();
  Admin.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [{ _id: targetId, name: '同事' }] }) }) });
  StaffAvailability.find = () => query([{ _id: oid(), staffId: targetId, status: 'booked' }]);
  let filter;
  StaffScheduleBooking.find = value => { filter = value; return query([]); };
  const period = { start: new Date(Date.now() + 86400000).toISOString(), end: new Date(Date.now() + 2 * 86400000).toISOString() };
  const team = response();
  await handler('get', '/team')({ staff: { _id: viewerId, tenantId, role: 'nutritionist' }, query: period }, team);
  assert.equal(team.statusCode, 200);
  assert.equal(team.body.data.slots[0].status, 'booked');
  const bookings = response();
  await handler('get', '/bookings')({ staff: { _id: viewerId, tenantId, role: 'nutritionist' }, query: { ...period, staffId: String(targetId) } }, bookings);
  assert.equal(bookings.statusCode, 200);
  assert.equal(String(filter.tenantId), String(tenantId));
  assert.equal(String(filter.staffId), String(targetId));
  assert.equal(String(filter.$or[1].createdBy), String(viewerId));
});

test('a booking needs a specific reason and cannot attach another member’s order', async t => {
  const original = { userExists: User.exists, orderFind: Order.findOne };
  t.after(() => { User.exists = original.userExists; Order.findOne = original.orderFind; });
  const tenantId = oid(), patientId = oid(), otherId = oid(), orderId = oid();
  const base = { slotIds: [String(oid())], category: 'service', title: '报告解读' };
  const noReason = response();
  await handler('post', '/bookings')({ staff: { _id: oid(), tenantId, role: 'familyDoctor' }, body: base }, noReason);
  assert.equal(noReason.statusCode, 400);
  User.exists = async () => true;
  Order.findOne = () => ({ select: () => ({ lean: async () => ({ _id: orderId, user: otherId }) }) });
  const wrongOwner = response();
  await handler('post', '/bookings')({ staff: { _id: oid(), tenantId, role: 'familyDoctor' }, body: {
    ...base, reason: '向会员解读检查报告', patientId: String(patientId), relatedType: 'order', relatedId: String(orderId),
  } }, wrongOwner);
  assert.equal(wrongOwner.statusCode, 400);
});
