const express = require('express');
const mongoose = require('mongoose');
const customerAuth = require('../middleware/auth');
const staffAuth = require('../middleware/staffAuth');
const Group = require('../models/InAppServiceGroup');
const Message = require('../models/InAppServiceGroupMessage');
const InboxMessage = require('../models/Message');
const View = require('../models/InAppServiceGroupView');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Team = require('../models/Team');
const StaffRole = require('../models/StaffRole');
const { assignmentFields, assignedIds, canUseGroupModule, isAssignedLeader, canCustomerAccess, canStaffAccess,
  canMentorObserve, needsStaffReply, same } = require('../utils/inAppServiceGroupPolicy');

const customerRouter = express.Router();
const staffRouter = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(error => {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message });
  next(error);
});
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };
const validId = value => mongoose.isValidObjectId(value) ? value : fail('服务群标识无效', 400);
const contentOf = value => typeof value === 'string' ? value.trim() : '';

async function currentStaff(patient) {
  return Admin.find({ _id: { $in: assignedIds(patient) }, tenantId: patient.tenantId,
    staffStatus: 'active' }).select('_id name role').lean();
}
async function groupStaff(group, patient) {
  return (await currentStaff(patient)).filter(person =>
    (group.memberIds || []).some(id => same(id, person._id)));
}
async function mentorStaffIds(staff) {
  const teams = await Team.find({ tenantId: staff.tenantId, mentorId: staff._id,
    status: 'active' }).select('_id').lean();
  if (!teams.length) return [];
  const people = await Admin.find({ tenantId: staff.tenantId,
    teamId: { $in: teams.map(team => team._id) }, staffStatus: 'active' }).select('_id').lean();
  return people.map(person => person._id);
}
async function permitStaff(req) {
  if (req.staff.role === 'superadmin' || !req.staff.customRoleId) return;
  const role = await StaffRole.findById(req.staff.customRoleId).select('permissions').lean();
  if (!canUseGroupModule(role?.permissions))
    fail('当前角色无权使用服务群');
}
async function groupAndPatient(groupId, tenantId) {
  const group = await Group.findOne({ _id: validId(groupId), tenantId, status: 'active' }).lean();
  if (!group) fail('服务群不存在', 404);
  const patient = await User.findOne({ _id: group.patientId, tenantId,
    isDeleted: { $ne: true } }).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  if (!patient) fail('服务对象不可用', 404);
  return { group, patient };
}
function summary(group, patient, staffMembers, supervised = false, canConfigure = false) {
  return { id: group._id, patientId: patient._id, patientName: patient.name,
    staff: staffMembers.map(person => ({ id: person._id, name: person.name, role: person.role })),
    lastMessageAt: group.lastMessageAt || null,
    waitingForStaff: needsStaffReply(group),
    supervised, canConfigure };
}
function leaderCanConfigure(patient, staff, mentoredIds) {
  return staff.role === 'superadmin' || isAssignedLeader(patient, staff) || assignedIds(patient).some(id =>
    mentoredIds.some(memberId => same(id, memberId)));
}
function leaderCanObserve(patient, staff, group) {
  return isAssignedLeader(patient, staff) &&
    (group.memberIds || []).length > 0;
}
async function recentMessages(group) {
  const rows = await Message.find({ groupId: group._id, tenantId: group.tenantId })
    .sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  return rows.reverse().map(row => ({ id: row._id, senderType: row.senderType,
    senderName: row.senderName, content: row.content, createdAt: row.createdAt }));
}
async function send(group, senderType, sender, content) {
  const body = contentOf(content);
  if (!body || body.length > 2000) fail('请输入不超过2000字的消息', 400);
  const message = await Message.create({ tenantId: group.tenantId, groupId: group._id,
    patientId: group.patientId, senderType, senderId: sender._id,
    senderName: sender.name || '服务成员', content: body });
  const at = message.createdAt;
  await Group.updateOne({ _id: group._id, tenantId: group.tenantId, status: 'active' },
    { $max: { lastMessageAt: at,
      [senderType === 'customer' ? 'lastCustomerMessageAt' : 'lastStaffMessageAt']: at } });
  if (senderType === 'staff') {
    // The group message is authoritative. A failed inbox notification may be retried
    // independently and must never turn a delivered reply into a send failure.
    try {
      await InboxMessage.updateOne({ dedupeKey: `in-app-service-group:${message._id}` },
        { $setOnInsert: { user: group.patientId, type: 'system', sender: '健康服务团队',
          title: '服务群有新回复', content: '您的服务团队在嘉医汇服务群回复了您。',
          unread: true, action: { type: 'service_group', groupId: String(group._id) },
          dedupeKey: `in-app-service-group:${message._id}` } }, { upsert: true });
    } catch (error) { console.error('[in-app-service-group] inbox notification failed', error.message); }
  }
  return { id: message._id, senderType, senderName: message.senderName,
    content: message.content, createdAt: at };
}

customerRouter.use(customerAuth);
customerRouter.get('/', wrap(async (req, res) => {
  const groups = await Group.find({ tenantId: req.user.tenantId, patientId: req.user._id,
    status: 'active', 'memberIds.0': { $exists: true } }).lean();
  res.json({ success: true, data: await Promise.all(groups.map(async group =>
    summary(group, req.user, await groupStaff(group, req.user)))) });
}));
customerRouter.post('/', wrap(async (req, res) => {
  fail('请等待团队负责人配置服务群成员', 409);
}));
customerRouter.get('/:groupId/messages', wrap(async (req, res) => {
  const { group } = await groupAndPatient(req.params.groupId, req.user.tenantId);
  if (!canCustomerAccess(group, req.user)) fail('无权查看服务群');
  res.json({ success: true, data: await recentMessages(group) });
}));
customerRouter.post('/:groupId/messages', wrap(async (req, res) => {
  const { group, patient } = await groupAndPatient(req.params.groupId, req.user.tenantId);
  if (!canCustomerAccess(group, req.user)) fail('无权发送服务群消息');
  if (!(await groupStaff(group, patient)).length) fail('当前没有可接收消息的入群人员', 409);
  res.status(201).json({ success: true, data: await send(group, 'customer', req.user, req.body?.content) });
}));

staffRouter.use(staffAuth, wrap(async (req, res, next) => { await permitStaff(req); next(); }));
staffRouter.get('/', wrap(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = 100;
  const mentoredIds = await mentorStaffIds(req.staff);
  const visibleIds = req.staff.role === 'superadmin' ? null : [req.staff._id, ...mentoredIds];
  const patientQuery = { tenantId: req.staff.tenantId, isDeleted: { $ne: true } };
  if (visibleIds) patientQuery.$or = assignmentFields.map(field => ({ [field]: { $in: visibleIds } }));
  const patients = await User.find(patientQuery).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  const groupQuery = { tenantId: req.staff.tenantId,
    patientId: { $in: patients.map(patient => patient._id) }, status: 'active' };
  const groups = await Group.find(groupQuery)
    .sort({ lastMessageAt: -1, createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize).limit(pageSize + 1).lean();
  const hasMore = groups.length > pageSize;
  const patientMap = new Map(patients.map(patient => [String(patient._id), patient]));
  const data = [];
  for (const group of groups.slice(0, pageSize)) {
    const patient = patientMap.get(String(group.patientId));
    const direct = canStaffAccess(group, patient, req.staff);
    const supervised = !direct && (canMentorObserve(group, patient, req.staff, mentoredIds) ||
      leaderCanObserve(patient, req.staff, group));
    const canConfigure = leaderCanConfigure(patient, req.staff, mentoredIds);
    if (direct || supervised)
      data.push(summary(group, patient, await groupStaff(group, patient), !direct, canConfigure));
  }
  res.json({ success: true, data, page, hasMore,
    canConfigure: req.staff.role === 'superadmin' || mentoredIds.length > 0 ||
      patients.some(patient => leaderCanConfigure(patient, req.staff, mentoredIds)) });
}));
staffRouter.get('/configuration/:patientId', wrap(async (req, res) => {
  await permitStaff(req);
  const patient = await User.findOne({ _id: validId(req.params.patientId),
    tenantId: req.staff.tenantId, isDeleted: { $ne: true } })
    .select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  if (!patient || !leaderCanConfigure(patient, req.staff, await mentorStaffIds(req.staff)))
    fail('仅客户所属团队负责人可配置群成员');
  const group = await Group.findOne({ _id: patient._id, tenantId: patient.tenantId }).lean();
  res.json({ success: true, data: { patientId: patient._id, patientName: patient.name,
    candidates: await currentStaff(patient), memberIds: group?.memberIds || [],
    membershipVersion: group?.membershipVersion || 0 } });
}));
staffRouter.post('/', wrap(async (req, res) => {
  await permitStaff(req);
  const patientId = validId(req.body?.patientId);
  const patient = await User.findOne({ _id: patientId, tenantId: req.staff.tenantId,
    isDeleted: { $ne: true } }).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  const mentoredIds = await mentorStaffIds(req.staff);
  if (!patient || !leaderCanConfigure(patient, req.staff, mentoredIds))
    fail('仅客户所属团队负责人可配置群成员');
  const candidates = await currentStaff(patient);
  const rawIds = req.body?.memberIds;
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > 20 ||
    rawIds.some(id => !mongoose.isValidObjectId(id)) ||
    new Set(rawIds.map(String)).size !== rawIds.length) fail('请选择有效的入群成员', 400);
  const members = candidates.filter(person => rawIds.some(id => same(id, person._id)));
  if (members.length !== rawIds.length) fail('入群人员必须是当前服务人员', 400);
  const directLeader = isAssignedLeader(patient, req.staff);
  if (req.staff.role !== 'superadmin' && !directLeader && !members.some(person =>
    mentoredIds.some(id => same(id, person._id)))) fail('至少选择一名本团队服务人员', 400);
  const version = Number(req.body?.membershipVersion);
  if (!Number.isSafeInteger(version) || version < 0) fail('请刷新群成员名单后重试', 409);
  const existing = await Group.findOne({ _id: patient._id, tenantId: patient.tenantId })
    .select('membershipVersion status').lean();
  if (existing?.status === 'closed') fail('服务群已关闭', 409);
  if (version !== (existing?.membershipVersion || 0))
    fail('群成员名单已变化，请刷新后重试', 409);
  const membershipFilter = existing
    ? (existing.membershipVersion === undefined ? { $exists: false } : existing.membershipVersion)
    : 0;
  let group;
  try {
    group = await Group.findOneAndUpdate({ _id: patient._id, tenantId: patient.tenantId,
      membershipVersion: membershipFilter, status: 'active' },
    { $set: { memberIds: members.map(person => person._id), configuredByStaffId: req.staff._id },
      $setOnInsert: { _id: patient._id, tenantId: patient.tenantId,
        patientId: patient._id, createdByStaffId: req.staff._id },
      $inc: { membershipVersion: 1 } },
    { upsert: !existing, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    fail('群成员名单已变化，请刷新后重试', 409);
  }
  if (!group) fail('群成员名单已变化，请刷新后重试', 409);
  res.json({ success: true, data: summary(group, patient, members, true, true) });
}));
staffRouter.get('/:groupId/messages', wrap(async (req, res) => {
  const { group, patient } = await groupAndPatient(req.params.groupId, req.staff.tenantId);
  const direct = canStaffAccess(group, patient, req.staff);
  const mentoredIds = await mentorStaffIds(req.staff);
  const supervised = !direct && (canMentorObserve(group, patient, req.staff, mentoredIds) ||
    leaderCanObserve(patient, req.staff, group));
  if (!direct && !supervised) fail('无权查看服务群');
  const data = await recentMessages(group);
  if (supervised) await View.create({ tenantId: group.tenantId, groupId: group._id,
    patientId: patient._id, viewerId: req.staff._id, messageCount: data.length });
  res.json({ success: true, data, supervised });
}));
staffRouter.post('/:groupId/messages', wrap(async (req, res) => {
  await permitStaff(req);
  const { group, patient } = await groupAndPatient(req.params.groupId, req.staff.tenantId);
  if (!canStaffAccess(group, patient, req.staff)) fail('仅当前服务人员可以回复');
  res.status(201).json({ success: true, data: await send(group, 'staff', req.staff, req.body?.content) });
}));

module.exports = { customerRouter, staffRouter };
