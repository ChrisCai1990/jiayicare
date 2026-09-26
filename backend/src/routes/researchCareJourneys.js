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
const { deriveJourneySnapshot } = require('../utils/researchCareJourney');

router.use(adminAuth);
router.use((req, res, next) => req.admin.role === 'superadmin' && req.admin.staffStatus !== 'inactive'
  ? next() : res.status(403).json({ message: '仅机构超级管理员可管理研究队列' }));

const STUDY = 'wonca_2027';
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const participantCode = (patientId) => `P-${crypto.createHmac('sha256', process.env.RESEARCH_PSEUDONYM_SECRET || process.env.JWT_SECRET)
  .update(`${STUDY}:${patientId}`).digest('hex').slice(0, 10).toUpperCase()}`;
const researchNumber = () => `WONCA-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

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
    const data = await Promise.all(rows.map(async row => ({ ...row, participantCode: participantCode(row.patientId), snapshot: await snapshotFor(row.patientId, year) })));
    res.set('Cache-Control', 'no-store').json({ data, year });
  } catch (error) { next(error); }
});

router.post('/journeys', async (req, res, next) => {
  try {
    const patientId = req.body.patientId;
    if (!mongoose.isValidObjectId(patientId)) return res.status(400).json({ message: '客户标识无效' });
    const governanceBasis = req.body.governanceBasis;
    const governanceReference = clean(req.body.governanceReference, 200);
    const authorizationReference = clean(req.body.authorizationReference, 200);
    if (!['ethics_approved', 'quality_improvement'].includes(governanceBasis) || !governanceReference || !authorizationReference || req.body.governanceConfirmed !== true || req.body.authorizationConfirmed !== true) return res.status(400).json({ message: '请先核验并填写研究治理依据与数据使用授权记录' });
    const patient = await User.findById(patientId).select('_id isDeleted');
    if (!patient || patient.isDeleted) return res.status(404).json({ message: '客户不存在或已归档' });
    const eligible = await Report.exists({ user: patientId, aiStatus: 'reviewed', audit_status: 'audited', 'familyDoctorAudit.status': 'audited' });
    if (!eligible) return res.status(400).json({ message: '该会员尚无满足方案纳入条件的已完成专业审核报告' });
    const verifiedAt = new Date();
    const row = await Journey.create({ studyCode: STUDY, patientId, researchNumber: researchNumber(), governanceBasis, governanceReference, authorizationReference, governanceVerifiedAt: verifiedAt, authorizationVerifiedAt: verifiedAt, inclusionNote: clean(req.body.inclusionNote, 1000), enrolledBy: req.admin._id });
    res.status(201).json({ success: true, data: row });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: '该客户已在 WONCA 研究队列中' }); next(error); }
});

module.exports = router;
