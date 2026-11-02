const router = require('express').Router();
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const StaffAvailability = require('../models/StaffAvailability');
const StaffScheduleBooking = require('../models/StaffScheduleBooking');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const ServiceRecord = require('../models/ServiceRecord');
const FollowUp = require('../models/FollowUp');
const HealthPlan = require('../models/HealthPlan');

router.use(staffAuth);
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const canManageOthers = staff => ['healthPlanner', 'healthManager', 'superadmin', 'manager'].includes(staff.role);
const range = req => {
  const start = new Date(req.query.start), end = new Date(req.query.end);
  return Number.isFinite(+start) && Number.isFinite(+end) && end > start && end - start <= 45 * 86400000 ? { start, end } : null;
};

router.get('/', async (req, res) => {
  const period = range(req);
  if (!period) return fail(res, 400, '请选择不超过45天的有效时间范围');
  const targetId = req.query.staffId || String(req.staff._id);
  if (!mongoose.isValidObjectId(targetId)) return fail(res, 400, '人员编号无效');
  const slots = await StaffAvailability.find({ tenantId: req.staff.tenantId, staffId: targetId, startAt: { $lt: period.end }, endAt: { $gt: period.start } }).sort({ startAt: 1 }).lean();
  res.json({ success: true, data: slots });
});

router.get('/team', async (req, res) => {
  const period = range(req);
  if (!period) return fail(res, 400, '请选择不超过45天的有效时间范围');
  const staff = await Admin.find({ tenantId: req.staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id name role').sort({ name: 1 }).lean();
  const ids = staff.map(x => x._id);
  const slots = await StaffAvailability.find({ tenantId: req.staff.tenantId, staffId: { $in: ids }, startAt: { $lt: period.end }, endAt: { $gt: period.start } }).sort({ startAt: 1 }).lean();
  res.json({ success: true, data: { staff, slots } });
});

router.get('/bookings', async (req, res) => {
  const period = range(req);
  if (!period) return fail(res, 400, '请选择不超过45天的有效时间范围');
  const targetId = req.query.staffId || String(req.staff._id);
  if (!mongoose.isValidObjectId(targetId)) return fail(res, 400, '人员编号无效');
  const filter = { tenantId: req.staff.tenantId, staffId: targetId, status: 'scheduled',
    startAt: { $lt: period.end }, endAt: { $gt: period.start } };
  if (!canManageOthers(req.staff)) filter.$or = [{ staffId: req.staff._id }, { createdBy: req.staff._id }];
  const bookings = await StaffScheduleBooking.find(filter).sort({ startAt: 1 }).lean();
  res.json({ success: true, data: bookings });
});

router.post('/bookings', async (req, res) => {
  const ids = req.body?.slotIds;
  const category = req.body?.category;
  const title = String(req.body?.title || '').trim();
  const reason = String(req.body?.reason || '').trim();
  const note = String(req.body?.note || '').trim();
  const relatedType = req.body?.relatedType || null;
  const relatedId = req.body?.relatedId || null;
  const patientId = req.body?.patientId || null;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 36 || new Set(ids.map(String)).size !== ids.length ||
      ids.some(id => !mongoose.isValidObjectId(id)) || !['service', 'communication', 'task', 'other'].includes(category) ||
      !title || title.length > 120 || !reason || reason.length > 300 || note.length > 1000 ||
      (patientId && !mongoose.isValidObjectId(patientId)) || Boolean(relatedType) !== Boolean(relatedId) ||
      (relatedType && (!['patient', 'product', 'order', 'service_record', 'follow_up', 'health_plan'].includes(relatedType) || !mongoose.isValidObjectId(relatedId))))
    return fail(res, 400, '请选择1至36个空档，填写事项名称和300字以内的预约缘由');
  if (patientId && !await User.exists({ _id: patientId, tenantId: req.staff.tenantId })) return fail(res, 404, '关联会员不存在');
  if (relatedType) {
    const models = { patient: User, product: Product, order: Order, service_record: ServiceRecord, follow_up: FollowUp, health_plan: HealthPlan };
    const related = await models[relatedType].findOne(relatedType === 'health_plan' ? { _id: relatedId } : { _id: relatedId, tenantId: req.staff.tenantId }).select('_id patientId user').lean();
    if (!related) return fail(res, 404, '关联的服务或产品不存在');
    const ownerId = relatedType === 'patient' ? related._id : relatedType === 'order' ? related.user : ['service_record', 'follow_up', 'health_plan'].includes(relatedType) ? related.patientId : null;
    if (relatedType === 'health_plan' && (!ownerId || !await User.exists({ _id: ownerId, tenantId: req.staff.tenantId }))) return fail(res, 404, '关联方案不存在');
    if (patientId && ownerId && String(patientId) !== String(ownerId)) return fail(res, 400, '预约会员与关联记录不一致');
  }
  const slots = await StaffAvailability.find({ _id: { $in: ids }, tenantId: req.staff.tenantId }).sort({ startAt: 1 }).lean();
  if (slots.length !== ids.length || slots.some(slot => slot.status !== 'available' || String(slot.staffId) !== String(slots[0].staffId)))
    return fail(res, 409, '所选空档已变化，请刷新后重选');
  if (+slots[0].startAt < Date.now() || +slots.at(-1).endAt - +slots[0].startAt > 12 * 3600000 ||
      slots.some((slot, index) => index && +slot.startAt !== +slots[index - 1].endAt))
    return fail(res, 400, '只能预约未来连续且不超过12小时的空档');
  const target = await Admin.findOne({ _id: slots[0].staffId, tenantId: req.staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id').lean();
  if (!target) return fail(res, 404, '预约人员不存在或已停用');
  const booking = await StaffScheduleBooking.create({ tenantId: req.staff.tenantId, staffId: slots[0].staffId,
    createdBy: req.staff._id, slotIds: slots.map(slot => slot._id), originalSources: slots.map(slot => slot.source),
    startAt: slots[0].startAt, endAt: slots.at(-1).endAt, category, title, reason, note, patientId, relatedType, relatedId, status: 'pending' });
  const reserved = [];
  try {
    for (const slot of slots) {
      const result = await StaffAvailability.updateOne({ _id: slot._id, tenantId: req.staff.tenantId, status: 'available' },
        { $set: { status: 'booked', bookingId: booking._id, source: 'general_booking', updatedBy: req.staff._id } });
      if (result.modifiedCount !== 1) throw new Error('slot_conflict');
      reserved.push(slot);
    }
    const activated = await StaffScheduleBooking.updateOne({ _id: booking._id, tenantId: req.staff.tenantId, status: 'pending' }, { $set: { status: 'scheduled' } });
    if (activated.modifiedCount !== 1) throw new Error('booking_activation_failed');
  } catch (error) {
    for (const slot of reserved) await StaffAvailability.updateOne({ _id: slot._id, tenantId: req.staff.tenantId,
      bookingId: booking._id, source: 'general_booking' }, { $set: { status: 'available', bookingId: null, source: slot.source, updatedBy: req.staff._id } });
    await StaffScheduleBooking.updateOne({ _id: booking._id, tenantId: req.staff.tenantId }, { $set: { status: 'cancelled', cancelledBy: req.staff._id, cancelledAt: new Date() } });
    if (error.message === 'slot_conflict') return fail(res, 409, '部分时间刚被预约，请刷新后重选');
    throw error;
  }
  res.status(201).json({ success: true, data: booking });
});

router.post('/bookings/:id/cancel', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, '预约编号无效');
  const booking = await StaffScheduleBooking.findOne({ _id: req.params.id, tenantId: req.staff.tenantId, status: 'scheduled' }).lean();
  if (!booking) return fail(res, 404, '预约不存在或已取消');
  if (![booking.staffId, booking.createdBy].some(id => String(id) === String(req.staff._id)) && !canManageOthers(req.staff))
    return fail(res, 403, '无权取消此预约');
  const claimed = await StaffScheduleBooking.updateOne({ _id: booking._id, tenantId: req.staff.tenantId, status: 'scheduled' },
    { $set: { status: 'cancelling' } });
  if (claimed.modifiedCount !== 1) return fail(res, 409, '预约状态已变化，请刷新');
  for (let index = 0; index < booking.slotIds.length; index++) {
    await StaffAvailability.updateOne({ _id: booking.slotIds[index], tenantId: req.staff.tenantId,
      bookingId: booking._id, source: 'general_booking' },
    { $set: { status: 'available', bookingId: null, source: booking.originalSources[index] || 'self', updatedBy: req.staff._id } });
  }
  await StaffScheduleBooking.updateOne({ _id: booking._id, tenantId: req.staff.tenantId, status: 'cancelling' },
    { $set: { status: 'cancelled', cancelledBy: req.staff._id, cancelledAt: new Date() } });
  res.json({ success: true });
});

router.post('/', async (req, res) => {
  const startAt = new Date(req.body?.startAt), endAt = new Date(req.body?.endAt);
  if (!Number.isFinite(+startAt) || !Number.isFinite(+endAt) || startAt < new Date() || endAt - startAt < 15 * 60000 || endAt - startAt > 12 * 3600000 || startAt > new Date(Date.now() + 180 * 86400000))
    return fail(res, 400, '请选择未来180天内、15分钟至12小时的时间段');
  const staffId = req.body?.staffId || req.staff._id;
  if (!mongoose.isValidObjectId(staffId)) return fail(res, 400, '人员编号无效');
  if (String(staffId) !== String(req.staff._id) && !canManageOthers(req.staff)) return fail(res, 403, '无权维护其他人员排班');
  const staff = await Admin.findOne({ _id: staffId, tenantId: req.staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id').lean();
  if (!staff) return fail(res, 404, '人员不存在或已停用');
  if (await StaffAvailability.exists({ tenantId: req.staff.tenantId, staffId, startAt: { $lt: endAt }, endAt: { $gt: startAt } })) return fail(res, 409, '该时间与现有排班或预约冲突');
  const slot = await StaffAvailability.create({ tenantId: req.staff.tenantId, staffId, startAt, endAt, status: req.body?.status === 'unavailable' ? 'unavailable' : 'available', source: String(staffId) === String(req.staff._id) ? 'self' : 'planner', updatedBy: req.staff._id });
  res.status(201).json({ success: true, data: slot });
});

router.post('/batch', async (req, res) => {
  const startAt = new Date(req.body?.startAt), endAt = new Date(req.body?.endAt);
  const minutes = Number(req.body?.segmentMinutes);
  const step = minutes * 60000;
  const duration = +endAt - +startAt;
  const now = Date.now();
  if (!Number.isFinite(+startAt) || !Number.isFinite(+endAt) || +startAt > now + 180 * 86400000 ||
      duration < 15 * 60000 || duration > 12 * 3600000 || ![20, 30].includes(minutes) || duration % step !== 0)
    return fail(res, 400, '请选择未来180天内的时间，起止时间须能完整分成20分钟或30分钟的空档');
  if (req.body?.status !== 'available') return fail(res, 400, '分段排班仅用于可预约时间');
  const skipped = Math.max(0, Math.ceil((now - +startAt) / step));
  const count = duration / step - skipped;
  if (count <= 0) return fail(res, 400, '这段时间已全部过去，请选择未来的空档');
  const effectiveStart = new Date(+startAt + skipped * step);
  const staffId = req.body?.staffId || req.staff._id;
  if (!mongoose.isValidObjectId(staffId)) return fail(res, 400, '人员编号无效');
  if (String(staffId) !== String(req.staff._id) && !canManageOthers(req.staff)) return fail(res, 403, '无权维护其他人员排班');
  const staff = await Admin.findOne({ _id: staffId, tenantId: req.staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id').lean();
  if (!staff) return fail(res, 404, '人员不存在或已停用');
  if (await StaffAvailability.exists({ tenantId: req.staff.tenantId, staffId, startAt: { $lt: endAt }, endAt: { $gt: effectiveStart } }))
    return fail(res, 409, '这段时间已有排班或预约，未新增任何空档');
  const rows = Array.from({ length: count }, (_, index) => ({
    tenantId: req.staff.tenantId, staffId,
    startAt: new Date(+effectiveStart + index * step), endAt: new Date(+effectiveStart + (index + 1) * step),
    status: 'available', source: String(staffId) === String(req.staff._id) ? 'self' : 'planner', updatedBy: req.staff._id,
  }));
  await StaffAvailability.insertMany(rows);
  res.status(201).json({ success: true, data: { count: rows.length, skipped, firstStartAt: rows[0].startAt } });
});

router.post('/day-plan', async (req, res) => {
  const date = String(req.body?.date || '');
  const windows = req.body?.windows;
  const mode = req.body?.segmentMinutes;
  const status = req.body?.status === 'unavailable' ? 'unavailable' : 'available';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(windows) || windows.length < 1 || windows.length > 3 ||
      !['whole', 20, 30].includes(mode) || (status === 'unavailable' && mode !== 'whole'))
    return fail(res, 400, '请选择当天的上午、下午或晚上时间，并确认分段方式');
  const staffId = req.body?.staffId || req.staff._id;
  if (!mongoose.isValidObjectId(staffId)) return fail(res, 400, '人员编号无效');
  if (String(staffId) !== String(req.staff._id) && !canManageOthers(req.staff)) return fail(res, 403, '无权维护其他人员排班');
  const staff = await Admin.findOne({ _id: staffId, tenantId: req.staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id').lean();
  if (!staff) return fail(res, 404, '人员不存在或已停用');
  const localDay = value => value.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const selected = [], seen = new Set();
  const step = mode === 'whole' ? 0 : mode * 60000;
  const now = Date.now();
  for (const window of windows) {
    const period = window?.period;
    const startAt = new Date(window?.startAt), endAt = new Date(window?.endAt);
    const duration = +endAt - +startAt;
    if (!['morning', 'afternoon', 'evening'].includes(period) || seen.has(period) || !Number.isFinite(+startAt) || !Number.isFinite(+endAt) ||
        localDay(startAt) !== date || localDay(endAt) !== date || duration < 15 * 60000 || duration > 12 * 3600000 ||
        +startAt > now + 180 * 86400000 || (step && duration % step !== 0))
      return fail(res, 400, '请检查同一天各时段的起止时间；分段时间须能被20或30分钟整除');
    seen.add(period);
    selected.push({ period, startAt, endAt, duration });
  }
  selected.sort((a, b) => a.startAt - b.startAt);
  if (selected.some((item, index) => index && item.startAt < selected[index - 1].endAt))
    return fail(res, 400, '上午、下午、晚上时间不能互相重叠');
  const rows = [];
  let skippedPast = 0;
  for (const window of selected) {
    if (mode === 'whole') {
      if (+window.startAt < now) { skippedPast += 1; continue; }
      rows.push({ startAt: window.startAt, endAt: window.endAt });
      continue;
    }
    const total = window.duration / step;
    const skipped = Math.min(total, Math.max(0, Math.ceil((now - +window.startAt) / step)));
    skippedPast += skipped;
    for (let index = skipped; index < total; index++) {
      rows.push({ startAt: new Date(+window.startAt + index * step), endAt: new Date(+window.startAt + (index + 1) * step) });
    }
  }
  if (!rows.length) return fail(res, 400, '所选时间都已过去，请选择未来的空档');
  const existing = await StaffAvailability.find({ tenantId: req.staff.tenantId, staffId,
    startAt: { $lt: rows.at(-1).endAt }, endAt: { $gt: rows[0].startAt } }).select('startAt endAt').lean();
  const available = rows.filter(row => !existing.some(slot => slot.startAt < row.endAt && slot.endAt > row.startAt));
  if (!available.length) return fail(res, 409, '所选时间均与现有排班或预约重叠，未新增空档');
  const records = available.map(row => ({ ...row, tenantId: req.staff.tenantId, staffId, status,
    source: String(staffId) === String(req.staff._id) ? 'self' : 'planner', updatedBy: req.staff._id }));
  await StaffAvailability.insertMany(records);
  res.status(201).json({ success: true, data: { count: records.length, skippedPast, skippedExisting: rows.length - available.length } });
});

router.post('/copy-week', async (req, res) => {
  const targetStart = new Date(req.body?.targetWeekStart);
  if (!Number.isFinite(+targetStart)) return fail(res, 400, '请选择要复制到的周');
  const staffId = req.body?.staffId || req.staff._id;
  if (!mongoose.isValidObjectId(staffId)) return fail(res, 400, '人员编号无效');
  if (String(staffId) !== String(req.staff._id) && !canManageOthers(req.staff)) return fail(res, 403, '无权维护其他人员排班');
  const staff = await Admin.findOne({ _id: staffId, tenantId: req.staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id').lean();
  if (!staff) return fail(res, 404, '人员不存在或已停用');
  const weekMs = 7 * 86400000;
  const sourceStart = new Date(+targetStart - weekMs);
  const source = await StaffAvailability.find({ tenantId: req.staff.tenantId, staffId,
    startAt: { $gte: sourceStart, $lt: targetStart } }).sort({ startAt: 1 }).lean();
  if (!source.length) return fail(res, 409, '上一周没有可复制的排班，请先添加一周时间');
  if (source.length > 100) return fail(res, 409, '上一周时间段过多，请分批手动安排');
  const now = Date.now(), latest = now + 180 * 86400000;
  const copies = source.map(slot => ({ tenantId: req.staff.tenantId, staffId,
    startAt: new Date(+slot.startAt + weekMs), endAt: new Date(+slot.endAt + weekMs),
    status: slot.status === 'unavailable' ? 'unavailable' : 'available',
    source: String(staffId) === String(req.staff._id) ? 'self' : 'planner', updatedBy: req.staff._id }));
  if (copies.some(slot => +slot.startAt < now || +slot.startAt > latest || +slot.endAt - +slot.startAt < 15 * 60000 || +slot.endAt - +slot.startAt > 12 * 3600000))
    return fail(res, 400, '目标周须在未来180天内，且每段为15分钟至12小时');
  const overlaps = await StaffAvailability.exists({ tenantId: req.staff.tenantId, staffId,
    $or: copies.map(slot => ({ startAt: { $lt: slot.endAt }, endAt: { $gt: slot.startAt } })) });
  if (overlaps) return fail(res, 409, '目标周已有重叠排班或预约，未复制任何时间段');
  await StaffAvailability.insertMany(copies);
  res.status(201).json({ success: true, data: { count: copies.length } });
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, '排班编号无效');
  const slot = await StaffAvailability.findById(req.params.id);
  if (!slot || String(slot.tenantId) !== String(req.staff.tenantId)) return fail(res, 404, '排班不存在');
  if (String(slot.staffId) !== String(req.staff._id) && !canManageOthers(req.staff)) return fail(res, 403, '无权修改其他人员排班');
  if (slot.status === 'booked') return fail(res, 409, '已预约时间不能直接删除，请先处理预约');
  await slot.deleteOne();
  res.json({ success: true });
});

module.exports = router;
