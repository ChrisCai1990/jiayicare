const router = require('express').Router();
const mongoose = require('mongoose');
const Care = require('../models/PsychologyCare');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Audit = require('../models/PsychologyAudit');
const { canRead } = require('../utils/psychologyAccess');
router.use(require('../middleware/staffAuth'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['familyDoctor', 'psychologist'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅负责顾问和心理咨询师可访问' });
  next();
});
router.get('/', async (req, res) => {
  const filter = req.staff.role === 'familyDoctor' ? { advisorId: req.staff._id } : { psychologistId: req.staff._id, status: { $ne: 'ended' } };
  const rows = await Care.find(filter).select('-sessions -sharedBackground -history').lean();
  const patients = await User.find({ _id: { $in: rows.map(x => x.patientId) } }).select('name tenantId assignedFamilyDoctor isDeleted').lean();
  const data = rows.filter(x => canRead(req.staff, x, patients.find(p => String(p._id) === String(x.patientId)))).map(x => ({ ...x, patientName: patients.find(p => String(p._id) === String(x.patientId)).name }));
  res.json({ success: true, data });
});
router.get('/options', async (req, res) => {
  if (req.staff.role !== 'familyDoctor') return res.status(403).json({ success: false });
  const [patients, psychologists] = await Promise.all([
    User.find({ assignedFamilyDoctor: req.staff._id, isDeleted: { $ne: true } }).select('name').lean(),
    Admin.find({ role: 'psychologist', staffStatus: { $ne: 'inactive' } }).select('name').lean(),
  ]);
  res.json({ success: true, data: { patients, psychologists } });
});
router.post('/', async (req, res) => {
  if (req.staff.role !== 'familyDoctor') return res.status(403).json({ success: false });
  const { patientId, psychologistId, sharedBackground } = req.body;
  if (![patientId, psychologistId].every(mongoose.isValidObjectId) || typeof sharedBackground !== 'string' || !sharedBackground.trim() || sharedBackground.length > 20000) return res.status(400).json({ success: false, message: '请选择客户、咨询师并填写共享背景' });
  const patient = await User.findOne({ _id: patientId, assignedFamilyDoctor: req.staff._id, isDeleted: { $ne: true } });
  const psychologist = await Admin.findOne({ _id: psychologistId, role: 'psychologist', staffStatus: { $ne: 'inactive' } });
  if (!patient || !psychologist) return res.status(403).json({ success: false, message: '客户或咨询师不在可指派范围内' });
  try {
    const data = await Care.create({ tenantId: req.staff.tenantId, patientId, advisorId: req.staff._id, psychologistId, sharedBackground: sharedBackground.trim(), history: [{ action: 'created', actorId: req.staff._id }] });
    res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: '该客户已有心理咨询档案，请打开原档案' });
    throw error;
  }
});
// New assigned advisor explicitly accepts responsibility before accessing old notes.
router.post('/takeover', async (req, res) => {
  if (req.staff.role !== 'familyDoctor') return res.status(403).json({ success: false });
  if (!mongoose.isValidObjectId(req.body.patientId) || typeof req.body.reason !== 'string' || !req.body.reason.trim() || req.body.reason.length > 1000) return res.status(400).json({ success: false, message: '请选择客户并填写接管原因' });
  const patient = await User.findOne({ _id: req.body.patientId, assignedFamilyDoctor: req.staff._id, isDeleted: { $ne: true } });
  const care = patient && await Care.findOne({ patientId: patient._id });
  if (!care) return res.status(404).json({ success: false, message: '没有可接管的档案' });
  if (String(care.advisorId) === String(req.staff._id)) return res.status(409).json({ success: false, message: '您已是负责顾问' });
  care.history.push({ action: 'advisor_takeover', actorId: req.staff._id, previousPersonId: care.advisorId, nextPersonId: req.staff._id, reason: req.body.reason.trim() });
  care.advisorId = req.staff._id;
  try { await care.save(); } catch (error) { if (error.name === 'VersionError') return res.status(409).json({ success: false, message: '档案已更新，请重试' }); throw error; }
  res.json({ success: true, data: { _id: care._id } });
});
router.use('/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false });
  const care = await Care.findById(req.params.id);
  const patient = care && await User.findById(care.patientId).select('name age gender tenantId assignedFamilyDoctor isDeleted');
  if (!canRead(req.staff, care, patient)) return res.status(404).json({ success: false, message: '档案不存在或无权访问' });
  req.care = care;
  req.carePatient = patient;
  next();
});
router.get('/:id', async (req, res) => {
  await Audit.create({ tenantId: req.staff.tenantId, careId: req.care._id, actorId: req.staff._id, action: 'read' });
  res.json({ success: true, data: { ...req.care.toObject(), patient: { name: req.carePatient.name, age: req.carePatient.age, gender: req.carePatient.gender } } });
});
router.post('/:id', async (req, res) => {
  const care = req.care;
  if (!['session', 'update', 'transfer'].includes(req.body.action)) return res.status(400).json({ success: false, message: '无效操作' });
  if (req.body.version !== care.__v) return res.status(409).json({ success: false, message: '档案已更新，请刷新后重试' });
  if (req.body.action === 'session') {
    if (req.staff.role !== 'psychologist' || care.status !== 'active') return res.status(403).json({ success: false, message: '仅进行中的咨询师可以提交记录' });
    const { content, date, nextDate } = req.body;
    if (typeof content !== 'string' || !content.trim() || content.length > 30000 || !date || !Number.isFinite(Date.parse(date)) || (nextDate && !Number.isFinite(Date.parse(nextDate)))) return res.status(400).json({ success: false, message: '请填写有效日期和咨询记录' });
    care.sessions.push({ content: content.trim(), date, nextDate: nextDate || null, authorId: req.staff._id });
  } else if (req.body.action === 'transfer') {
    if (req.staff.role !== 'familyDoctor' || care.status === 'ended') return res.status(403).json({ success: false });
    if (!mongoose.isValidObjectId(req.body.psychologistId) || typeof req.body.reason !== 'string' || !req.body.reason.trim() || req.body.reason.length > 1000) return res.status(400).json({ success: false, message: '请选择咨询师并填写交接原因' });
    const nextPerson = await Admin.findOne({ _id: req.body.psychologistId, role: 'psychologist', staffStatus: { $ne: 'inactive' } });
    if (!nextPerson || String(nextPerson._id) === String(care.psychologistId)) return res.status(400).json({ success: false, message: '请选择其他有效咨询师' });
    care.history.push({ action: 'psychologist_transfer', actorId: req.staff._id, previousPersonId: care.psychologistId, nextPersonId: nextPerson._id, reason: req.body.reason.trim() });
    care.psychologistId = nextPerson._id;
  } else {
    if (req.staff.role !== 'familyDoctor') return res.status(403).json({ success: false });
    if (!['active', 'paused', 'ended'].includes(req.body.status)) return res.status(400).json({ success: false });
    care.status = req.body.status;
    if (req.body.sharedBackground !== undefined) {
      if (typeof req.body.sharedBackground !== 'string' || !req.body.sharedBackground.trim() || req.body.sharedBackground.length > 20000) return res.status(400).json({ success: false, message: '共享背景不能为空且不能超过20000字' });
      care.sharedBackground = req.body.sharedBackground.trim();
    }
  }
  if (req.body.action !== 'transfer') care.history.push({ action: req.body.action === 'session' ? 'session' : care.status, actorId: req.staff._id });
  try { await care.save(); } catch (error) { if (error.name === 'VersionError') return res.status(409).json({ success: false, message: '档案已更新，请刷新' }); throw error; }
  res.json({ success: true, data: care });
});
module.exports = router;
