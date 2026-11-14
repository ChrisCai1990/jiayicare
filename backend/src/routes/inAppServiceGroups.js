const events = require('../utils/serviceGroupEvents');
const lifecycle = require('../utils/serviceGroupLifecycle');
const { TYPES, typeOf, titleOf, memberIdsFor } = require('../utils/serviceGroupTypes');
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
const assistant = require('../utils/serviceGroupAssistant');
const { assignmentFields, assignedIds, canUseGroupModule, isAssignedHealthManager, isAssignedLeader, canCustomerAccess, canStaffAccess,
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
    staffStatus: 'active' }).select('_id name role avatar').lean();
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
async function groupAndPatient(groupId, tenantId, readOnly = false) {
  const group = await Group.findOne({ _id: validId(groupId), tenantId, status: readOnly ? { $in: ['active','closed'] } : 'active' }).lean();
  if (!group) fail('服务群不存在', 404);
  const patient = await User.findOne({ _id: group.patientId, tenantId,
    isDeleted: { $ne: true } }).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  if (!patient) fail('服务对象不可用', 404);
  return { group, patient };
}
function summary(group, patient, staffMembers, supervised = false, canConfigure = false) {
  return { id: group._id, patientId: patient._id, patientName: patient.name,
    status: group.status, closedAt: group.closedAt || null, serviceType: typeOf(group), name: titleOf(group, patient), categoryLabel: TYPES[typeOf(group)]?.label || '原服务群',
    staff: staffMembers.map(person => ({ id: person._id, name: person.name, role: person.role, avatar: person.avatar || '' })),
    lastMessageAt: group.lastMessageAt || null,
    waitingForStaff: needsStaffReply(group),
    customer: { id: patient._id, name: patient.name, kind: 'customer', role: '客户' }, supervised, canConfigure, assistant: assistant.identity };
}
function leaderCanConfigure(patient, staff) {
  return staff.role === 'superadmin' || isAssignedHealthManager(patient, staff);
}
function leaderCanObserve(patient, staff, group) {
  return isAssignedLeader(patient, staff) &&
    (group.memberIds || []).length > 0;
}
async function recentMessages(group, before) {
  const filter={ groupId: group._id, tenantId: group.tenantId };
  if(before){const anchor=await Message.findOne({_id:validId(before),...filter}).select('createdAt').lean();if(!anchor)fail('消息不存在',404);filter.$or=[{createdAt:{$lt:anchor.createdAt}},{createdAt:anchor.createdAt,_id:{$lt:anchor._id}}];}
  const rows = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 }).limit(100).lean();
  const staffIds = rows.filter(row => row.senderType === 'staff').map(row => row.senderId);
  const [people, customer] = await Promise.all([
    Admin.find({ _id: { $in: staffIds }, tenantId: group.tenantId }).select('_id avatar role').lean(),
    User.findOne({ _id: group.patientId, tenantId: group.tenantId }).select('avatar').lean(),
  ]);
  const personMap = new Map(people.map(person => [String(person._id), person]));
  return rows.reverse().map(row => ({ id: row._id, senderType: row.senderType,
    senderAvatar: row.senderType === 'ai' ? assistant.identity.avatar : row.senderType === 'customer' ? customer?.avatar || '' : personMap.get(String(row.senderId))?.avatar || '',
    senderRole: row.senderType === 'ai' ? 'ai' : row.senderType === 'customer' ? 'customer' : personMap.get(String(row.senderId))?.role || '',
    mentions: row.mentions || [], senderName: row.senderName, content: row.content, createdAt: row.createdAt }));
}
async function send(group, senderType, sender, content, rawMentions = []) {
 return events.withGroupLock(group._id, group.tenantId, async locked => {
  if (locked.status !== 'active') fail('服务群已归档，不能发送消息', 409);
  const patient = await User.findOne({_id:group.patientId,tenantId:group.tenantId}).lean();
  const people = await groupStaff(locked,patient);
  const candidates = [...people.map(p=>({id:p._id,kind:'staff',name:p.name,role:events.roles[p.role] || '服务人员'})), {id:patient._id,kind:'customer',name:patient.name,role:'客户'}];
  if (!Array.isArray(rawMentions) || rawMentions.length > 21) fail('@成员无效',400);
  const mentions = [...new Set(rawMentions.map(String))].map(id=>candidates.find(p=>String(p.id)===id));
  if(mentions.some(m=>!m)) fail('只能@当前群成员',400);
  if(senderType==='staff' && !canStaffAccess(locked,patient,sender)) fail('成员已调整，请刷新',403);
  const body = contentOf(content);
  if (!body || body.length > 2000) fail('请输入不超过2000字的消息', 400);
  const message = await Message.create({ tenantId: group.tenantId, groupId: group._id,
    patientId: group.patientId, senderType, senderId: sender._id,
    senderName: sender.name || '服务成员', content: body, mentions });
  const at = message.createdAt;
  await Group.updateOne({ _id: group._id, tenantId: group.tenantId, status: 'active' },
    { $max: { lastMessageAt: at,
      [senderType === 'customer' ? 'lastCustomerMessageAt' : 'lastStaffMessageAt']: at } });
  if (senderType === 'staff') {
    // The group message is authoritative. A failed inbox notification may be retried
    // independently and must never turn a delivered reply into a send failure.
    try {
      await events.notifyCustomer(group,message);
    } catch (error) { console.error('[in-app-service-group] inbox notification failed', error.message); }
  }
  return { id: message._id, senderType, senderName: message.senderName,
    content: message.content, mentions, createdAt: at };
 });
}

customerRouter.use(customerAuth);
customerRouter.get('/', wrap(async (req, res) => {
  const groups = await Group.find({ tenantId: req.user.tenantId, patientId: req.user._id,
    status: { $in: ['active','closed'] }, 'memberIds.0': { $exists: true } }).lean();
  res.json({ success: true, data: await Promise.all(groups.map(async group =>
    ({ ...summary(group, req.user, await groupStaff(group, req.user)),
      unreadCount: await InboxMessage.countDocuments({ user: req.user._id, unread: true, 'action.type': 'service_group', 'action.groupId': String(group._id) }),
      mentionCount: await Message.countDocuments({groupId:group._id,tenantId:group.tenantId,'mentions.id':req.user._id,mentionReadBy:{$ne:req.user._id}}),
      preview: (await Message.findOne({ groupId: group._id, tenantId: group.tenantId }).sort({ createdAt: -1, _id: -1 }).select('content').lean())?.content?.slice(0, 100) || '' }))) });
}));
customerRouter.post('/', wrap(async (req, res) => {
  fail('请等待健管专员配置服务群成员', 409);
}));
customerRouter.get('/:groupId/messages', wrap(async (req, res) => {
  const { group } = await groupAndPatient(req.params.groupId, req.user.tenantId, true);
  if (!canCustomerAccess({...group,status:'active'}, req.user)) fail('无权查看服务群');
  const data = await recentMessages(group, req.query?.before);
  const keys = data.map(row => `in-app-service-group:${row.id}`);
  const unread = await InboxMessage.find({ user: req.user._id, unread: true, dedupeKey: { $in: keys } }).select('_id dedupeKey').lean();
  const unreadKeys = new Set(unread.map(row => row.dedupeKey));
  const firstUnread = data.find(row => unreadKeys.has(`in-app-service-group:${row.id}`));
  if (unread.length) await InboxMessage.updateMany({ user: req.user._id, _id: { $in: unread.map(row => row._id) }, unread: true }, { $set: { unread: false, readAt: new Date() } });
  await Message.updateMany({groupId:group._id,tenantId:group.tenantId,_id:{$in:data.map(m=>m.id)},'mentions.id':req.user._id},{$addToSet:{mentionReadBy:req.user._id}});
  res.json({ success: true, data, hasMore: data.length === 100, firstUnreadMessageId: firstUnread?.id || null });
}));
customerRouter.post('/:groupId/messages', wrap(async (req, res) => {
  const { group, patient } = await groupAndPatient(req.params.groupId, req.user.tenantId);
  if (!canCustomerAccess(group, req.user)) fail('无权发送服务群消息');
  if (!(await groupStaff(group, patient)).length) fail('当前没有可接收消息的入群人员', 409);
  const message = await send(group, 'customer', req.user, req.body?.content, req.body?.mentionIds);
  res.status(201).json({ success: true, data: message });
  void assistant.reply(group._id, message);
}));

staffRouter.use(staffAuth, wrap(async (req, res, next) => { await permitStaff(req); next(); }));
staffRouter.get('/reminders', wrap(async (req, res) => {
  const mentoredIds = await mentorStaffIds(req.staff);
  const visibleIds = [req.staff._id, ...mentoredIds];
  const query = { tenantId: req.staff.tenantId, isDeleted: { $ne: true } };
  if (req.staff.role !== 'superadmin') query.$or = assignmentFields.map(field => ({ [field]: { $in: visibleIds } }));
  const patients = await User.find(query).select('tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  const patientMap = new Map(patients.map(p => [String(p._id), p]));
  const groups = await Group.find({ tenantId: req.staff.tenantId, status: 'active',
    patientId: { $in: patients.map(p => p._id) }, 'memberIds.0': { $exists: true },
     }).lean();
  let pending = 0, supervised = 0, mentioned = 0;
  for (const group of groups) {
    const patient = patientMap.get(String(group.patientId));
    const mention = canStaffAccess(group,patient,req.staff) && await Message.exists({groupId:group._id,tenantId:group.tenantId,'mentions.id':req.staff._id,mentionReadBy:{$ne:req.staff._id}});
    if(mention) mentioned++;
    if (!needsStaffReply(group) && !mention) continue;
    if (canStaffAccess(group, patient, req.staff)) pending++;
    else if (canMentorObserve(group, patient, req.staff, mentoredIds) || leaderCanObserve(patient, req.staff, group)) supervised++;
  }
  const confirmations = await lifecycle.count(req.staff);
  res.json({ success: true, data: { pending, supervised, mentioned, confirmations, total: pending + supervised + confirmations } });
}));
staffRouter.get('/', wrap(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = 100;
  const mentoredIds = await mentorStaffIds(req.staff);
  const visibleIds = req.staff.role === 'superadmin' ? null : [req.staff._id, ...mentoredIds];
  const patientQuery = { tenantId: req.staff.tenantId, isDeleted: { $ne: true } };
  if (visibleIds) patientQuery.$or = assignmentFields.map(field => ({ [field]: { $in: visibleIds } }));
  const patients = await User.find(patientQuery).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  const groupQuery = { tenantId: req.staff.tenantId,
    patientId: { $in: patients.map(patient => patient._id) }, status: req.query.status === 'closed' ? 'closed' : 'active' };
  if (req.query.serviceType) {
    if (!TYPES[req.query.serviceType] && req.query.serviceType !== 'legacy') fail('服务群类型无效', 400);
    groupQuery.serviceType = req.query.serviceType;
  }
  const groups = await Group.find(groupQuery)
    .sort({ lastMessageAt: -1, createdAt: -1, _id: -1 })
    .skip((page - 1) * pageSize).limit(pageSize + 1).lean();
  const hasMore = groups.length > pageSize;
  const patientMap = new Map(patients.map(patient => [String(patient._id), patient]));
  const data = [];
  for (const group of groups.slice(0, pageSize)) {
    const patient = patientMap.get(String(group.patientId));
    const direct = canStaffAccess({...group,status:'active'}, patient, req.staff);
    const supervised = !direct && (canMentorObserve({...group,status:'active'}, patient, req.staff, mentoredIds) ||
      leaderCanObserve(patient, req.staff, group));
    const canConfigure = leaderCanConfigure(patient, req.staff);
    if (direct || supervised)
      data.push({...summary(group, patient, await groupStaff(group, patient), !direct, canConfigure), mentionCount: direct ? await Message.countDocuments({groupId:group._id,tenantId:group.tenantId,'mentions.id':req.staff._id,mentionReadBy:{$ne:req.staff._id}}) : 0});
  }
  res.json({ success: true, data, page, hasMore,
    canConfigure: req.staff.role === 'superadmin' ||
      patients.some(patient => leaderCanConfigure(patient, req.staff)) });
}));
staffRouter.get('/lifecycle', wrap(async(req,res)=>res.json({success:true,data:await lifecycle.list(req.staff)})));
staffRouter.post('/lifecycle/confirm', wrap(async(req,res)=>res.json({success:true,data:await lifecycle.confirm(req.staff,req.body||{})})));
staffRouter.get('/configuration/:patientId', wrap(async (req, res) => {
  await permitStaff(req);
  const patient = await User.findOne({ _id: validId(req.params.patientId),
    tenantId: req.staff.tenantId, isDeleted: { $ne: true } })
    .select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  if (!patient || !leaderCanConfigure(patient, req.staff))
    fail('仅客户当前健管专员可配置群成员');
  const serviceType = req.query.serviceType;
  if (!TYPES[serviceType] && serviceType !== 'legacy') fail('请选择服务群类型', 400);
  const group = await Group.findOne({ patientId: patient._id, tenantId: patient.tenantId, serviceType, status: 'active' }).lean();
  if (serviceType === 'legacy' && !group) fail('原服务群不存在', 404);
  const current = await currentStaff(patient);
  const expected = memberIdsFor(patient, serviceType);
  const candidates = serviceType === 'legacy' ? current : current.filter(person => expected.includes(String(person._id)));
  const ready = serviceType === 'legacy' || (!!patient[TYPES[serviceType].field] && !!patient.assignedHealthManager && candidates.length === expected.length);
  res.json({ success: true, data: { patientId: patient._id, patientName: patient.name, serviceType,
    name: titleOf({ serviceType }, patient), ready, candidates, memberIds: group?.memberIds || candidates.map(person => person._id),
    membershipVersion: group?.membershipVersion || 0 } });
}));
staffRouter.post('/', wrap(async (req, res) => {
  await permitStaff(req);
  const patientId = validId(req.body?.patientId);
  const patient = await User.findOne({ _id: patientId, tenantId: req.staff.tenantId,
    isDeleted: { $ne: true } }).select('name tenantId isDeleted ' + assignmentFields.join(' ')).lean();
  if (!patient || !leaderCanConfigure(patient, req.staff))
    fail('仅客户当前健管专员可配置群成员');
  const serviceType = req.body?.serviceType;
  if (!TYPES[serviceType] && serviceType !== 'legacy') fail('请选择服务群类型', 400);
  const candidates = await currentStaff(patient);
  const rawIds = req.body?.memberIds;
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > 20 ||
    rawIds.some(id => !mongoose.isValidObjectId(id)) ||
    new Set(rawIds.map(String)).size !== rawIds.length) fail('请选择有效的入群成员', 400);
  const members = candidates.filter(person => rawIds.some(id => same(id, person._id)));
  if (members.length !== rawIds.length) fail('入群人员必须是当前服务人员', 400);
  if (serviceType !== 'legacy') {
    const expected = memberIdsFor(patient, serviceType);
    if (!patient[TYPES[serviceType].field] || !patient.assignedHealthManager ||
      expected.length !== members.length || expected.some(id => !members.some(person => same(id, person._id))))
      fail('请先分配对应专业人员和健管专员，并将双方选入本群', 400);
  }
  const version = Number(req.body?.membershipVersion);
  if (!Number.isSafeInteger(version) || version < 0) fail('请刷新群成员名单后重试', 409);
  const existing = await Group.findOne({ patientId: patient._id, tenantId: patient.tenantId, serviceType, status: 'active' })
    .select('membershipVersion status memberIds').lean();
  if (serviceType === 'legacy' && !existing) fail('不能新建原服务群，请选择服务类型', 400);
  if (existing?.status === 'closed') fail('服务群已关闭', 409);
  if (version !== (existing?.membershipVersion || 0))
    fail('群成员名单已变化，请刷新后重试', 409);
  const membershipFilter = existing
    ? (existing.membershipVersion === undefined ? { $exists: false } : existing.membershipVersion)
    : 0;
  const newId = existing?._id || new mongoose.Types.ObjectId();
  const changed = !existing || JSON.stringify((existing.memberIds||[]).map(String).sort()) !== JSON.stringify(rawIds.map(String).sort());
  const intro = events.introduction({serviceType},patient,members,!!existing);
  const notice = {key:existing ? `members:${newId}:${version+1}` : `welcome:${newId}`, ...intro};
  let group;
  try {
    group = await Group.findOneAndUpdate({ patientId: patient._id, tenantId: patient.tenantId, serviceType,
      ...(existing ? { $or: [{ operationUntil: { $exists: false } }, { operationUntil: { $lt: new Date() } }] } : {}),
      membershipVersion: membershipFilter, status: 'active' },
    { $set: { memberIds: members.map(person => person._id), configuredByStaffId: req.staff._id },
      $setOnInsert: { _id:newId, tenantId: patient.tenantId, serviceType,
        patientId: patient._id, createdByStaffId: req.staff._id },
      $inc: { membershipVersion: 1 }, ...(changed ? {$push:{pendingNotices:notice}} : {}) },
    { upsert: !existing, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    fail('群成员名单已变化，请刷新后重试', 409);
  }
  if (!group) fail('群成员名单已变化，请刷新后重试', 409);
  await events.flushNotices(group).catch(e=>console.error('[group-notice] queued',e.code || 'FAILED'));
  res.json({ success: true, data: summary(group, patient, members,
    !canStaffAccess(group, patient, req.staff), true) });
}));
staffRouter.get('/:groupId/messages', wrap(async (req, res) => {
  const { group, patient } = await groupAndPatient(req.params.groupId, req.staff.tenantId, true);
  const direct = canStaffAccess({...group,status:'active'}, patient, req.staff);
  const mentoredIds = await mentorStaffIds(req.staff);
  const supervised = !direct && (canMentorObserve({...group,status:'active'}, patient, req.staff, mentoredIds) ||
    leaderCanObserve(patient, req.staff, group));
  if (!direct && !supervised) fail('无权查看服务群');
  const data = await recentMessages(group, req.query?.before);
  if (supervised) await View.create({ tenantId: group.tenantId, groupId: group._id,
    patientId: patient._id, viewerId: req.staff._id, messageCount: data.length });
  const unread = await Message.find({groupId:group._id,tenantId:group.tenantId,_id:{$in:data.map(m=>m.id)},'mentions.id':req.staff._id,mentionReadBy:{$ne:req.staff._id}}).sort({createdAt:1}).select('_id').lean();
  await Message.updateMany({_id:{$in:unread.map(m=>m._id)}},{$addToSet:{mentionReadBy:req.staff._id}});
  res.json({ success: true, data, hasMore: data.length === 100, supervised, firstMentionMessageId:unread[0]?._id || null });
}));
staffRouter.post('/:groupId/presence', wrap(async (req, res) => {
  const { group, patient } = await groupAndPatient(req.params.groupId, req.staff.tenantId);
  if (!canStaffAccess(group, patient, req.staff)) fail('仅当前入群服务人员可接待');
  await Group.updateOne({ _id: group._id }, { $max: { humanActiveUntil: new Date(Date.now() + 90000) } });
  res.json({ success: true });
}));
staffRouter.post('/:groupId/messages', wrap(async (req, res) => {
  await permitStaff(req);
  const { group, patient } = await groupAndPatient(req.params.groupId, req.staff.tenantId);
  if (!canStaffAccess(group, patient, req.staff)) fail('仅当前服务人员可以回复');
  await Group.updateOne({ _id: group._id }, { $max: { humanActiveUntil: new Date(Date.now() + 90000) } });
  res.status(201).json({ success: true, data: await send(group, 'staff', req.staff, req.body?.content, req.body?.mentionIds) });
}));

module.exports = { customerRouter, staffRouter };
