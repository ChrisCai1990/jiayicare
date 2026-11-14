const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');
const Admin = require('../models/Admin');
const MarketPartner = require('../models/MarketPartner');
const Team = require('../models/Team');
const MedicalExpert = require('../models/MedicalExpert');
const ExpertRecruitment = require('../models/ExpertRecruitment');
const CooperationAgreement = require('../models/CooperationAgreement');
const ProfessionalTeam = require('../models/CooperationProfessionalTeam');
const files = require('../utils/expertCertificates');

const adminRouter = express.Router();
const staffRouter = express.Router();
const marketRouter = express.Router();
const id = value => String(value?._id || value || '');
const valid = value => mongoose.isValidObjectId(value);
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const safe = row => ({ id: id(row._id), subjectType: row.subjectType, subjectId: id(row.subjectId),
  title: row.title, signedDate: row.signedDate, effectiveAt: row.effectiveAt, expiresAt: row.expiresAt,
  name: files.normalizeName(row.name), archivedAt: row.archivedAt });
const signedDateValid = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value && value <= today;
};
const dateOrNull = value => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
};
const subjectModel = { staff: Admin, marketPartner: MarketPartner, professionalTeam: ProfessionalTeam };

async function subject(tenantId, type, subjectId) {
  if (!subjectModel[type] || !valid(subjectId)) return null;
  return subjectModel[type].findOne({ _id: subjectId, tenantId }).select('_id name status staffStatus leaderStaffId authorizedRepresentativeStaffId representativeVerifiedAt creditCode').lean();
}

async function streamAgreement(res, file) {
  const result = await files.stream(file.key);
  res.set({ 'Content-Type': file.mimeType, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store, private', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(files.normalizeName(file.name))}` });
  result.stream.on('error', () => res.destroy()).pipe(res);
}

adminRouter.use(adminAuth, (req, res, next) => req.admin.role === 'superadmin'
  ? next() : fail(res, 403, '仅机构超级管理员可归档合作协议'));
adminRouter.get('/subjects', async (req, res) => {
  const type = String(req.query.type || 'staff');
  if (!subjectModel[type]) return fail(res, 400, '主体类型无效');
  const q = String(req.query.q || '').trim().slice(0, 60);
  const filter = { tenantId: req.admin.tenantId };
  if (q) filter.name = { $regex: [...q].map(ch => '\\.^$*+?()[]{}|'.includes(ch) ? `\\${ch}` : ch).join(''), $options: 'i' };
  const rows = await subjectModel[type].find(filter).select('_id name role phone status staffStatus creditCode')
    .sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: rows.map(row => ({ id: id(row._id), name: row.name,
    detail: type === 'staff' ? `${row.role || ''} · ${row.phone || ''}` : type === 'marketPartner' ? row.phone || '' : row.creditCode || '' })) });
});

async function validateStaffIds(tenantId, leader, members) {
  const ids = [...new Set([leader, ...members].map(id))];
  if (!ids.length || ids.some(value => !valid(value))) return false;
  const count = await Admin.countDocuments({ tenantId, _id: { $in: ids }, staffStatus: 'active' });
  return count === ids.length;
}
adminRouter.post('/teams', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 160);
  const creditCode = String(req.body?.creditCode || '').trim().slice(0, 30);
  const leader = req.body?.leaderStaffId;
  const members = Array.isArray(req.body?.memberStaffIds) ? req.body.memberStaffIds.slice(0, 100) : [];
  const representative = req.body?.authorizedRepresentativeStaffId || null;
  if (!name || !valid(leader) || (representative && !valid(representative))
      || !await validateStaffIds(req.admin.tenantId, leader, [...members, ...(representative ? [representative] : [])]))
    return fail(res, 400, '请核对团队名称、负责人、签约代表和成员');
  if (representative && req.body?.representativeConfirmed !== true)
    return fail(res, 400, '请先核验团队协议代表的授权');
  const row = await ProfessionalTeam.create({ tenantId: req.admin.tenantId, name, creditCode,
    leaderStaffId: leader, authorizedRepresentativeStaffId: representative,
    representativeVerifiedAt: representative ? new Date() : null,
    representativeVerifiedBy: representative ? req.admin._id : null,
    memberStaffIds: [...new Set(members.map(id).filter(value => value !== id(leader)))] });
  res.status(201).json({ success: true, data: { id: id(row), name: row.name } });
});
adminRouter.get('/teams/:id', async (req, res) => {
  if (!valid(req.params.id)) return fail(res, 400, '团队编号无效');
  const row = await ProfessionalTeam.findOne({ _id: req.params.id, tenantId: req.admin.tenantId }).lean();
  if (!row) return fail(res, 404, '团队不存在');
  res.json({ success: true, data: { id: id(row), name: row.name, creditCode: row.creditCode,
    leaderStaffId: id(row.leaderStaffId), authorizedRepresentativeStaffId: id(row.authorizedRepresentativeStaffId),
    memberStaffIds: (row.memberStaffIds || []).map(id), status: row.status } });
});
adminRouter.patch('/teams/:id', async (req, res) => {
  if (!valid(req.params.id)) return fail(res, 400, '团队编号无效');
  const name = String(req.body?.name || '').trim().slice(0, 160);
  const leader = req.body?.leaderStaffId;
  const members = Array.isArray(req.body?.memberStaffIds) ? req.body.memberStaffIds.slice(0, 100) : [];
  const representative = req.body?.authorizedRepresentativeStaffId || null;
  if (!name || !valid(leader) || (representative && !valid(representative))
      || !await validateStaffIds(req.admin.tenantId, leader, [...members, ...(representative ? [representative] : [])]))
    return fail(res, 400, '请核对团队名称、负责人、签约代表和成员');
  const current = await ProfessionalTeam.findOne({ _id: req.params.id, tenantId: req.admin.tenantId });
  if (!current) return fail(res, 404, '团队不存在');
  const representativeChanged = id(current.authorizedRepresentativeStaffId) !== id(representative);
  if (representativeChanged && representative && req.body?.representativeConfirmed !== true)
    return fail(res, 400, '请先核验新的团队协议代表授权');
  const after = { name, creditCode: String(req.body?.creditCode || '').trim().slice(0, 30),
    leaderStaffId: leader, authorizedRepresentativeStaffId: representative,
    representativeVerifiedAt: representativeChanged ? (representative ? new Date() : null) : current.representativeVerifiedAt,
    representativeVerifiedBy: representativeChanged ? (representative ? req.admin._id : null) : current.representativeVerifiedBy,
    memberStaffIds: [...new Set(members.map(id).filter(value => value !== id(leader)))],
    status: req.body?.status === 'inactive' ? 'inactive' : 'active' };
  const before = { name: current.name, creditCode: current.creditCode, leaderStaffId: current.leaderStaffId,
    authorizedRepresentativeStaffId: current.authorizedRepresentativeStaffId,
    memberStaffIds: current.memberStaffIds, status: current.status };
  const row = await ProfessionalTeam.findOneAndUpdate({ _id: current._id, tenantId: req.admin.tenantId,
    updatedAt: current.updatedAt }, { $set: after, $push: { changeHistory: { at: new Date(), by: req.admin._id,
      before, after } } }, { new: true });
  if (!row) return fail(res, 409, '团队资料已变化，请刷新后重试');
  res.json({ success: true, data: { id: id(row), name: row.name } });
});

adminRouter.get('/:type/:subjectId', async (req, res) => {
  const row = await subject(req.admin.tenantId, req.params.type, req.params.subjectId);
  if (!row) return fail(res, 404, '签约主体不存在');
  const docs = await CooperationAgreement.find({ tenantId: req.admin.tenantId,
    subjectType: req.params.type, subjectId: row._id }).sort({ archivedAt: -1 }).lean();
  res.json({ success: true, data: docs.map(safe) });
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 } }).single('file');
adminRouter.post('/:type/:subjectId', (req, res, next) => upload(req, res, error => error
  ? fail(res, 400, '每次上传一个 PDF 或图片，文件不超过10MB') : next()), async (req, res) => {
  const target = await subject(req.admin.tenantId, req.params.type, req.params.subjectId);
  if (!target) return fail(res, 404, '签约主体不存在');
  if (req.params.type === 'professionalTeam' && !target.creditCode)
    return fail(res, 409, '未登记法人主体的团队请以负责人个人名义签约，不能直接归档团队主体协议');
  if (req.params.type === 'professionalTeam' && (!target.authorizedRepresentativeStaffId || !target.representativeVerifiedAt))
    return fail(res, 409, '请先登记并核验该团队协议的授权代表');
  const title = String(req.body.title || '').trim();
  const signedDate = String(req.body.signedDate || '').trim();
  const effectiveAt = dateOrNull(req.body.effectiveAt), expiresAt = dateOrNull(req.body.expiresAt);
  if (!req.file || req.body.confirmed !== 'true' || !title || title.length > 160 || !signedDateValid(signedDate)
      || effectiveAt === undefined || expiresAt === undefined || (effectiveAt && expiresAt && effectiveAt > expiresAt))
    return fail(res, 400, '请核对协议名称、签署日期、有效期及双方手签文件');
  try { files.fileType(req.file.buffer); } catch (error) { return fail(res, 400, error.message); }
  const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const duplicate = await CooperationAgreement.exists({ tenantId: req.admin.tenantId,
    subjectType: req.params.type, subjectId: target._id, sha256 });
  if (duplicate) return fail(res, 409, '该文件已经为此主体归档');
  const stored = await files.store(req.file, { tenantId: req.admin.tenantId, _id: target._id }, 'cooperation-agreements');
  try {
    const row = await CooperationAgreement.create({ tenantId: req.admin.tenantId,
      subjectType: req.params.type, subjectId: target._id, title, signedDate, effectiveAt, expiresAt,
      name: files.normalizeName(req.file.originalname).slice(0, 160), ...stored, sha256, archivedBy: req.admin._id });
    res.status(201).json({ success: true, data: safe(row) });
  } catch (error) {
    await files.remove(stored.key);
    if (error.code === 11000) return fail(res, 409, '该文件已经为此主体归档');
    throw error;
  }
});
adminRouter.get('/:type/:subjectId/:fileId', async (req, res) => {
  if (!subjectModel[req.params.type] || !valid(req.params.subjectId) || !valid(req.params.fileId)) return fail(res, 400, '协议编号无效');
  const row = await CooperationAgreement.findOne({ _id: req.params.fileId, tenantId: req.admin.tenantId,
    subjectType: req.params.type, subjectId: req.params.subjectId }).select('+key');
  if (!row) return fail(res, 404, '协议不存在');
  await streamAgreement(res, row);
});

staffRouter.use(staffAuth);
staffRouter.get('/me', async (req, res) => {
  const staff = req.staff;
  const [internalTeams, external, own, expertProfiles] = await Promise.all([
    Team.find({ tenantId: staff.tenantId, status: 'active',
      $or: [{ _id: staff.teamId || null }, { mentorId: staff._id }] }).lean(),
    ProfessionalTeam.find({ tenantId: staff.tenantId, status: 'active',
      $or: [{ leaderStaffId: staff._id }, { memberStaffIds: staff._id }, { authorizedRepresentativeStaffId: staff._id }] }).lean(),
    CooperationAgreement.find({ tenantId: staff.tenantId, subjectType: 'staff', subjectId: staff._id }).sort({ archivedAt: -1 }).lean(),
    MedicalExpert.find({ tenantId: staff.tenantId, linkedStaffId: staff._id, recruitmentId: { $ne: null } }).select('recruitmentId').lean(),
  ]);
  const profileIds = expertProfiles.map(row => row.recruitmentId);
  const recruitment = profileIds.length ? await ExpertRecruitment.find({ _id: { $in: profileIds }, tenantId: staff.tenantId,
    status: 'approved' }).lean() : [];
  const expertAgreements = recruitment.flatMap(row => (row.signedAgreements || []).map(file => ({
    id: `expert:${row._id}:${file._id}`, subjectType: 'staff', title: '专家合作协议', name: files.normalizeName(file.name),
    signedDate: file.signedDate, archivedAt: file.archivedAt,
  })));
  const representedTeams = external.filter(team => id(team.authorizedRepresentativeStaffId) === id(staff._id));
  const teamDocs = representedTeams.length ? await CooperationAgreement.find({ tenantId: staff.tenantId,
    subjectType: 'professionalTeam', subjectId: { $in: representedTeams.map(team => team._id) } }).sort({ archivedAt: -1 }).lean() : [];
  const internalPeople = internalTeams.length ? await Admin.find({ tenantId: staff.tenantId,
    teamId: { $in: internalTeams.map(team => team._id) }, staffStatus: 'active' })
    .select('_id name role title department teamId').lean() : [];
  const externalIds = external.flatMap(team => [team.leaderStaffId, ...(team.memberStaffIds || [])]);
  const externalPeople = externalIds.length ? await Admin.find({ tenantId: staff.tenantId,
    _id: { $in: externalIds }, staffStatus: 'active' }).select('_id name role title department staffStatus').lean() : [];
  const byId = new Map(externalPeople.map(row => [id(row), row]));
  const person = row => ({ id: id(row), name: row.name, role: row.role, title: row.title, department: row.department });
  const teams = [
    ...internalTeams.map(team => ({ id: id(team), name: team.name, type: 'internal',
      leader: id(team.mentorId) === id(staff._id),
      members: id(team.mentorId) === id(staff._id)
        ? internalPeople.filter(row => id(row.teamId) === id(team)).map(person) : [] })),
    ...external.map(team => ({ id: id(team), name: team.name, type: 'professional', leader: id(team.leaderStaffId) === id(staff._id),
      members: id(team.leaderStaffId) === id(staff._id)
        ? [team.leaderStaffId, ...(team.memberStaffIds || [])].map(value => byId.get(id(value))).filter(Boolean).map(person) : [] })),
  ];
  res.set('Cache-Control', 'no-store, private');
  res.json({ success: true, data: { profile: { name: staff.name, role: staff.role, title: staff.title,
    department: staff.department, phone: staff.phone }, agreements: [...own.map(safe), ...expertAgreements, ...teamDocs.map(safe)], teams } });
});
staffRouter.get('/files/expert/:recruitmentId/:fileId', async (req, res) => {
  if (!valid(req.params.recruitmentId) || !valid(req.params.fileId)) return fail(res, 400, '协议编号无效');
  const profile = await MedicalExpert.findOne({ tenantId: req.staff.tenantId, linkedStaffId: req.staff._id,
    recruitmentId: req.params.recruitmentId }).select('_id').lean();
  if (!profile) return fail(res, 404, '协议不存在');
  const row = await ExpertRecruitment.findOne({ _id: req.params.recruitmentId, tenantId: req.staff.tenantId,
    status: 'approved' }).select('+signedAgreements.key');
  const file = row?.signedAgreements?.id(req.params.fileId);
  if (!file) return fail(res, 404, '协议不存在');
  await streamAgreement(res, file);
});
staffRouter.get('/files/:fileId', async (req, res) => {
  if (!valid(req.params.fileId)) return fail(res, 400, '协议编号无效');
  const row = await CooperationAgreement.findOne({ _id: req.params.fileId, tenantId: req.staff.tenantId,
    $or: [{ subjectType: 'staff', subjectId: req.staff._id },
      { subjectType: 'professionalTeam', subjectId: { $in: (await ProfessionalTeam.find({ tenantId: req.staff.tenantId,
        authorizedRepresentativeStaffId: req.staff._id, status: 'active' }).select('_id').lean()).map(team => team._id) } }] }).select('+key');
  if (!row) return fail(res, 404, '协议不存在');
  await streamAgreement(res, row);
});

marketRouter.get('/me', async (req, res) => {
  const partner = req.marketPartner;
  const agreements = await CooperationAgreement.find({ tenantId: partner.tenantId,
    subjectType: 'marketPartner', subjectId: partner._id }).sort({ archivedAt: -1 }).lean();
  res.json({ success: true, data: { profile: { name: partner.name, productLine: partner.productLine,
    status: partner.status, contractReference: partner.contractReference }, agreements: agreements.map(safe) } });
});
marketRouter.get('/files/:fileId', async (req, res) => {
  if (!valid(req.params.fileId)) return fail(res, 400, '协议编号无效');
  const row = await CooperationAgreement.findOne({ _id: req.params.fileId, tenantId: req.marketPartner.tenantId,
    subjectType: 'marketPartner', subjectId: req.marketPartner._id }).select('+key');
  if (!row) return fail(res, 404, '协议不存在');
  await streamAgreement(res, row);
});

module.exports = { adminRouter, staffRouter, marketRouter };
