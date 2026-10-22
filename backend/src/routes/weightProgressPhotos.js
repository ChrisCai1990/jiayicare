const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const staffAuth = require('../middleware/staffAuth');
const userAuth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const User = require('../models/User');
const HealthPlan = require('../models/HealthPlan');
const Photo = require('../models/WeightProgressPhoto');
const { uploadBuffer, signStoredUrl, deleteFile } = require('../utils/oss');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.mimetype)) });
const acceptPhoto = (req, res, next) => upload.single('photo')(req, res, error => error
  ? bad(res, 400, '单张照片不能超过12MB') : next());
const staffRouter = express.Router();
const userRouter = express.Router();
const bad = (res, code, message) => res.status(code).json({ success: false, message });
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { console.error('[weight-progress-photos]', error); bad(res, 500, '体型照片处理失败，请稍后重试'); } };
const same = (a, b) => String(a || '') === String(b || '');
const assignedFields = ['assignedHealthManager', 'assignedFamilyDoctor', 'assignedNutritionist'];
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const validImage = (buffer, mime) => {
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (['image/heic', 'image/heif'].includes(mime)) return buffer.toString('ascii', 4, 8) === 'ftyp';
  return false;
};

async function staffPatient(req, res) {
  if (!mongoose.isValidObjectId(req.params.patientId)) { bad(res, 400, '会员ID无效'); return null; }
  const patient = await User.findOne({ _id: req.params.patientId, tenantId: req.staff.tenantId, isDeleted: { $ne: true } })
    .select(`_id tenantId ${assignedFields.join(' ')}`).lean();
  if (!patient) { bad(res, 404, '会员不存在'); return null; }
  if (req.staff.role !== 'superadmin' && !assignedFields.some(field => same(patient[field], req.staff._id))) {
    bad(res, 403, '无权查看该会员照片'); return null;
  }
  return patient;
}
async function planFor(patient, planId, res, actorType) {
  if (!planId) return null;
  if (!mongoose.isValidObjectId(planId)) { bad(res, 400, '方案ID无效'); return false; }
  const plan = await HealthPlan.findOne({ _id: planId, patientId: patient._id, type: 'nutrition',
    ...(actorType === 'patient' ? { pushedAt: { $ne: null } } : {}) }).select('_id').lean();
  if (!plan) { bad(res, 400, '营养方案不属于该会员'); return false; }
  return plan._id;
}
function output(row) {
  return { id: row._id, planId: row.planId, stage: row.stage, view: row.view, takenOn: row.takenOn,
    uploadedByType: row.uploadedByType, createdAt: row.createdAt, url: signStoredUrl('', row.ossKey) };
}
async function list(req, res, patient) {
  const rows = await Photo.find({ tenantId: patient.tenantId, patientId: patient._id, deletedAt: null })
    .sort({ takenOn: -1, createdAt: -1 }).limit(300).lean();
  res.json({ success: true, data: rows.map(output) });
}
async function create(req, res, patient, actorType, actorId) {
  if (!req.file) return bad(res, 400, '请选择 JPG、PNG、WebP 或 HEIC 照片（不超过12MB）');
  if (!validImage(req.file.buffer, req.file.mimetype)) return bad(res, 400, '照片内容与格式不符');
  const { stage, view, takenOn, planId, consentConfirmed } = req.body;
  if (!['before', 'progress', 'after'].includes(stage) || !['front', 'side', 'back'].includes(view)) return bad(res, 400, '请选择阶段和拍摄角度');
  const parsedDate = Date.parse(`${takenOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(takenOn || '') || !Number.isFinite(parsedDate)
    || new Date(parsedDate).toISOString().slice(0, 10) !== takenOn || takenOn > localToday()) return bad(res, 400, '拍摄日期无效');
  if (consentConfirmed !== 'true') return bad(res, 400, '请先确认客户同意本次体型照片存档');
  const resolvedPlanId = await planFor(patient, planId, res, actorType);
  if (resolvedPlanId === false) return;
  const stored = await uploadBuffer(req.file.buffer, req.file.mimetype, 'weight-progress-photos');
  try {
    const row = await Photo.create({ tenantId: patient.tenantId, patientId: patient._id, planId: resolvedPlanId,
      stage, view, takenOn, ossKey: stored.key, mimeType: stored.mimeType,
      uploadedByType: actorType, uploadedBy: actorId, consentConfirmedAt: new Date() });
    res.status(201).json({ success: true, data: output(row) });
  } catch (error) { await deleteFile(stored.key); throw error; }
}
async function createBase64(req, res) {
  const { content, mimeType } = req.body || {};
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)
    || typeof content !== 'string' || content.length > 16 * 1024 * 1024
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
    return bad(res, 400, '照片格式无效或超过12MB');
  }
  const buffer = Buffer.from(content, 'base64');
  if (buffer.length > 12 * 1024 * 1024) return bad(res, 400, '单张照片不能超过12MB');
  req.file = { buffer, mimetype: mimeType };
  return create(req, res, req.user, 'patient', req.user._id);
}
async function remove(req, res, patient, actorType, actorId) {
  if (!mongoose.isValidObjectId(req.params.photoId)) return bad(res, 400, '照片ID无效');
  const filter = { _id: req.params.photoId, tenantId: patient.tenantId, patientId: patient._id, deletedAt: null };
  if (actorType === 'patient') Object.assign(filter, { uploadedByType: 'patient', uploadedBy: actorId });
  const row = await Photo.findOneAndUpdate(filter, { $set: { deletedAt: new Date(), deletedByType: actorType, deletedBy: actorId } });
  if (!row) return bad(res, 404, '照片不存在或无权删除');
  res.json({ success: true });
}

staffRouter.get('/patients/:patientId/weight-progress-photos', staffAuth, checkPermission('patients', 'view'), wrap(async (req, res) => {
  const patient = await staffPatient(req, res); if (patient) await list(req, res, patient);
}));
staffRouter.post('/patients/:patientId/weight-progress-photos', staffAuth, checkPermission('patients', 'edit'), acceptPhoto, wrap(async (req, res) => {
  const patient = await staffPatient(req, res); if (patient) await create(req, res, patient, 'staff', req.staff._id);
}));
staffRouter.delete('/patients/:patientId/weight-progress-photos/:photoId', staffAuth, checkPermission('patients', 'edit'), wrap(async (req, res) => {
  const patient = await staffPatient(req, res); if (patient) await remove(req, res, patient, 'staff', req.staff._id);
}));
userRouter.get('/', userAuth, wrap(async (req, res) => list(req, res, req.user)));
userRouter.get('/plans', userAuth, wrap(async (req, res) => {
  const plans = await HealthPlan.find({ patientId: req.user._id, type: 'nutrition', pushedAt: { $ne: null } })
    .sort({ createdAt: -1 }).select('_id title createdAt startDate endDate').limit(30).lean();
  res.json({ success: true, data: plans });
}));
userRouter.post('/', userAuth, acceptPhoto, wrap(async (req, res) => create(req, res, req.user, 'patient', req.user._id)));
userRouter.post('/base64', userAuth, express.json({ limit: '17mb' }), wrap(createBase64));
userRouter.delete('/:photoId', userAuth, wrap(async (req, res) => remove(req, res, req.user, 'patient', req.user._id)));

module.exports = { staffRouter, userRouter };
module.exports.__test = { staffPatient, planFor, validImage };
