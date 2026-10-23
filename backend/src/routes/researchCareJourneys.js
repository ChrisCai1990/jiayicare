const router = require('express').Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');
const Report = require('../models/MedicalReport');
const Draft = require('../models/ReportFollowUpDraft');
const AnnualPlan = require('../models/AnnualPlan');
const FollowUp = require('../models/FollowUp');
const Journey = require('../models/ResearchCareJourney');
const Candidate = require('../models/ResearchCandidate');
const StudySetting = require('../models/ResearchStudySetting');
const { deriveJourneySnapshot } = require('../utils/researchCareJourney');
const { isAnnualCustomer } = require('../utils/researchAnnualCustomer');

router.use(adminAuth);
router.use((req, res, next) => req.admin.role === 'superadmin' && req.admin.staffStatus !== 'inactive'
  ? next() : res.status(403).json({ message: '仅机构超级管理员可管理研究队列' }));

const STUDY = 'wonca_2027';
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const participantCode = (patientId) => `P-${crypto.createHmac('sha256', process.env.RESEARCH_PSEUDONYM_SECRET || process.env.JWT_SECRET)
  .update(`${STUDY}:${patientId}`).digest('hex').slice(0, 10).toUpperCase()}`;
const researchNumber = () => `WONCA-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

router.get('/candidate-list', async (req, res, next) => {
  try {
    const rows = await Candidate.find({ studyCode: STUDY, status: 'active' })
      .sort({ addedAt: 1 }).populate('patientId', 'name phone membershipTier servicePackage clientBrand isDeleted').lean();
    const enrolled = await Journey.find({ studyCode: STUDY, patientId: { $in: rows.map(row => row.patientId?._id).filter(Boolean) } })
      .select('patientId').lean();
    const enrolledIds = new Set(enrolled.map(row => String(row.patientId)));
    const data = await Promise.all(rows.map(async row => ({
      _id: row._id, patientId: row.patientId?._id,
      name: row.patientId?.name || '客户档案已移除',
      phone: row.patientId?.phone || '',
      servicePackage: row.patientId?.servicePackage || '',
      isDeleted: !row.patientId || row.patientId.isDeleted === true,
      enrolled: enrolledIds.has(String(row.patientId?._id)),
      addedAt: row.addedAt,
      isAnnual: row.patientId && !row.patientId.isDeleted ? await isAnnualCustomer(row.patientId) : false,
    })));
    res.set('Cache-Control', 'no-store').json({ data });
  } catch (error) { next(error); }
});

router.post('/candidate-list', async (req, res, next) => {
  try {
    const patientId = req.body.patientId;
    if (!mongoose.isValidObjectId(patientId)) return res.status(400).json({ message: '客户标识无效' });
    const patient = await User.findById(patientId).select('_id isDeleted membershipTier servicePackage clientBrand');
    if (!patient || patient.isDeleted) return res.status(404).json({ message: '客户不存在或已归档' });
    const now = new Date();
    let row = await Candidate.findOne({ studyCode: STUDY, patientId });
    if (row?.status === 'active') return res.status(409).json({ message: '该客户已在候选名单中' });
    if (row) {
      row.status = 'active';
      row.addedBy = req.admin._id;
      row.addedAt = now;
      row.removedBy = null;
      row.removedAt = null;
      row.history.push({ action: 'add', by: req.admin._id, at: now });
      await row.save();
    } else {
      row = await Candidate.create({ studyCode: STUDY, patientId, addedBy: req.admin._id, addedAt: now,
        history: [{ action: 'add', by: req.admin._id, at: now }] });
    }
    res.status(201).json({ success: true, data: { _id: row._id } });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: '该客户已在候选名单中' }); next(error); }
});

router.delete('/candidate-list/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: '候选记录无效' });
    const row = await Candidate.findOne({ _id: req.params.id, studyCode: STUDY, status: 'active' });
    if (!row) return res.status(404).json({ message: '候选记录不存在' });
    if (await Journey.exists({ studyCode: STUDY, patientId: row.patientId })) return res.status(409).json({ message: '该客户已正式纳入，不能从候选名单移除' });
    const now = new Date();
    row.status = 'removed';
    row.removedBy = req.admin._id;
    row.removedAt = now;
    row.history.push({ action: 'remove', by: req.admin._id, at: now });
    await row.save();
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.get('/setting', async (req, res, next) => {
  try {
    const setting = await StudySetting.findOne({ studyCode: STUDY }).select('governanceReference verifiedAt').lean();
    res.set('Cache-Control', 'no-store').json({ data: setting });
  } catch (error) { next(error); }
});

router.put('/setting', async (req, res, next) => {
  try {
    const governanceReference = clean(req.body.governanceReference, 200);
    if (!governanceReference || req.body.governanceConfirmed !== true) return res.status(400).json({ message: '请填写并核验本项目的机构依据记录' });
    const existing = await StudySetting.findOne({ studyCode: STUDY });
    if (existing) return res.status(409).json({ message: '项目依据已记录；如需更正，请由机构按正式流程处理' });
    const setting = await StudySetting.create({ studyCode: STUDY, governanceReference, verifiedBy: req.admin._id, verifiedAt: new Date() });
    res.status(201).json({ data: { governanceReference: setting.governanceReference, verifiedAt: setting.verifiedAt } });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: '项目依据已记录' }); next(error); }
});

router.get('/candidates', async (req, res, next) => {
  try {
    const q = clean(req.query.q, 64);
    if (q.length < 2) return res.status(400).json({ message: '请至少输入两个字符' });
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = mongoose.isValidObjectId(q)
      ? { _id: q, isDeleted: { $ne: true } }
      : { isDeleted: { $ne: true }, $or: [{ name: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped } }] };
    const users = await User.find(filter).select('_id name phone membershipTier servicePackage clientBrand').limit(12).lean();
    const existing = await Journey.find({ studyCode: STUDY, patientId: { $in: users.map(user => user._id) } }).select('patientId').lean();
    const listedRows = await Candidate.find({ studyCode: STUDY, status: 'active', patientId: { $in: users.map(user => user._id) } }).select('patientId').lean();
    const listed = new Set(listedRows.map(row => String(row.patientId)));
    const enrolled = new Set(existing.map(row => String(row.patientId)));
    const data = await Promise.all(users.map(async user => ({
      patientId: user._id,
      name: user.name,
      phone: user.phone,
      servicePackage: user.servicePackage,
      isAnnual: await isAnnualCustomer(user),
      enrolled: enrolled.has(String(user._id)),
      listed: listed.has(String(user._id)),
    })));
    res.set('Cache-Control', 'no-store').json({ data });
  } catch (error) { next(error); }
});

async function snapshotFor(patientId, year) {
  const [reports, annualPlan] = await Promise.all([
    Report.find({ user: patientId }).select('_id aiStatus audit_status reviewedAt familyDoctorAudit').sort({ createdAt: -1 }).limit(100).lean(),
    AnnualPlan.findOne({ patientId, year }).select('reviewStatus pushedAt confirmedAt').lean(),
  ]);
  const drafts = reports.length
    ? await Draft.find({ patientId, reportId: { $in: reports.map(row => row._id) } }).select('status advisorReviewedAt createdAt').sort({ createdAt: -1 }).limit(100).lean()
    : [];
  const followUps = annualPlan ? await FollowUp.find({ patientId, sourceAnnualPlanId: annualPlan._id }).select('status assignedTo date completedAt').lean() : [];
  return deriveJourneySnapshot({ reports, drafts, annualPlan, followUps });
}

router.get('/journeys', async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const rows = await Journey.find({ studyCode: STUDY }).sort({ enrolledAt: -1 }).lean();
    const data = await Promise.all(rows.map(async row => ({
      _id: row._id, researchNumber: row.researchNumber, status: row.status,
      enrolledAt: row.enrolledAt, participantCode: participantCode(row.patientId),
      snapshot: await snapshotFor(row.patientId, year),
    })));
    res.set('Cache-Control', 'no-store').json({ data, year });
  } catch (error) { next(error); }
});

router.post('/journeys', async (req, res, next) => {
  try {
    const patientId = req.body.patientId;
    if (!mongoose.isValidObjectId(patientId)) return res.status(400).json({ message: '客户标识无效' });
    const authorizationReference = clean(req.body.authorizationReference, 200);
    if (!authorizationReference || req.body.authorizationConfirmed !== true) return res.status(400).json({ message: '请填写并核验该客户的数据使用授权记录' });
    const setting = await StudySetting.findOne({ studyCode: STUDY });
    if (!setting) return res.status(400).json({ message: '请先记录本项目的机构依据' });
    const candidate = await Candidate.exists({ studyCode: STUDY, patientId, status: 'active' });
    if (!candidate) return res.status(400).json({ message: '请先将该客户加入候选名单' });
    const patient = await User.findById(patientId).select('_id isDeleted membershipTier servicePackage clientBrand');
    if (!patient || patient.isDeleted) return res.status(404).json({ message: '客户不存在或已归档' });
    if (!await isAnnualCustomer(patient)) return res.status(400).json({ message: '尚未找到年度管理分层、年度方案或年度服务包配置，请先核对客户服务包' });
    const verifiedAt = new Date();
    const row = await Journey.create({
      studyCode: STUDY, patientId, researchNumber: researchNumber(),
      governanceBasis: 'institutional_review', governanceReference: setting.governanceReference,
      authorizationReference, governanceVerifiedAt: setting.verifiedAt,
      authorizationVerifiedAt: verifiedAt, inclusionNote: clean(req.body.inclusionNote, 1000),
      enrolledBy: req.admin._id,
    });
    res.status(201).json({ success: true, data: { researchNumber: row.researchNumber } });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: '该客户已在 WONCA 研究队列中' }); next(error); }
});

module.exports = router;
