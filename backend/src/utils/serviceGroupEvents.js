const crypto = require('crypto');
const Group = require('../models/InAppServiceGroup');
const Message = require('../models/InAppServiceGroupMessage');
const Inbox = require('../models/Message');
const { TYPES, titleOf } = require('./serviceGroupTypes');
const roles = { healthManager: '健管专员', familyDoctor: '健康顾问', nutritionist: '营养师', medicalAssistant: '就医专员', specialist: '专科医师', customer: '客户' };
const descriptions = {
 healthManager: '是您的日常服务联系人，负责需求对接、服务安排、进度跟进，协助协调团队处理您的问题。',
 advisor: '负责您的整体健康管理，结合健康情况提供指导，并协调相关专业服务。',
 nutrition: '负责营养评估、制定个性化营养干预方案，并根据执行情况跟进调整。',
 medical: '负责对接您的就医需求，协助就医安排、资料准备及就医流程跟进。',
 specialty: '负责相关专病的专业评估与管理指导，并结合病情提出进一步诊疗建议。',
};
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
async function withGroupLock(id, tenantId, fn) {
 const token = crypto.randomUUID();
 const group = await Group.findOneAndUpdate({ _id: id, tenantId,
   $or: [{ operationUntil: { $exists: false } }, { operationUntil: { $lt: new Date() } }] },
 { $set: { operationToken: token, operationUntil: new Date(Date.now() + 60000) } }, { new: true }).lean();
 if (!group) fail('服务群正在处理，请稍后重试');
 try { return await fn(group); }
 finally { await Group.updateOne({ _id: id, operationToken: token }, { $unset: { operationToken: 1, operationUntil: 1 } }); }
}
async function notifyCustomer(group, message) {
 await Inbox.updateOne({ dedupeKey: `in-app-service-group:${message._id}` }, { $setOnInsert: {
   user: group.patientId, type: 'system', sender: '健康服务团队',
   title: (message.mentions || []).some(m => m.kind === 'customer') ? '服务群有人@您' : '服务群有新消息',
   content: message.content.slice(0, 120), unread: true,
   action: { type: 'service_group', groupId: String(group._id), messageId: String(message._id), mention: (message.mentions || []).some(m => m.kind === 'customer') },
   dedupeKey: `in-app-service-group:${message._id}`,
 } }, { upsert: true });
}
async function notice(group, eventKey, content, mentions = []) {
 const message = await Message.findOneAndUpdate({ eventKey }, { $setOnInsert: {
   eventKey, tenantId: group.tenantId, groupId: group._id, patientId: group.patientId,
   senderType: 'ai', senderId: group._id, senderName: '小嘉', content, mentions,
 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
 await Group.updateOne({ _id: group._id }, { $max: { lastMessageAt: message.createdAt } });
 await notifyCustomer(group, message);
 return message;
}
function introduction(group, patient, members, changed = false) {
 const lines = [], mentions = [];
 const entries = [['healthManager', 'assignedHealthManager', '健管专员'], [group.serviceType, TYPES[group.serviceType]?.field, TYPES[group.serviceType]?.label]];
 for (const [key, field, label] of entries) {
   const person = members.find(p => String(p._id) === String(patient[field]));
   if (!person) continue;
   lines.push(`@${person.name} ${label}${descriptions[key]}`);
   if (!mentions.some(m => String(m.id) === String(person._id))) mentions.push({ id: person._id, kind: 'staff', name: person.name, role: label });
 }
 const content = `${changed ? '服务团队成员已更新。' : `您好，欢迎加入${titleOf(group, patient)}。我是小嘉，健管专员的 AI 助手，您的 AI 健康管家。`}\n\n${lines.join('\n\n')}\n\n我会协助日常答疑、收集需求并提醒相应服务人员；需要人工处理的问题，由服务团队接续。您可以直接留言，也可以 @对应成员。已提醒相关成员。`;
 return { content, mentions };
}
async function flushNotices(group) {
 for(const item of group.pendingNotices || []) {
   await notice(group,item.key,item.content,item.mentions || []);
   await Group.updateOne({_id:group._id},{$pull:{pendingNotices:{key:item.key}}});
 }
}
let flushing=false;
async function retryNotices() {
 if(flushing)return; flushing=true;
 try { for(const group of await Group.find({'pendingNotices.0':{$exists:true}}).limit(100).lean()) await flushNotices(group); }
 catch(e){console.error('[group-notice]',e.code || 'retry_failed');}
 finally{flushing=false;}
}
function startNoticeRetry(){void retryNotices();setInterval(()=>void retryNotices(),30000).unref();}
module.exports = { roles, descriptions, withGroupLock, notifyCustomer, notice, introduction, fail, flushNotices, startNoticeRetry };
