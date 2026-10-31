const router = require('express').Router();
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const StaffAvailability = require('../models/StaffAvailability');
const Admin = require('../models/Admin');

router.use(staffAuth);
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const canViewTeam = staff => ['healthPlanner', 'superadmin', 'manager'].includes(staff.role);
const range = req => {
  const start = new Date(req.query.start), end = new Date(req.query.end);
  return Number.isFinite(+start) && Number.isFinite(+end) && end > start && end - start <= 31 * 86400000 ? { start, end } : null;
};

router.get('/', async (req, res) => {
  const period = range(req);
  if (!period) return fail(res, 400, '请选择不超过31天的有效时间范围');
  const targetId = req.query.staffId || String(req.staff._id);
  if (!mongoose.isValidObjectId(targetId)) return fail(res, 400, '人员编号无效');
  if (String(targetId) !== String(req.staff._id) && !canViewTeam(req.staff)) return fail(res, 403, '无权查看其他人员排班');
  const slots = await StaffAvailability.find({ staffId: targetId, startAt: { $lt: period.end }, endAt: { $gt: period.start } }).sort({ startAt: 1 }).lean();
  res.json({ success: true, data: slots });
});

router.get('/team', async (req, res) => {
  if (!canViewTeam(req.staff)) return fail(res, 403, '仅健康规划师可查看团队排班');
  const period = range(req);
  if (!period) return fail(res, 400, '请选择不超过31天的有效时间范围');
  const staff = await Admin.find({ staffStatus: { $ne: 'inactive' } }).select('_id name role').sort({ name: 1 }).lean();
  const ids = staff.map(x => x._id);
  const slots = await StaffAvailability.find({ staffId: { $in: ids }, startAt: { $lt: period.end }, endAt: { $gt: period.start } }).sort({ startAt: 1 }).lean();
  res.json({ success: true, data: { staff, slots } });
});

router.post('/', async (req, res) => {
  const startAt = new Date(req.body?.startAt), endAt = new Date(req.body?.endAt);
  if (!Number.isFinite(+startAt) || !Number.isFinite(+endAt) || startAt < new Date() || endAt - startAt < 15 * 60000 || endAt - startAt > 12 * 3600000 || startAt > new Date(Date.now() + 180 * 86400000))
    return fail(res, 400, '请选择未来180天内、15分钟至12小时的时间段');
  const staffId = req.body?.staffId || req.staff._id;
  if (!mongoose.isValidObjectId(staffId)) return fail(res, 400, '人员编号无效');
  if (String(staffId) !== String(req.staff._id) && !canViewTeam(req.staff)) return fail(res, 403, '无权维护其他人员排班');
  const staff = await Admin.findOne({ _id: staffId, staffStatus: { $ne: 'inactive' } }).select('_id').lean();
  if (!staff) return fail(res, 404, '人员不存在或已停用');
  if (await StaffAvailability.exists({ staffId, startAt: { $lt: endAt }, endAt: { $gt: startAt } })) return fail(res, 409, '该时间与现有排班或预约冲突');
  const slot = await StaffAvailability.create({ tenantId: req.staff.tenantId, staffId, startAt, endAt, status: req.body?.status === 'unavailable' ? 'unavailable' : 'available', source: String(staffId) === String(req.staff._id) ? 'self' : 'planner', updatedBy: req.staff._id });
  res.status(201).json({ success: true, data: slot });
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, '排班编号无效');
  const slot = await StaffAvailability.findById(req.params.id);
  if (!slot) return fail(res, 404, '排班不存在');
  if (String(slot.staffId) !== String(req.staff._id) && !canViewTeam(req.staff)) return fail(res, 403, '无权修改其他人员排班');
  if (slot.status === 'booked') return fail(res, 409, '已预约时间不能直接删除，请先处理预约');
  await slot.deleteOne();
  res.json({ success: true });
});

module.exports = router;
