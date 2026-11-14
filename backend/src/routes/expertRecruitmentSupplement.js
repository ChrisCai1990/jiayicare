const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const { runWithoutTenantScope } = require('../utils/tenantScope');
const Recruitment = require('../models/ExpertRecruitment');
const files = require('../utils/expertCertificates');
const { certificateTypes, normalizeLanguages } = require('../../../shared/expertQualifications.cjs');
const router = express.Router();
const hash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
const allowedStatuses = ['submitted', 'approved'];
function newAccess() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, fields: { supplementTokenHash: hash(token), supplementExpiresAt: new Date(Date.now() + 30 * 86400000) } };
}
const safe = row => ({ education: row.response?.education || '', languages: row.response?.languages || [],
  certificates: (row.certificates || []).map(c => ({ _id: c._id, category: c.category, name: files.normalizeName(c.name), size: c.size, reviewStatus: c.reviewStatus, reviewNote: c.reviewNote })),
  status: row.status,
  signedAgreements: row.status === 'approved' ? (row.signedAgreements || []).map(file => ({
    _id: file._id, name: files.normalizeName(file.name), signedDate: file.signedDate, archivedAt: file.archivedAt,
  })) : [],
  expiresAt: row.supplementExpiresAt });
const scope = (req, work) => req.admin ? work() : runWithoutTenantScope(work);
async function access(req, res, next) {
  if (req.admin && !['superadmin', 'manager'].includes(req.admin.role)) return res.status(403).json({ message: '无专家资料操作权限' });
  if (req.admin && !mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: '记录编号无效' });
  const query = req.admin ? { _id: req.params.id } : { supplementTokenHash: hash(req.params.token), supplementExpiresAt: { $gt: new Date() } };
  const row = await scope(req, () => Recruitment.findOne({ ...query, status: { $in: allowedStatuses } }).select('+certificates.key +signedAgreements.key'));
  if (!row) return res.status(404).json({ message: '补充链接已失效或记录不可访问，请联系专科合伙人重新获取' });
  req.recruitment = row;
  res.set('Cache-Control', 'no-store');
  next();
}
router.post('/admin/:id/supplement-link', adminAuth, access, async (req, res) => {
  const fresh = newAccess();
  await Recruitment.updateOne({ _id: req.recruitment._id }, { $set: fresh.fields });
  res.json({ success: true, data: { token: fresh.token, expiresAt: fresh.fields.supplementExpiresAt } });
});
router.get('/supplement/:token', access, (req, res) => res.json({ success: true, data: safe(req.recruitment) }));
router.get('/admin/:id/qualifications', adminAuth, access, (req, res) => res.json({ success: true, data: safe(req.recruitment) }));
async function save(req, res) {
  let languages;
  try { languages = normalizeLanguages(req.body.languages); } catch (e) { return res.status(400).json({ message: e.message }); }
  const education = req.body.education;
  if (!['', '博士研究生', '硕士研究生', '本科', '大专', '中专及以下', '其他'].includes(education)) return res.status(400).json({ message: '请选择最高学历' });
  const row = req.recruitment;
  const update = { $set: { 'response.languages': languages, 'response.education': education, supplementUpdatedAt: new Date() } };
  if ((row.response?.education || '') !== education) update.$push = { educationChanges: {
    before: row.response?.education || '', after: education, updatedBy: req.admin?._id || null, updatedAt: new Date(),
  } };
  const result = await scope(req, () => Recruitment.updateOne({ _id: row._id, updatedAt: row.updatedAt, status: row.status }, update));
  if (!result.matchedCount) return res.status(409).json({ message: '资料刚被更新，请刷新后重试' });
  res.json({ success: true });
}
router.patch('/supplement/:token', access, save);
router.patch('/admin/:id/qualifications', adminAuth, access, save);
const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 } }).single('file');
const upload = (req, res, next) => multipart(req, res, error => error ? res.status(400).json({ message: '上传失败：每次一个文件，单个不超过10MB' }) : next());
const signedMultipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3 } }).single('file');
const uploadSigned = (req, res, next) => signedMultipart(req, res, error => error ? res.status(400).json({ message: '上传失败：每次一个文件，单个不超过10MB' }) : next());
async function addFile(req, res) {
  if (!certificateTypes[req.body.category] || !req.file) return res.status(400).json({ message: '请选择证书类别及文件' });
  const row = req.recruitment;
  if (row.certificates.length >= 20) return res.status(400).json({ message: '每份问卷最多上传20个附件' });
  try { files.fileType(req.file.buffer); } catch (e) { return res.status(400).json({ message: e.message }); }
  const stored = await files.store(req.file, row);
  const attachment = { ...stored, category: req.body.category, name: files.normalizeName(req.file.originalname).slice(0, 160), uploadedAt: new Date(), uploadedBy: req.admin?._id || null, reviewStatus: 'pending' };
  try {
    const result = await scope(req, () => Recruitment.updateOne({ _id: row._id, status: row.status, 'certificates.19': { $exists: false } }, { $push: { certificates: attachment }, $set: { supplementUpdatedAt: new Date() } }));
    if (!result.matchedCount) { await files.remove(stored.key); return res.status(409).json({ message: '资料状态已变化或附件已满，请刷新' }); }
  } catch (e) { await files.remove(stored.key); throw e; }
  res.status(201).json({ success: true });
}
router.post('/supplement/:token/certificates', access, upload, addFile);
router.post('/admin/:id/certificates', adminAuth, access, upload, addFile);
async function download(req, res) {
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(400).json({ message: '附件编号无效' });
  const file = req.recruitment.certificates.id(req.params.fileId);
  if (!file) return res.status(404).json({ message: '附件不存在' });
  const result = await files.stream(file.key);
  res.set({ 'Content-Type': file.mimeType, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(files.normalizeName(file.name))}` });
  result.stream.on('error', () => res.destroy()).pipe(res);
}
router.get('/supplement/:token/certificates/:fileId', access, download);
router.get('/admin/:id/certificates/:fileId', adminAuth, access, download);
router.patch('/admin/:id/certificates/:fileId', adminAuth, access, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(400).json({ message: '附件编号无效' });
  if (!['pass', 'fail', 'pending'].includes(req.body.status)) return res.status(400).json({ message: '请选择核验结果' });
  const result = await Recruitment.updateOne({ _id: req.recruitment._id, 'certificates._id': req.params.fileId }, { $set: {
    'certificates.$.reviewStatus': req.body.status, 'certificates.$.reviewNote': String(req.body.note || '').slice(0, 500),
    'certificates.$.reviewedAt': new Date(), 'certificates.$.reviewedBy': req.admin._id,
  } });
  if (!result.matchedCount) return res.status(404).json({ message: '附件不存在' });
  res.json({ success: true });
});

// Signed paper contracts are archived by an authorized manager after admission.
router.post('/admin/:id/signed-agreements', adminAuth, access, uploadSigned, async (req, res) => {
  const row = req.recruitment;
  if (row.status !== 'approved') return res.status(409).json({ message: '仅已审核入库的专家可归档合作协议' });
  if (!req.file || req.body.confirmed !== 'true') return res.status(400).json({ message: '请选择已签文件并确认双方签署及文件完整' });
  const signedDate = String(req.body.signedDate || '').trim();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(signedDate) ? new Date(`${signedDate}T00:00:00Z`) : null;
  const todayChina = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== signedDate || signedDate > todayChina)
    return res.status(400).json({ message: '请填写有效的实际签署日期' });
  const agreementNo = String(req.body.agreementNo || '').trim();
  if (agreementNo.length > 100) return res.status(400).json({ message: '协议编号不能超过100字' });
  if ((row.signedAgreements || []).length >= 10) return res.status(400).json({ message: '每份招募记录最多归档10版协议' });
  try { files.fileType(req.file.buffer); } catch (e) { return res.status(400).json({ message: e.message }); }
  const stored = await files.store(req.file, row, 'expert-signed-agreements');
  const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const attachment = { ...stored, sha256, signedDate, agreementNo,
    name: files.normalizeName(req.file.originalname).slice(0, 160), archivedAt: new Date(), archivedBy: req.admin._id };
  try {
    const result = await Recruitment.updateOne({ _id: row._id, status: 'approved',
      'signedAgreements.9': { $exists: false }, 'signedAgreements.sha256': { $ne: sha256 },
    }, { $push: { signedAgreements: attachment } });
    if (!result.matchedCount) { await files.remove(stored.key); return res.status(409).json({ message: '协议已归档、状态已变化或版本已满，请刷新' }); }
  } catch (e) { await files.remove(stored.key); throw e; }
  res.status(201).json({ success: true, data: { sha256, archivedAt: attachment.archivedAt } });
});
router.get('/admin/:id/signed-agreements/:fileId', adminAuth, access, async (req, res) => {
  if (req.recruitment.status !== 'approved') return res.status(409).json({ message: '仅已审核入库的专家可查看合作协议' });
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(400).json({ message: '协议编号无效' });
  const file = req.recruitment.signedAgreements?.id(req.params.fileId);
  if (!file) return res.status(404).json({ message: '协议不存在' });
  const result = await files.stream(file.key);
  res.set({ 'Content-Type': file.mimeType, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(files.normalizeName(file.name))}` });
  result.stream.on('error', () => res.destroy()).pipe(res);
});
router.get('/supplement/:token/signed-agreements/:fileId', access, async (req, res) => {
  if (req.recruitment.status !== 'approved') return res.status(404).json({ message: '合作协议尚未归档' });
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(400).json({ message: '协议编号无效' });
  const file = req.recruitment.signedAgreements?.id(req.params.fileId);
  if (!file) return res.status(404).json({ message: '协议不存在' });
  const result = await files.stream(file.key);
  res.set({ 'Content-Type': file.mimeType, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(files.normalizeName(file.name))}` });
  result.stream.on('error', () => res.destroy()).pipe(res);
});
module.exports = { router, newAccess };
