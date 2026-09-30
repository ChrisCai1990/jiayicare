const { createHash } = require('crypto');
const END = '2026-10-31';
const fail = message => { throw Object.assign(new Error(message), {statusCode:409}); };
const day = date => new Date(date).toLocaleDateString('sv-SE', {timeZone:'Asia/Shanghai'});
const idFor = patientId => createHash('sha256').update(`dental-gift-2026:${patientId}`).digest('hex');
async function context(patientId) {
  const user = await require('../models/User').findById(patientId).select('enterpriseId membershipTier').lean();
  if (!user?.enterpriseId || user.membershipTier !== 'enterprise') return null;
  const enterprise = await require('../models/Enterprise').findOne({_id:user.enterpriseId, status:'active', dentalGift2026:true}).select('_id').lean();
  if (!enterprise) return null;
  const row = await require('../models/DentalGiftUsage').findById(idFor(patientId)).lean();
  return {patientId, enterpriseId:enterprise._id, row};
}
function view(row, now = new Date()) {
  return {status:row?.status || 'unknown', revision:row?.__v ?? null, count:1, expiresAt:END,
    expired:day(now)>END, institution:row?.institution || '', appointmentDate:row?.appointmentDate || '', completedDate:row?.completedDate || ''};
}
function transition(row, body, now = new Date()) {
  const state = row?.status || 'unknown', today = day(now);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!note || note.length>500) fail('请填写核对或服务完成的实际记录（不超过500字）');
  if (body.action==='verify' && state==='unknown' && today<=END) return {status:'available'};
  if (body.action==='book' && ['available','booked'].includes(state) && today<=END) {
    const date = body.appointmentDate, institution = typeof body.institution==='string' ? body.institution.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date<today || date>END || !institution || institution.length>200) fail('请填写已确认的机构和有效期内预约日期');
    return {status:'booked',institution,appointmentDate:date};
  }
  if ((body.action==='complete' && state==='booked') || (body.action==='historical' && state==='unknown')) {
    const date=body.completedDate;
    if (!/^2026-\d{2}-\d{2}$/.test(date||'') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date || date>today || date>END) fail('请填写实际完成日期，不能晚于今天或权益截止日期');
    if (state==='booked' && date<row.appointmentDate) fail('完成日期不能早于登记预约日期，请先核对预约');
    return {status:'used',completedDate:date};
  }
  fail('权益状态已变化、已使用或已过期，请刷新核对');
}
async function update(patientId, body, actorId) {
  const current=await context(patientId); if(!current) fail('无适用的企业赠送权益');
  const {row}=current;
  if ((row?.__v ?? null)!==body.revision) fail('权益已被其他工作人员更新，请刷新');
  const changes=transition(row,body), audit={at:new Date(),by:actorId,action:body.action,note:body.note.trim()};
  const Model=require('../models/DentalGiftUsage');
  let next;
  if (!row) {
    try { next=await Model.create({_id:idFor(patientId),patientId,enterpriseId:current.enterpriseId,...changes,__v:0,history:[audit]}); }
    catch(e) {if(e.code===11000) fail('权益已被其他工作人员更新，请刷新');throw e;}
  } else next=await Model.findOneAndUpdate({_id:row._id,__v:row.__v,status:row.status},{$set:changes,$inc:{__v:1},$push:{history:audit}},{new:true});
  if(!next) fail('权益已被其他工作人员更新，请刷新');
  return view(next);
}
module.exports={END,idFor,context,view,transition,update};
