const express = require('express');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const SystemConfig = require('../models/SystemConfig');
const ClinicalStandardUpdate = require('../models/ClinicalStandardUpdate');
const { standards } = require('../../../shared/clinicalStandards.cjs');
const router = express.Router();

async function assignedReviewer(req, res, next) {
  const config = await SystemConfig.findOne({ key: 'clinicalStandardReviewer' }).lean();
  if (req.staff.role !== 'familyDoctor' || String(config?.value?.staffId || '') !== String(req.staff._id)) return res.status(403).json({ success: false, message: '此标准审核任务未指派给您' });
  next();
}
router.use(staffAuth, assignedReviewer);

router.get('/', async (req, res) => {
  const updates = await ClinicalStandardUpdate.find({ status: 'pending' }).sort({ detectedAt: -1 }).limit(100).lean();
  res.json({ success: true, data: updates.map(item => ({ ...item, standard: standards.find(row => row.id === item.standardId) || null })) });
});

router.post('/:id/review', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '更新记录无效' });
  const action = String(req.body?.action || '');
  const note = String(req.body?.note || '').trim();
  if (!['clinically_reviewed', 'dismissed'].includes(action) || note.length < 10 || note.length > 2000) return res.status(400).json({ success: false, message: '请选择处理结果，并填写至少10字审核说明' });
  const update = await ClinicalStandardUpdate.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { $set: { status: action, note, reviewedBy: req.staff._id, reviewedByName: req.staff.name, reviewedAt: new Date() } }, { new: true });
  if (!update) return res.status(409).json({ success: false, message: '任务已被处理，请刷新' });
  res.json({ success: true, data: update, message: action === 'clinically_reviewed' ? '已完成医学审核，等待规则实现与发布' : '已记录无需更新' });
});

module.exports = router;
