const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const Config = require('../models/NutritionAssessmentConfig');
const defaults = () => ({
  enabled: false, requestTitle: '营养评估需求单',
  requestInstructions: '请说明评估原因及重点关注问题',
  bookingInstructions: '与客户确认日期、具体时间及线上腾讯会议室或线下门店',
  assessmentInstructions: '形成评估结论及后续建议',
  onlineEnabled: true, offlineEnabled: true,
});
router.get('/', adminAuth, async (req, res) => {
  if (!req.admin.tenantId) return res.status(403).json({ success: false, message: '请选择所属机构' });
  const row = await Config.findOne({ tenantId: req.admin.tenantId }).lean();
  res.json({ success: true, data: row || defaults() });
});
router.put('/', adminAuth, async (req, res) => {
  if (!req.admin.tenantId || req.admin.role !== 'superadmin')
    return res.status(403).json({ success: false, message: '仅机构管理员可设置营养评估需求单' });
  const source = req.body || {};
  const data = {
    enabled: source.enabled === true,
    requestTitle: String(source.requestTitle || '').trim().slice(0, 80),
    requestInstructions: String(source.requestInstructions || '').trim().slice(0, 1000),
    bookingInstructions: String(source.bookingInstructions || '').trim().slice(0, 1000),
    assessmentInstructions: String(source.assessmentInstructions || '').trim().slice(0, 1000),
    onlineEnabled: source.onlineEnabled === true,
    offlineEnabled: source.offlineEnabled === true,
  };
  if (!data.requestTitle || !data.requestInstructions || !data.bookingInstructions || !data.assessmentInstructions)
    return res.status(400).json({ success: false, message: '请完整填写需求单及各岗位提示' });
  if (!data.onlineEnabled && !data.offlineEnabled)
    return res.status(400).json({ success: false, message: '至少保留一种预约方式' });
  const row = await Config.findOneAndUpdate({ tenantId: req.admin.tenantId },
    { $set: data, $setOnInsert: { tenantId: req.admin.tenantId } },
    { upsert: true, new: true, runValidators: true });
  res.json({ success: true, data: row });
});
module.exports = router;
