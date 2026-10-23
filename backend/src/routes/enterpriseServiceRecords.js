const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const enterpriseHrAuth = require('../middleware/enterpriseHrAuth');
const Enterprise = require('../models/Enterprise');
const EnterpriseServiceRecord = require('../models/EnterpriseServiceRecord');
const { validateInput, privateDirectory, normalizeFileName, TYPES } = require('../utils/enterpriseServiceRecord');

const adminRouter = express.Router();
const hrRouter = express.Router();
function serviceRecordAdmin(req, res, next) {
  if (!['superadmin', 'platformSuper'].includes(req.admin.role)) {
    return res.status(403).json({ success: false, message: '仅超级管理员可管理企业服务记录' });
  }
  next();
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    cb(null, TYPES[extension] === file.mimetype);
  },
});

function uploadOne(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? '文件不能超过20MB' : '上传失败' });
    next();
  });
}

function publicRecord(record) {
  return {
    _id: record._id, year: record.year, period: record.period, kind: record.kind,
    title: record.title, summary: record.summary, fileName: normalizeFileName(record.file?.name),
    fileSize: record.file?.size, publishedAt: record.publishedAt,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

async function sendFile(res, record) {
  const filePath = path.join(privateDirectory(), path.basename(record.file.key));
  try { await fs.access(filePath); }
  catch { return res.status(404).json({ success: false, message: '文件不存在，请联系管理员' }); }
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', record.file.mimeType);
  return res.download(filePath, normalizeFileName(record.file.name));
}

adminRouter.get('/enterprises/:id/service-records', adminAuth, serviceRecordAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '企业ID无效' });
  const records = await EnterpriseServiceRecord.find({ enterpriseId: req.params.id }).sort({ year: -1, createdAt: -1 }).lean();
  res.json({ success: true, data: records.map(publicRecord) });
});

adminRouter.post('/enterprises/:id/service-records', adminAuth, serviceRecordAdmin, uploadOne, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '企业ID无效' });
  const error = validateInput(req.body, req.file);
  if (error) return res.status(400).json({ success: false, message: error });
  if (!await Enterprise.exists({ _id: req.params.id })) return res.status(404).json({ success: false, message: '企业不存在' });

  const directory = privateDirectory();
  const fileName = normalizeFileName(req.file.originalname);
  const key = `${crypto.randomUUID()}${path.extname(fileName).toLowerCase()}`;
  const filePath = path.join(directory, key);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, req.file.buffer, { flag: 'wx' });
  try {
    const record = await EnterpriseServiceRecord.create({
      enterpriseId: req.params.id,
      year: Number(req.body.year), period: req.body.period, kind: req.body.kind,
      title: req.body.title.trim(), summary: String(req.body.summary || '').trim(),
      file: { name: fileName, key, mimeType: req.file.mimetype, size: req.file.size },
      publishedAt: req.body.publish === 'true' ? new Date() : null,
      createdBy: req.admin._id,
    });
    res.status(201).json({ success: true, data: publicRecord(record) });
  } catch (err) {
    await fs.unlink(filePath).catch(() => {});
    throw err;
  }
});

adminRouter.patch('/enterprises/:id/service-records/:recordId', adminAuth, serviceRecordAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.recordId)) {
    return res.status(400).json({ success: false, message: '记录ID无效' });
  }
  if (typeof req.body?.published !== 'boolean') return res.status(400).json({ success: false, message: '请指定是否对企业可见' });
  const record = await EnterpriseServiceRecord.findOneAndUpdate(
    { _id: req.params.recordId, enterpriseId: req.params.id },
    { $set: { publishedAt: req.body.published ? new Date() : null } },
    { new: true },
  );
  if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
  res.json({ success: true, data: publicRecord(record) });
});

adminRouter.get('/enterprises/:id/service-records/:recordId/file', adminAuth, serviceRecordAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.recordId)) {
    return res.status(400).json({ success: false, message: '记录ID无效' });
  }
  const record = await EnterpriseServiceRecord.findOne({ _id: req.params.recordId, enterpriseId: req.params.id }).lean();
  if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
  return sendFile(res, record);
});

hrRouter.get('/service-records/:recordId/file', enterpriseHrAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.recordId)) return res.status(400).json({ success: false, message: '记录ID无效' });
  const record = await EnterpriseServiceRecord.findOne({
    _id: req.params.recordId, enterpriseId: req.enterpriseId, publishedAt: { $ne: null },
  }).lean();
  if (!record) return res.status(404).json({ success: false, message: '记录不存在或尚未发布' });
  return sendFile(res, record);
});

module.exports = { adminRouter, hrRouter, publicRecord };
