const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const UserScreeningItem = require('../models/UserScreeningItem');
const MedicalReport = require('../models/MedicalReport');
const { sha256 } = require('../utils/reportUploadIdentity');

// GET /screening — 获取当前用户所有已选筛查项
router.get('/', auth, async (req, res) => {
  const items = await UserScreeningItem.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: items });
});

// POST /screening — 选中一个筛查项（幂等，已存在则直接返回）
router.post('/', auth, async (req, res) => {
  const { itemId, category, parentLabel, itemLabel } = req.body;
  if (!itemId || !category || !itemLabel) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }
  let item = await UserScreeningItem.findOne({ user: req.user._id, itemId });
  if (!item) {
    item = await UserScreeningItem.create({ user: req.user._id, itemId, category, parentLabel, itemLabel });
  }
  res.json({ success: true, data: item });
});

// DELETE /screening/:id — 取消选中
router.delete('/:id', auth, async (req, res) => {
  const item = await UserScreeningItem.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: '未找到' });
  await item.deleteOne();
  res.json({ success: true });
});

// PATCH /screening/:id/report — 上传报告并关联到筛查项
router.patch('/:id/report', auth, async (req, res) => {
  const item = await UserScreeningItem.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: '未找到筛查项' });

  const { title, hospital, date, content, mimeType, fileSize, pages, keyFindings } = req.body;
  if (!content || !mimeType) {
    return res.status(400).json({ success: false, message: '缺少文件内容' });
  }

  const actualDate = String(date || '').trim();
  if (actualDate && (!/^\d{4}-\d{2}-\d{2}$/.test(actualDate) || Number.isNaN(Date.parse(actualDate)) || new Date(actualDate).toISOString().slice(0, 10) !== actualDate)) return res.status(400).json({ success: false, message: '报告日期无效' });
  const sourceSha256 = sha256(Buffer.from(String(content).split(',').pop(), 'base64'));
  let report = await MedicalReport.findOne({ user: req.user._id, sourceSha256 });
  let duplicate = Boolean(report);
  if (!report) try { report = await MedicalReport.create({
    user: req.user._id,
    title: title || item.itemLabel,
    type: item.category,
    hospital: hospital || '',
    date: actualDate,
    checkDate: actualDate,
    reportYear: actualDate ? Number(actualDate.slice(0, 4)) : null,
    sourceSha256,
    pages: pages || 1,
    fileSize: fileSize || '',
    keyFindings: keyFindings || [],
    content,
    mimeType,
    audit_status: 'unaudited',
    status: 'pending',
    screeningItemId: item._id,
  }); } catch (error) {
    if (error.code !== 11000) throw error;
    report = await MedicalReport.findOne({ user: req.user._id, sourceSha256 });
    if (!report) throw error;
    duplicate = true;
  }

  item.reportId = report._id;
  item.status = 'uploaded';
  await item.save();

  res.json({ success: true, duplicate, data: { item, report } });
});

// PATCH /screening/:id/complete — 医护端标记已完成（或测试用）
router.patch('/:id/complete', auth, async (req, res) => {
  const item = await UserScreeningItem.findOne({ _id: req.params.id, user: req.user._id });
  if (!item) return res.status(404).json({ success: false, message: '未找到' });
  item.status = 'completed';
  item.note = req.body.note || item.note;
  await item.save();
  res.json({ success: true, data: item });
});

module.exports = router;
