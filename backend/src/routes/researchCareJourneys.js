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

async function snapshotFor(patientId, year, end, catalog, live) {
  const { projectEvidence } = require('../utils/woncaEvidence');
  const createdAt = { $lte: end };
  const [reports, drafts, plans, decisions, reviews, prep, user, medications, problemReview] = await Promise.all([
    Report.find({ user:patientId, createdAt }).select('type documentCategory createdAt updatedAt aiStatus audit_status reviewedAt familyDoctorAudit.status checkDate date familyDoctorViewedAt advisorInterpretationConfirmedAt healthCourseDraft.status archiveOnly reportYear title screeningL2 advisorCorrection.status advisorCorrection.resubmittedAt reportItems.itemId reportItems.examDate reportItems.bodyPart reportItems.modality reportItems.name reportItems.orderName reportItems.screeningKey reportItems.screeningKeys reportItems.screeningParent reportItems.value reportItems.conclusion reportItems.diagnosis').sort({createdAt:-1}).lean(),
    Draft.find({ patientId, createdAt }).select('reportId status purpose followUpAutomation.status createdAt updatedAt advisorReviewedAt').sort({createdAt:-1}).lean(),
    AnnualPlan.find({ patientId, year, createdAt }).select('planType reviewStatus createdAt updatedAt moduleData pushedAt confirmedAt').sort({createdAt:1}).lean(),
    require('../models/AnnualManagementDecision').find({ patientId,year,createdAt }).select('sourceKey supersedes reviewedAt itemId title sourceSnapshot.item.name sourceSnapshot.items.itemId reportId symptomRecordId direction directions status createdAt updatedAt').lean(),
    require('../models/AIHealthCheckupReview').find({patientId,year,createdAt}).select('sourceVersion sourceKey itemText disposition linkedDecisionId createdAt updatedAt').lean(),
    require('../models/AnnualPlanPreparation').findOne({patientId,year}).select('screeningConfirmedAt advisorReadyConfirmedAt').lean(),
    User.findById(patientId).select('createdAt updatedAt aiHealthSummary archiveReviewSnapshotAt').lean(),
    require('../models/Medication').find({user:patientId,createdAt,sourceRecordKey:/^prescription_(manual|report_review):/}).select('sourceRecordKey aiStatus createdAt updatedAt').lean(),
    require('../models/AnnualReportProblemReview').findOne({patientId,year,createdAt}).select('updatedAt createdAt status topics.id topics.reviewed topics.decision').lean(),
  ]);
  const followUps = plans.length ? await FollowUp.find({ patientId, sourceAnnualPlanId:{ $in:plans.map(p=>p._id) },createdAt }).select('sourceAnnualPlanId date completedAt assignedTo status progressRecords.recordedAt progressRecords.consensusTopicOutcome createdAt updatedAt').lean() : [];
  const evidence=projectEvidence({user,reports,drafts,plans,tasks:followUps,decisions,reviews,prep,medications,year,end,catalog,problemReview});
  const pendingDocs = live ? await Report.find(require('../utils/reportAuditGate').pendingDoctorAuditFilter(patientId,user?.archiveReviewSnapshotAt))
    .select('documentCategory type createdAt advisorCorrection.resubmittedAt').sort({createdAt:-1}).lean() : null;
  evidence.pendingDocuments = pendingDocs?.map(r => ({
    key: String(r._id).slice(-8).toUpperCase(),
    category: require('../utils/woncaEvidence').materialCategory(r),
    reason: r.advisorCorrection?.resubmittedAt ? '退回后重新提交' : '新增资料',
  })) ?? null;
  evidence.pendingViews = evidence.pendingDocuments?.length ?? null;
  const recent = reports.slice(0,100);
  const recentIds = new Set(recent.map(r=>String(r._id)));
  const legacy = require('../utils/researchCareJourney').deriveJourneySnapshot({reports:recent,drafts:drafts.filter(d=>recentIds.has(String(d.reportId))).slice(0,100),annualPlan:plans[0],followUps:followUps.filter(f=>String(f.sourceAnnualPlanId)===String(plans[0]?._id)),now:end});
  return live ? {...legacy,evidence} : {evidence};
}

function liveStatus(row,end) {
  if(row.status==='enrolled' || row.withdrawnAt || row.lockedAt) return 'enrolled';
  return !row.updatedAt || row.updatedAt<=end ? row.status : 'unknown';
}

router.get('/journeys', async (req,res,next)=>{
  try {
    const year=Number(req.query.year) || new Date().getFullYear();
    const day=req.query.cutoff;
    const now=new Date();
    const requested=day ? new Date(day+'T23:59:59.999+08:00') : now;
    if (!Number.isInteger(year) || year<1900 || year>2200 || (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(+requested) || new Date(+requested+28800000).toISOString().slice(0,10)!==day || day>new Date(+now+28800000).toISOString().slice(0,10)))) return res.status(400).json({message:'请选择有效的观察年度和截止日'});
    const end=new Date(Math.min(+requested,+now));
    const rows=await Journey.find({studyCode:STUDY,enrolledAt:{$lte:end}}).sort({enrolledAt:-1}).lean();
    const catalog=rows.length ? await require('../utils/screeningMatch').buildAdminIndex() : [];
    const data=[];
    for(let i=0;i<rows.length;i+=4) {
      data.push(...await Promise.all(rows.slice(i,i+4).map(async row=>({
        _id:row._id,researchNumber:row.researchNumber,enrolledAt:row.enrolledAt,participantCode:participantCode(row.patientId),
        status:row.withdrawnAt && row.withdrawnAt<=end ? 'withdrawn' : row.lockedAt && row.lockedAt<=end ? 'locked' : liveStatus(row,end),
        cohort:(row.cohortHistory || []).filter(change=>change.at<=end).at(-1)?.cohort || 'unknown',
        snapshot:await snapshotFor(row.patientId,year,end,catalog,+end===+now),
      }))));
    }
    res.set('Cache-Control','no-store').json({data,year,observedAt:end});
  } catch(error){next(error);}
});

router.patch('/journeys/:id/cohort', async (req,res,next)=>{
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !['existing','new'].includes(req.body.cohort) || !['existing','new','unknown'].includes(req.body.previous)) return res.status(400).json({message:'分组无效'});
    const at=new Date();
    const row=await Journey.findOneAndUpdate({_id:req.params.id,studyCode:STUDY,status:'enrolled',cohort:req.body.previous==='unknown' ? {$in:[null,'unknown']} : req.body.previous},
      {$set:{cohort:req.body.cohort,cohortVerifiedAt:at,cohortVerifiedBy:req.admin._id},$push:{cohortHistory:{at,cohort:req.body.cohort,by:req.admin._id}}},{new:true}).select('_id');
    if (!row) return res.status(409).json({message:'分组或纳入状态已变化，请刷新'});
    res.json({success:true});
  } catch(error){next(error);}
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
