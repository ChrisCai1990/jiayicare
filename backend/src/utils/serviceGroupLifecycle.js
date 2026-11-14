// Deterministic, read-only projection of confirmed business records. No language
// model may create/close a group or infer entitlement from a chat message.
const crypto = require('crypto');
const mongoose = require('mongoose');
const Group = require('../models/InAppServiceGroup');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Period = require('../models/AnnualServicePeriod');
const Plan = require('../models/HealthPlan');
const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');
const { TYPES, memberIdsFor, titleOf } = require('./serviceGroupTypes');
const { introduction, withGroupLock, fail, flushNotices } = require('./serviceGroupEvents');
const id = value => String(value || '');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const today = now => new Date(+now + 8*3600000).toISOString().slice(0,10);
function normalize(kind, row, now = new Date()) {
 let serviceType, active = false, ended = false, starts, ends;
 if (kind === 'annual') {
   serviceType = 'advisor'; starts = row.startDate; ends = row.endDate;
   active = row.activationStatus === 'active' && starts <= today(now) && ends >= today(now);
   ended = row.activationStatus === 'active' && ends < today(now);
 } else if (kind === 'plan') {
   serviceType = row.type === 'nutrition' ? 'nutrition' : 'medical';
   starts = row.startDate; ends = row.endDate;
   active = row.status === 'active' && !!row.pushedAt && (!starts || +new Date(starts) <= +now) && (!ends || +new Date(ends) >= +now);
   ended = ['completed','cancelled'].includes(row.status) || (row.status === 'active' && !!ends && +new Date(ends) < +now);
 } else {
   serviceType = row.specialtyService?.key || row.specialtyTermsSnapshot?.key ? 'specialty' : 'medical';
   starts = row.specialtyService?.startsAt || row.serviceStartedAt;
   ends = row.specialtyService?.endsAt;
   ended = ['completed','cancelled'].includes(row.status) || ['closed','refunded'].includes(row.tradeStatus) || row.paymentStatus === 'refunded' || !!row.specialtyService?.closedAt || (!!ends && +new Date(ends) < +now);
   active = !ended && !!starts && +new Date(starts) <= +now && (row.paymentStatus === 'paid' || !!row.packageEntitlementUsage || !!row.membershipFeatureUsage);
 }
 return { key: `${kind}:${row._id}`, serviceType, active, ended, starts, ends,
   label: kind === 'annual' ? '已确认年度服务期' : row.title || row.serviceName || TYPES[serviceType].suffix,
   revision: digest([kind, row._id, row.updatedAt, active, ended, starts, ends]),
   orderId: kind === 'order' ? row._id : row.sourceOrderId,
   planId: kind === 'plan' ? row._id : null };
}
async function sources(patient) {
 // Models without tenantId are bounded by the authenticated tenant's user ID.
 const [periods, plans, orders] = await Promise.all([
   Period.find({ patientId: patient._id }).lean(),
   Plan.find({ patientId: patient._id, type: { $in: ['nutrition','medical_assist'] } }).lean(),
   Order.find({ user: patient._id, tenantId: patient.tenantId, $or: [
     { 'serviceWorkflowSnapshot.key': 'medical_proxy' }, { 'specialtyService.key': { $nin: ['', null], $exists: true } },
     { 'specialtyTermsSnapshot.key': { $nin: ['', null], $exists: true } } ] }).lean(),
 ]);
 const orderIds = new Set(orders.map(o => id(o._id)));
 return [...periods.map(r => normalize('annual',r)), ...plans.filter(p => !p.sourceOrderId || !orderIds.has(id(p.sourceOrderId))).map(r => normalize('plan',r)), ...orders.map(r => normalize('order',r))];
}
async function pendingFor(patient) {
 const [records, groups, members] = await Promise.all([sources(patient), Group.find({ tenantId: patient.tenantId, patientId: patient._id }).lean(),
   Admin.find({ tenantId: patient.tenantId, _id: { $in: Object.keys(TYPES).flatMap(type => memberIdsFor(patient,type)) }, staffStatus: 'active' }).select('_id name role').lean()]);
 const used = new Set(groups.flatMap(g => g.sourceKeys || []));
 const tasks = [];
 const continues = (group, source) => {
   const linked=(group.sourceKeys||[]).map(k=>records.find(s=>s.key===k));
   if(!linked.length || linked.some(s=>s?.active)) return true;
   return source.serviceType==='advisor' && linked.some(s=>s?.ends && source.starts && +new Date(source.starts) <= +new Date(s.ends)+86400000);
 };
 for (const source of records.filter(s => s.active && !used.has(s.key))) {
   const group = groups.find(g => g.status === 'active' && g.serviceType === source.serviceType);
   const expected = memberIdsFor(patient, source.serviceType);
   const people = members.filter(m => expected.includes(id(m._id)));
   const blockedByOld = group && !continues(group,source);
   const ready = !blockedByOld && !!patient.assignedHealthManager && !!patient[TYPES[source.serviceType].field] && people.length === expected.length;
   const row = { key: `open:${source.key}`, action: group ? 'link' : 'create', patientId: patient._id, patientName: patient.name,
     serviceType: source.serviceType, name: titleOf(source,patient), groupId: group?._id,
     sourceKey: source.key, sourceLabel: source.label, ready, reason: blockedByOld ? '前次服务已结束，请先确认归档旧群，再为本次服务建新群' : ready ? '' : '请先分配在职的对应专业人员和健管专员',
     members: people.map(p => ({ id:p._id, name:p.name })), memberIds: expected };
   row.version = digest([source.revision, group?._id, group?.membershipVersion, expected, people.map(p=>id(p._id))]);
   tasks.push(row);
 }
 for (const group of groups.filter(g => g.status === 'active' && g.sourceKeys?.length)) {
   const linked = group.sourceKeys.map(key => records.find(s => s.key === key));
   if (linked.some(s => !s || !s.ended) || records.some(s => s.serviceType === group.serviceType && s.active && continues(group,s))) continue;
   const orderIds = linked.map(s => s.orderId).filter(Boolean), planIds = linked.map(s => s.planId).filter(Boolean);
   const clauses = [...orderIds.map(v => ({ sourceOrderId: v })), ...planIds.map(v => ({ sourceHealthPlanId:v }))];
   const unfinished = clauses.length ? await FollowUp.find({ patientId: patient._id, status: { $in: ['planned','in_progress'] }, $or: clauses }).select('_id theme plannedContent').limit(21).lean() : [];
   const row = { key:`close:${group._id}`, action:'archive', groupId:group._id, patientId:patient._id, patientName:patient.name,
     serviceType:group.serviceType, name:titleOf(group,patient), ready:true,
     sourceLabel:linked.map(s=>s.label).join('、'), warnings:unfinished.map(f=>f.theme || f.plannedContent || '未完成服务事项'),
     waitingForStaff: !!group.lastCustomerMessageAt && (!group.lastStaffMessageAt || +group.lastCustomerMessageAt > +group.lastStaffMessageAt) };
   row.version=digest([linked.map(s=>s.revision),group.membershipVersion,group.lastMessageAt,unfinished.map(f=>id(f._id))]);
   tasks.push(row);
 }
 return tasks;
}
async function list(staff) {
 const filter = { tenantId:staff.tenantId, isDeleted:{$ne:true}, assignedHealthManager:staff._id };
 if(staff.role==='superadmin') delete filter.assignedHealthManager;
 const patients=await User.find(filter).select('name tenantId assignedHealthManager assignedFamilyDoctor assignedNutritionist assignedMedicalAssistant assignedSpecialist').lean();
 const result=[];
 for(const p of patients) result.push(...await pendingFor(p));
 return result;
}
async function confirm(staff, body) {
 if(!mongoose.isValidObjectId(body.patientId)) fail('客户标识无效',400);
 const patient=await User.findOne({_id:body.patientId,tenantId:staff.tenantId,isDeleted:{$ne:true}}).lean();
 if(!patient || (staff.role!=='superadmin' && id(patient.assignedHealthManager)!==id(staff._id))) fail('仅当前健管专员可确认',403);
 let task=(await pendingFor(patient)).find(t=>t.key===body.key);
 if(!task || task.version!==body.version) fail('服务或成员状态已变化，请刷新待办');
 if(!task.ready) fail(task.reason);
 if(task.action==='archive' && (body.checked!==true || !String(body.note||'').trim())) fail('请核对未完成诉求、预约和续约情况，并填写结束说明',400);
 let group;
 if(task.action==='create') {
   const groupId=new mongoose.Types.ObjectId();
   const people=await Admin.find({_id:{$in:task.memberIds},tenantId:patient.tenantId,staffStatus:'active'}).lean();
   const intro=introduction({serviceType:task.serviceType},patient,people);
   try { group=await Group.create({_id:groupId,tenantId:patient.tenantId,patientId:patient._id,serviceType:task.serviceType,memberIds:task.memberIds,
     sourceKeys:[task.sourceKey],membershipVersion:1,createdByStaffId:staff._id,configuredByStaffId:staff._id,
     pendingNotices:[{key:`welcome:${groupId}`,...intro}],
     lifecycleAudit:[{action:'create',sourceKey:task.sourceKey,by:staff._id,at:new Date()}]}); }
   catch(e){if(e.code===11000)fail('服务群已创建，请刷新');throw e;}
 } else {
   group=await withGroupLock(task.groupId,patient.tenantId,async current=>{
     task=(await pendingFor(patient)).find(t=>t.key===body.key);
     if(current.status!=='active'||!task||task.version!==body.version) fail('服务或群状态已变化，请刷新待办');
     if(task.action==='link') {
       return Group.findOneAndUpdate({_id:current._id,status:'active'},{$addToSet:{sourceKeys:task.sourceKey},$push:{lifecycleAudit:{action:'link',sourceKey:task.sourceKey,by:staff._id,at:new Date()}}},{new:true});
     }
     // The close notice is durable and idempotent. No customer messages can race
     // this transition because all human writes share the same group lock.
     const note=String(body.note).trim().slice(0,1000);
     const closed=await Group.findOneAndUpdate({_id:current._id,status:'active'},{$set:{status:'closed',closedAt:new Date(),closedBy:staff._id,closureNote:note},
       $push:{lifecycleAudit:{action:'archive',by:staff._id,at:new Date(),note},pendingNotices:{key:`closed:${current._id}`,content:'经健管专员确认，本次服务已结束，服务群已归档。您仍可查看历史记录；如需新的服务，请联系服务团队。'}}},{new:true});
     return closed;
   });
 }
 await flushNotices(group).catch(e=>console.error('[group-notice] queued for retry',e.code || 'FAILED'));
 return {id:group._id,status:group.status};
}
const counts=new Map();
async function count(staff){const key=id(staff.tenantId)+':'+id(staff._id);const old=counts.get(key);if(old&&Date.now()-old.at<30000)return old.count;const value=(await list(staff)).length;counts.set(key,{at:Date.now(),count:value});return value;}
module.exports={normalize,sources,pendingFor,list,confirm,count};
