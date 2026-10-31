const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const { runWithoutTenantScope } = require('../utils/tenantScope');
const ExpertRecruitment = require('../models/ExpertRecruitment');
const ExpertRecruitmentLink = require('../models/ExpertRecruitmentLink');
const MedicalExpert = require('../models/MedicalExpert');
const MedicalDepartment = require('../models/MedicalDepartment');
const MedicalInstitution = require('../models/MedicalInstitution');
const Admin = require('../models/Admin');

const router = express.Router();
const text = (value, max = 500) => String(value || '').trim().slice(0, max);
const same = (left, right) => Boolean(text(left)) && text(left).replace(/\s+/g, '') === text(right).replace(/\s+/g, '');
const list = (value, max = 10) => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[、,，;；\n]/)).map(x => text(x, 100)).filter(Boolean))].slice(0, max);
const money = value => value === '' || value === null || value === undefined ? null : Number(value);
const nonnegative = value => value === null || (Number.isFinite(value) && value >= 0 && value <= 100000);
const tokenHash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
const adminAllowed = req => ['superadmin', 'manager'].includes(req.admin?.role);
const fail = (res, code, message) => res.status(code).json({ success: false, message });

function submissionFromBody(body = {}) {
  const name = text(body.name, 80), phone = text(body.phone, 30);
  const singleConsultation = body.singleConsultation === true, mdt = body.mdt === true;
  if (!name || !/^1\d{10}$/.test(phone) || (!singleConsultation && !mdt))
    return { error: '请填写姓名、有效手机号和至少一种合作服务' };
  if (body.privacyAcknowledged !== true) return { error: '请先阅读并确认问卷资料使用说明' };
  const singleExpectedFee = money(body.singleExpectedFee), mdtExpectedFee = money(body.mdtExpectedFee);
  if (![singleExpectedFee, mdtExpectedFee].every(nonnegative) || (singleConsultation && singleExpectedFee === null) || (mdt && mdtExpectedFee === null))
    return { error: '请填写所选服务的每单预期报酬' };
  return { response: {
    name, phone, institutionName: text(body.institutionName, 150), departmentName: text(body.departmentName, 150),
    title: text(body.title, 100), profession: text(body.profession, 60), registrationScope: text(body.registrationScope, 500),
    experienceYears: Math.max(0, Math.min(80, Number(body.experienceYears) || 0)),
    expertise: list(body.expertise), unsuitableTopics: text(body.unsuitableTopics, 1000),
    singleConsultation, mdt, mdtLead: mdt && body.mdtLead === true,
    singleExpectedFee, mdtExpectedFee, feeTaxBasis: ['pre_tax', 'after_tax', 'undecided'].includes(body.feeTaxBasis) ? body.feeTaxBasis : 'undecided',
    feeIncludes: list(body.feeIncludes, 6), extraFeeRule: text(body.extraFeeRule, 500),
    preparationMinutes: Math.max(0, Math.min(240, Number(body.preparationMinutes) || 0)), materialLimit: text(body.materialLimit, 200),
    replyHours: Math.max(0, Math.min(168, Number(body.replyHours) || 0)), weeklyAvailability: text(body.weeklyAvailability, 1000),
    weeklyCapacity: Math.max(0, Math.min(100, Number(body.weeklyCapacity) || 0)),
    minimumNoticeHours: Math.max(0, Math.min(720, Number(body.minimumNoticeHours) || 0)),
    scheduleMaintenance: ['self', 'assistant', 'undecided'].includes(body.scheduleMaintenance) ? body.scheduleMaintenance : 'undecided',
    recordingPreference: ['recording', 'transcript_only', 'neither', 'discuss'].includes(body.recordingPreference) ? body.recordingPreference : 'discuss',
    cooperationNotes: text(body.cooperationNotes, 1000), privacyAcknowledged: true,
  } };
}

// The public link is a single-use capability. A lookup never returns the invited person's details.
router.get('/public/:token', async (req, res) => {
  const record = await runWithoutTenantScope(() => ExpertRecruitment.findOne({ tokenHash: tokenHash(req.params.token) }).select('status expiresAt').lean());
  if (!record || record.status === 'revoked' || record.expiresAt <= new Date()) return fail(res, 404, '问卷链接已失效');
  res.json({ success: true, data: { status: record.status, expiresAt: record.expiresAt } });
});

router.post('/public/:token', async (req, res) => {
  const { error, response } = submissionFromBody(req.body);
  if (error) return fail(res, 400, error);
  const updated = await runWithoutTenantScope(() => ExpertRecruitment.findOneAndUpdate(
    { tokenHash: tokenHash(req.params.token), status: 'invited', expiresAt: { $gt: new Date() },
      $or: [{ candidateName: '' }, { candidateName: response.name }] },
    { $set: { response, status: 'submitted', submittedAt: new Date() } }, { new: true },
  ).select('_id'));
  if (!updated) return fail(res, 409, '问卷链接已提交、失效或填写人姓名与邀请不符');
  res.status(201).json({ success: true, data: { submitted: true } });
});

// Reusable partner link: many experts may respond; each phone can submit once per link.
router.get('/public-link/:token', async (req, res) => {
  const link = await runWithoutTenantScope(() => ExpertRecruitmentLink.findOne({ tokenHash: tokenHash(req.params.token), status: 'active' }).select('_id').lean());
  if (!link) return fail(res, 404, '问卷链接已失效');
  res.json({ success: true, data: { status: 'open' } });
});

router.post('/public-link/:token', async (req, res) => {
  const { error, response } = submissionFromBody(req.body);
  if (error) return fail(res, 400, error);
  const link = await runWithoutTenantScope(() => ExpertRecruitmentLink.findOne({ tokenHash: tokenHash(req.params.token), status: 'active' }).select('_id tenantId partnerName specialtyTeam createdBy').lean());
  if (!link) return fail(res, 404, '问卷链接已失效');
  try {
    const submissionId = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`expert-recruitment:${link._id}:${response.phone}`).digest('hex').slice(0, 24));
    await runWithoutTenantScope(() => ExpertRecruitment.create({
      _id: submissionId, tenantId: link.tenantId, linkId: link._id, tokenHash: tokenHash(crypto.randomBytes(32).toString('hex')),
      expiresAt: new Date(), status: 'submitted', partnerName: link.partnerName, specialtyTeam: link.specialtyTeam,
      candidateName: response.name, createdBy: link.createdBy, submittedAt: new Date(), response,
    }));
  } catch (err) {
    if (err.code === 11000) return fail(res, 409, '该手机号已通过此链接提交，请勿重复填写');
    throw err;
  }
  res.status(201).json({ success: true, data: { submitted: true } });
});

router.get('/admin/links', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家招募操作权限');
  const rows = await ExpertRecruitmentLink.find().select('+token').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: rows });
});

router.post('/admin/links', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家招募操作权限');
  const partnerName = text(req.body?.partnerName, 80), specialtyTeam = text(req.body?.specialtyTeam, 100);
  if (!partnerName || !specialtyTeam) return fail(res, 400, '请填写专科合伙人与专科团队');
  const token = crypto.randomBytes(24).toString('base64url');
  const row = await ExpertRecruitmentLink.create({ token, tokenHash: tokenHash(token), partnerName, specialtyTeam, createdBy: req.admin._id });
  res.status(201).json({ success: true, data: { id: row._id, token } });
});

router.post('/admin/links/:id/revoke', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家招募操作权限');
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, '链接编号无效');
  const row = await ExpertRecruitmentLink.findOneAndUpdate({ _id: req.params.id, status: 'active' },
    { $set: { status: 'revoked', revokedBy: req.admin._id, revokedAt: new Date() } }, { new: true });
  if (!row) return fail(res, 409, '链接不存在或已停用');
  res.json({ success: true, data: { id: row._id, status: row.status } });
});

router.get('/admin', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家招募审核权限');
  const rows = await ExpertRecruitment.find().select('-tokenHash').sort({ createdAt: -1 }).limit(300).lean();
  res.json({ success: true, data: rows });
});

router.post('/admin', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家招募操作权限');
  const partnerName = text(req.body?.partnerName, 80), specialtyTeam = text(req.body?.specialtyTeam, 100);
  if (!partnerName || !specialtyTeam) return fail(res, 400, '请填写专科合伙人与专科团队');
  const token = crypto.randomBytes(24).toString('base64url');
  const row = await ExpertRecruitment.create({
    tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    partnerName, specialtyTeam, candidateName: text(req.body?.candidateName, 80), createdBy: req.admin._id,
  });
  res.status(201).json({ success: true, data: { id: row._id, token, expiresAt: row.expiresAt } });
});

router.patch('/admin/:id/screening', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家招募审核权限');
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, '记录编号无效');
  const row = await ExpertRecruitment.findOne({ _id: req.params.id, status: 'submitted' });
  if (!row) return fail(res, 409, '仅已提交且未结案的问卷可审核');
  const values = ['professional', 'communication', 'ethics'].map(k => req.body?.[k]);
  if (values.some(v => !['pass', 'pending', 'fail'].includes(v))) return fail(res, 400, '请分别记录专业、沟通、品德的初筛结果');
  if (values.every(v => v === 'pass') && req.body.qualificationVerified === true && !text(req.body.evidence))
    return fail(res, 400, '请记录资格及三项准入核验依据');
  row.screening = {
    qualificationVerified: req.body.qualificationVerified === true,
    professional: values[0], communication: values[1], ethics: values[2], evidence: text(req.body.evidence, 2000),
    reviewedBy: req.admin._id, reviewedAt: new Date(),
  };
  await row.save();
  res.json({ success: true, data: row });
});

router.post('/admin/:id/approve', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家入库审批权限');
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, '记录编号无效');
  const row = await ExpertRecruitment.findOne({ _id: req.params.id, status: 'submitted' });
  if (!row) return fail(res, 409, '问卷未提交或已结案');
  const screening = row.screening || {};
  if (!screening.qualificationVerified || ['professional', 'communication', 'ethics'].some(k => screening[k] !== 'pass'))
    return fail(res, 409, '资格核验与专业、沟通、品德三项均通过后才可入库');
  if (row.response.registrationScope && !same(row.response.registrationScope, row.response.departmentName))
    return fail(res, 409, '问卷的执业范围与填写科室不一致，请先核实');
  const institutionId = req.body?.institutionId, departmentId = req.body?.departmentId;
  if (!mongoose.isValidObjectId(institutionId) || !mongoose.isValidObjectId(departmentId)) return fail(res, 400, '问卷医院或科室未能与医疗资源库唯一匹配');
  const [institution, department] = await Promise.all([
    MedicalInstitution.findOne({ _id: institutionId, status: 'active' }).select('_id name aliases').lean(),
    MedicalDepartment.findOne({ _id: departmentId, institutionId, status: 'active' }).select('_id name').lean(),
  ]);
  if (!institution || !department || ![institution.name, ...(institution.aliases || [])].some(name => same(name, row.response.institutionName)) || !same(department.name, row.response.departmentName))
    return fail(res, 409, '关联医院、科室与问卷填写信息不一致，请先核实');
  const [institutionChoices, departmentChoices] = await Promise.all([
    MedicalInstitution.find({ status: 'active' }).select('_id name aliases').lean(),
    MedicalDepartment.find({ institutionId, status: 'active' }).select('_id name').lean(),
  ]);
  if (institutionChoices.filter(item => [item.name, ...(item.aliases || [])].some(name => same(name, row.response.institutionName))).length !== 1 ||
      departmentChoices.filter(item => same(item.name, row.response.departmentName)).length !== 1)
    return fail(res, 409, '问卷医院或科室匹配到多条资源，请先核实');
  const singleFee = money(req.body?.singleFee), mdtFee = money(req.body?.mdtFee);
  if (![singleFee, mdtFee].every(nonnegative) || (row.response.singleConsultation && singleFee === null) || (row.response.mdt && mdtFee === null))
    return fail(res, 400, '请填写已谈妥的服务报酬');
  const linkedStaffId = req.body?.linkedStaffId || null;
  if (!mongoose.isValidObjectId(linkedStaffId)) return fail(res, 400, '问卷姓名和手机号未能与医护端账号唯一匹配');
  const staff = await Admin.findOne({ _id: linkedStaffId, staffStatus: { $ne: 'inactive' },
    role: { $in: ['specialist', 'familyDoctor', 'nutritionist', 'rehabSpecialist', 'psychologist', 'tcmDoctor'] } }).select('_id tenantId name phone').lean();
  if (!staff || String(staff.tenantId) !== String(req.admin.tenantId)) return fail(res, 400, '专家账号无效或不属于本机构');
  if (!same(staff.name, row.response.name) || !staff.phone || staff.phone !== row.response.phone)
    return fail(res, 409, '专家账号姓名或手机号与问卷不一致，请先核实');
  const staffChoices = await Admin.find({ phone: row.response.phone, staffStatus: { $ne: 'inactive' },
    role: { $in: ['specialist', 'familyDoctor', 'nutritionist', 'rehabSpecialist', 'psychologist', 'tcmDoctor'] } }).select('_id name').lean();
  if (staffChoices.filter(item => same(item.name, row.response.name)).length !== 1)
    return fail(res, 409, '问卷身份匹配到多位医护端人员，请先核实');
  const existingLink = await MedicalExpert.findOne({ linkedStaffId, _id: { $ne: row.expertProfileId || row._id } }).select('_id').lean();
  if (existingLink) return fail(res, 409, '该医护端账号已关联另一位专家');
  const profile = await MedicalExpert.findOneAndUpdate({ recruitmentId: row._id }, { $setOnInsert: {
    name: row.response.name, title: row.response.title, institutionId, departmentId,
    expertise: row.response.expertise, introduction: '', serviceModes: [
      ...(row.response.singleConsultation ? ['single_consultation'] : []), ...(row.response.mdt ? ['mdt'] : []),
    ], linkedStaffId, teamEligible: true, singleConsultationFee: singleFee, mdtFee,
    recruitmentId: row._id, status: 'active',
  } }, { upsert: true, new: true, runValidators: true });
  row.agreement = { institutionId, departmentId, singleFee, mdtFee, note: text(req.body?.note, 1000) };
  row.expertProfileId = profile._id;
  row.status = 'approved';
  await row.save();
  await Admin.updateOne({ _id: linkedStaffId }, { $set: { expertProfileId: profile._id } });
  res.json({ success: true, data: { id: row._id, expertProfileId: profile._id } });
});

router.post('/admin/:id/reject', adminAuth, async (req, res) => {
  if (!adminAllowed(req)) return fail(res, 403, '无专家招募审核权限');
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, '记录编号无效');
  const row = await ExpertRecruitment.findOneAndUpdate({ _id: req.params.id, status: 'submitted' },
    { $set: { status: 'rejected', 'screening.evidence': text(req.body?.reason, 1000),
      'screening.reviewedBy': req.admin._id, 'screening.reviewedAt': new Date() } }, { new: true });
  if (!row) return fail(res, 409, '问卷未提交或已结案');
  res.json({ success: true, data: row });
});

module.exports = router;
