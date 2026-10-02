const express = require('express');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const Admin = require('../models/Admin');
const SystemConfig = require('../models/SystemConfig');
const ClinicalStandardWatch = require('../models/ClinicalStandardWatch');
const ClinicalStandardUpdate = require('../models/ClinicalStandardUpdate');
const { standards } = require('../../../shared/clinicalStandards.cjs');
const { checkAll } = require('../utils/clinicalStandardMonitor');
const router = express.Router();
const ASSIGNEE_KEY = 'clinicalStandardReviewer';
router.use(adminAuth, (req, res, next) => req.admin.role === 'platformSuper' ? next() : res.status(403).json({ success: false, message: '仅平台管理员可管理标准目录' }));

router.get('/', async (req, res) => {
  const [watches, updates, assignee, reviewers] = await Promise.all([
    ClinicalStandardWatch.find().lean(),
    ClinicalStandardUpdate.find().sort({ detectedAt: -1 }).limit(100).lean(),
    SystemConfig.findOne({ key: ASSIGNEE_KEY }).lean(),
    Admin.find({ role: 'familyDoctor', staffStatus: 'active' }).select('name title tenantId').populate('tenantId', 'name').lean(),
  ]);
  res.json({ success: true, data: { standards: standards.map(item => ({ ...item, watch: watches.find(row => row.standardId === item.id) || null })), updates, reviewerId: assignee?.value?.staffId || '', reviewers } });
});

router.put('/reviewer', async (req, res) => {
  const id = String(req.body?.staffId || '');
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: '请选择健康顾问' });
  const reviewer = await Admin.findOne({ _id: id, role: 'familyDoctor', staffStatus: 'active' }).select('name tenantId').lean();
  if (!reviewer) return res.status(400).json({ success: false, message: '健康顾问不存在或已停用' });
  await SystemConfig.updateOne({ key: ASSIGNEE_KEY }, { $set: { value: { staffId: id, name: reviewer.name }, label: '临床标准更新指定审核人' } }, { upsert: true });
  res.json({ success: true, data: { staffId: id, name: reviewer.name } });
});

router.post('/check', async (req, res) => {
  const data = await checkAll({ force: true });
  res.json({ success: true, data });
});

module.exports = router;
