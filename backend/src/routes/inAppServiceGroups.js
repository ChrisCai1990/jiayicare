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
const { assignmentFields, assignedIds, canCustomerAccess, canStaffAccess,
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
async function mentorStaffIds(staff) {
  const teams = await Team.find({ tenantId: staff.tenantId, mentorId: staff._id,
    status: 'active' }).select('_id').lean();
  if (!teams.length) return [];
  const people = await Admin.find({ tenantId: staff.tenantId,
    teamId: { $in: teams.map(team => team._id) }, staffStatus: 'active' }).select('_id').lean();
  return people.map(person => person._id);
}
async function permitStaff(req, action = 'view') {
  if (req.staff.role === 'superadmin' || !req.staff.customRoleId) return;
  const role = await StaffRole.findById(req.staff.customRoleId).select('permissions').lean();
  if (!role?.permissions?.patients?.view || !role?.permissions?.service_assistant?.view)
    fail('当前角色无权使用服务群');
  if (action === 'send' && !(role.permissions.service_assistant.send || role.permissions.service_assistant.create))
    fail('当前角色无权发送服务群消息');
}
async function groupAndPatient(groupId, tenantId) {
  const group = await Group.findOne({ _id: validId(groupId), tenantId, status: 'active' }).lean();
  if (!group) fail('服务群不存在', 404);
  const patient = await User.findOne({ _id: group.patientId, tenantId,
    isDeleted: { $ne: true } }).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  if (!patient) fail('服务对象不可用', 404);
  return { group, patient };
}
function summary(group, patient, staffMembers, supervised = false) {
  return { id: group._id, patientId: patient._id, patientName: patient.name,
    staff: staffMembers.map(person => ({ id: person._id, name: person.name, role: person.role })),
    lastMessageAt: group.lastMessageAt || null,
    waitingForStaff: needsStaffReply(group),
    supervised };
}
async function ensureGroup(patient, createdByStaffId = null) {
  const staff = await currentStaff(patient);
  if (!staff.length) fail('尚未分配服务团队', 409);
  let group;
  try {
    // Production disables automatic secondary indexes. The patient's immutable
    // ObjectId is also the group _id, so MongoDB's primary-key index fences
    // concurrent customer/staff creation even before the optional unique index exists.
    group = await Group.findOneAndUpdate({ _id: patient._id, tenantId: patient.tenantId },
      { $setOnInsert: { _id: patient._id, tenantId: patient.tenantId,
        patientId: patient._id, createdByStaffId } },
      { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    group = await Group.findOne({ _id: patient._id, tenantId: patient.tenantId });
  }
  if (!group) fail('服务群建立失败，请重试', 409);
  if (group.status !== 'active') fail('服务群已关闭', 409);
  return { group, staff };
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
    status: 'active' }).lean();
  const staff = await currentStaff(req.user);
  res.json({ success: true, data: groups.map(group => summary(group, req.user, staff)) });
}));
customerRouter.post('/', wrap(async (req, res) => {
  const { group, staff } = await ensureGroup(req.user);
  res.json({ success: true, data: summary(group, req.user, staff) });
}));
customerRouter.get('/:groupId/messages', wrap(async (req, res) => {
  const { group } = await groupAndPatient(req.params.groupId, req.user.tenantId);
  if (!canCustomerAccess(group, req.user)) fail('无权查看服务群');
  res.json({ success: true, data: await recentMessages(group) });
}));
customerRouter.post('/:groupId/messages', wrap(async (req, res) => {
  const { group, patient } = await groupAndPatient(req.params.groupId, req.user.tenantId);
  if (!canCustomerAccess(group, req.user)) fail('无权发送服务群消息');
  if (!(await currentStaff(patient)).length) fail('当前没有可接收消息的服务人员', 409);
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
    const supervised = !direct && canMentorObserve(group, patient, req.staff, mentoredIds);
    if (direct || supervised) data.push(summary(group, patient, await currentStaff(patient), supervised));
  }
  res.json({ success: true, data, page, hasMore });
}));
staffRouter.post('/', wrap(async (req, res) => {
  await permitStaff(req, 'send');
  const patientId = validId(req.body?.patientId);
  const patient = await User.findOne({ _id: patientId, tenantId: req.staff.tenantId,
    isDeleted: { $ne: true } }).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  if (!patient || !assignedIds(patient).some(id => same(id, req.staff._id)) && req.staff.role !== 'superadmin')
    fail('只能为当前负责的客户建立服务群');
  const { group, staff } = await ensureGroup(patient, req.staff._id);
  res.json({ success: true, data: summary(group, patient, staff) });
}));
staffRouter.get('/:groupId/messages', wrap(async (req, res) => {
  const { group, patient } = await groupAndPatient(req.params.groupId, req.staff.tenantId);
  const direct = canStaffAccess(group, patient, req.staff);
  const supervised = !direct && canMentorObserve(group, patient, req.staff, await mentorStaffIds(req.staff));
  if (!direct && !supervised) fail('无权查看服务群');
  const data = await recentMessages(group);
  if (supervised) await View.create({ tenantId: group.tenantId, groupId: group._id,
    patientId: patient._id, viewerId: req.staff._id, messageCount: data.length });
  res.json({ success: true, data, supervised });
}));
staffRouter.post('/:groupId/messages', wrap(async (req, res) => {
  await permitStaff(req, 'send');
  const { group, patient } = await groupAndPatient(req.params.groupId, req.staff.tenantId);
  if (!canStaffAccess(group, patient, req.staff)) fail('仅当前服务人员可以回复');
  res.status(201).json({ success: true, data: await send(group, 'staff', req.staff, req.body?.content) });
}));

module.exports = { customerRouter, staffRouter };
