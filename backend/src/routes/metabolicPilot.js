const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Pilot = require('../models/MetabolicPilot');
const SystemConfig = require('../models/SystemConfig');
const { tenantFilter, configId, configFor, contextFor, historyFor } = require('../utils/metabolicPilot');
const { VERSION, DAY, ACTIONS, stateOf, feedbackFor, summaryFor } = require('../utils/metabolicPilotRules');
const fail = (res, status, message) => res.status(status).json({ success: false, message });
const okay = (res, data) => res.json({ success: true, data });
const wrap = fn => async (req,res,next) => { try { await fn(req,res,next); } catch (err) {
  if (err.name === 'VersionError') return fail(res,409,'状态已变化，请刷新后重试');
  if (err.code === 11000) return fail(res,409,'记录已存在，请刷新后重试');
  if (err.name === 'ValidationError' || err.name === 'CastError') return fail(res,400,'输入内容或记录标识无效');
  console.error('[metabolic-pilot]', err.name); return fail(res,503,'暂时无法完成操作，请稍后重试');
} };
const audit = (row, actor, action, note = '', minutes = 0) => {
  row.history.push({ at: new Date(), actor: String(actor._id), action, note, minutes });
};
function supervisor(req,res,next) {
  if (!['superadmin','platformSuper'].includes(req.admin.role)) return fail(res,403,'仅超级管理员可配置体重管理试点');
  next();
}
function scopeFor(staff) {
  const filter = { ...tenantFilter(staff), isDeleted: { $ne: true } };
  if (staff.role === 'superadmin') return filter;
  const field = { healthManager: 'assignedHealthManager', familyDoctor: 'assignedFamilyDoctor', nutritionist: 'assignedNutritionist' }[staff.role];
  return field ? { ...filter, [field]: staff._id } : { ...filter, _id: null };
}
const activeManager = (id, actor) => id && Admin.findOne({ _id: id, ...tenantFilter(actor), role: 'healthManager', staffStatus: { $ne: 'inactive' } }).select('_id name').lean();
const ownerIdFor = (row, user) => String(row.help?.assignedTo || user?.assignedHealthManager || '');
router.use('/admin', adminAuth, supervisor);
router.get('/admin', wrap(async(req,res) => {
  const [config, rows] = await Promise.all([configFor(req.admin), Pilot.find(tenantFilter(req.admin)).sort({createdAt:-1}).limit(200).lean()]);
  const users = await User.find({ _id: {$in:rows.map(r=>r._id)}, ...tenantFilter(req.admin), isDeleted:{$ne:true} }).select('name phone assignedHealthManager').lean();
  okay(res,{config,rows:rows.filter(r=>users.some(u=>String(u._id)===String(r._id))).map(r=>({...r,state:stateOf(r),user:users.find(u=>String(u._id)===String(r._id))})),version:VERSION});
}));
router.put('/admin/config', wrap(async(req,res) => {
  const {enabled,accepting,revision} = req.body;
  if (typeof enabled !== 'boolean' || typeof accepting !== 'boolean' || !Number.isInteger(revision) || revision<0) return fail(res,400,'开关或版本号无效');
  const saved=await SystemConfig.findOneAndUpdate({key:configId(req.admin),'value.revision':revision},{$set:{value:{enabled,accepting,revision:revision+1,updatedBy:String(req.admin._id),updatedAt:new Date()},label:'体重代谢管理白名单试点'}},{upsert:revision===0,new:true});
  if (!saved) return fail(res,409,'开关已被其他管理员修改，请刷新后重试');
  okay(res,{enabled,accepting,revision:revision+1});
}));
router.post('/admin/invite', wrap(async(req,res) => {
  const identity = String(req.body.identity || '').trim();
  const eligibilityNote = String(req.body.eligibilityNote || '').trim();
  if (req.body.eligibilityConfirmed !== true || eligibilityNote.length < 5 || eligibilityNote.length > 500) return fail(res,400,'请确认已核对试点适配性，并填写5—500字依据');
  const selector = /^[a-f\d]{24}$/i.test(identity) ? {_id:identity} : /^1\d{10}$/.test(identity) ? {phone:identity} : null;
  if (!selector) return fail(res,400,'请输入完整手机号或客户ID');
  const user = await User.findOne({...selector,...tenantFilter(req.admin),isDeleted:{$ne:true}}).lean();
  if (!user) return fail(res,404,'未找到本机构有效客户');
  if (!user.assignedHealthManager) return fail(res,409,'请先为客户配置健管专员，以便承接求助');
  const row = await Pilot.findOne({_id:user._id,...tenantFilter(req.admin)});
  if (row) return fail(res,409,'该客户已有试点记录，请在名单中管理，不重复入组');
  const access=await require('../utils/serviceAccess').resolveServiceAccess(user);
  if (!access.active) return fail(res,409,'客户现有服务状态不支持健康数据录入，请先核对服务期后再邀请');
  const created = await Pilot.create({_id:user._id,...tenantFilter(req.admin),allowed:true,status:'invited',version:VERSION,
    invitedAt:new Date(),eligibilityConfirmedBy:req.admin._id,eligibilityNote,
    history:[{at:new Date(),actor:String(req.admin._id),action:'invite',note:eligibilityNote}]});
  okay(res,{id:created._id,name:user.name});
}));
router.patch('/admin/:id', wrap(async(req,res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res,400,'客户ID无效');
  const row = await Pilot.findOne({_id:req.params.id,...tenantFilter(req.admin)});
  if (!row) return fail(res,404,'试点记录不存在');
  const action = req.body.action;
  if (action==='revoke') row.allowed=false;
  else if (action==='restore' && !['withdrawn','completed'].includes(stateOf(row))) row.allowed=true;
  else return fail(res,400,'不支持该状态变更');
  audit(row,req.admin,action); await row.save(); okay(res,{state:stateOf(row),allowed:row.allowed});
}));

router.use('/staff',staffAuth);
router.get('/staff',wrap(async(req,res)=>{
  if (req.staff.customPermissions && !req.staff.customPermissions.daily_checkin?.view) return fail(res,403,'无健康数据查看权限');
  const users=await User.find(scopeFor(req.staff)).select('_id name assignedHealthManager').lean();
  const owned=req.staff.role==='healthManager'
    ? await Pilot.find({...tenantFilter(req.staff),'help.status':'open','help.assignedTo':req.staff._id}).select('_id').lean() : [];
  const ids=[...new Set([...users.map(u=>String(u._id)),...owned.map(r=>String(r._id))])];
  const visibleUsers=owned.length ? await User.find({...tenantFilter(req.staff),_id:{$in:ids},isDeleted:{$ne:true}}).select('_id name assignedHealthManager').lean() : users;
  const rows=await Pilot.find({...tenantFilter(req.staff),_id:{$in:visibleUsers.map(u=>u._id)}}).sort({'help.status':-1,'help.requestedAt':-1}).limit(200).lean();
  const include=mongoose.isValidObjectId(req.query.include)?String(req.query.include):null;
  if(include&&visibleUsers.some(u=>String(u._id)===include)&&!rows.some(r=>String(r._id)===include)){
    const extra=await Pilot.findOne({_id:include,...tenantFilter(req.staff)}).lean();
    if(extra)rows.push(extra);
  }
  const ownerIds=[...new Set(rows.map(r=>ownerIdFor(r,visibleUsers.find(u=>String(u._id)===String(r._id)))).filter(Boolean))];
  const owners=await Admin.find({...tenantFilter(req.staff),_id:{$in:ownerIds}}).select('_id name role staffStatus').lean();
  okay(res,rows.map(r=>{
    const user=visibleUsers.find(u=>String(u._id)===String(r._id));
    const assignedTo=ownerIdFor(r,user);
    const owner=owners.find(a=>String(a._id)===assignedTo && a.role==='healthManager' && a.staffStatus!=='inactive');
    return {...r,state:stateOf(r),user,owner:owner?{id:String(owner._id),name:owner.name}:null,canAssign:req.staff.role==='superadmin',
      canResolve:req.staff.role==='superadmin'||(r.help?.status==='open'&&String(req.staff._id)===assignedTo)};
  }));
}));
router.get('/staff/owners',wrap(async(req,res)=>{
  if(req.staff.role!=='superadmin') return fail(res,403,'仅机构管理员可调整责任人');
  okay(res,await Admin.find({...tenantFilter(req.staff),role:'healthManager',staffStatus:{$ne:'inactive'}}).select('_id name').sort({name:1}).lean());
}));
router.post('/staff/:id/assign',wrap(async(req,res)=>{
  if(req.staff.role!=='superadmin') return fail(res,403,'仅机构管理员可调整责任人');
  if(!mongoose.isValidObjectId(req.params.id)) return fail(res,400,'客户ID无效');
  const owner=await activeManager(req.body.assignedTo,req.staff);
  if(!owner) return fail(res,400,'请选择本机构在职健管专员');
  const row=await Pilot.findOne({_id:req.params.id,...tenantFilter(req.staff)});
  if(!row || row.help?.status!=='open' || String(row.revision)!==String(req.body.revision)) return fail(res,409,'待办已更新，请刷新后再处理');
  row.help.assignedTo=owner._id;
  audit(row,req.staff,'assign',`责任人：${owner.name}`);
  await row.save(); okay(res,{assignedTo:String(owner._id)});
}));
router.post('/staff/:id/resolve',wrap(async(req,res)=>{
  if (req.staff.customPermissions && !req.staff.customPermissions.daily_checkin?.edit) return fail(res,403,'无健康数据处理权限');
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res,400,'客户ID无效');
  const user=await User.findOne({_id:req.params.id,...tenantFilter(req.staff),isDeleted:{$ne:true}}).select('_id assignedHealthManager').lean();
  if (!user || !['superadmin','healthManager'].includes(req.staff.role)) return fail(res,403,'无权处理该客户');
  const row=await Pilot.findOne({_id:user._id,...tenantFilter(req.staff)});
  if(req.staff.role!=='superadmin' && ownerIdFor(row||{},user)!==String(req.staff._id)) return fail(res,403,'请由本次求助责任人处理');
  const reply=String(req.body.reply||'').trim(), minutes=Number(req.body.minutes);
  if (!reply || reply.length>1000 || !Number.isFinite(minutes) || minutes<0 || minutes>480) return fail(res,400,'请填写处理结果，处理时长须在0—480分钟内');
  if (!row || row.help?.status!=='open' || String(row.revision)!==String(req.body.revision)) return fail(res,409,'待办已更新，请刷新后再处理');
  row.help.status='closed'; row.help.reply=reply; row.help.closedAt=new Date(); row.help.closedBy=req.staff._id;
  row.humanMinutes+=minutes; audit(row,req.staff,'resolve',reply,minutes); await row.save(); okay(res,{resolved:true});
}));

router.use('/me',auth);
router.get('/me',wrap(async(req,res)=>{
  const {config,enrollment}=await contextFor(req.user);
  if (!enrollment) return okay(res,{available:false});
  // Always allow the enrolled user to read status/history or withdraw when delivery is paused.
  const available=config.enabled && enrollment.allowed;
  const rows=await historyFor(req.user,enrollment);
  const summary=summaryFor(enrollment,rows);
  const active=available && summary.state==='active';
  const last=rows[0];
  const latestWeight=rows.find(r=>r.type==='weight');
  const lastAt=latestWeight && new Date(latestWeight.recordedAt);
  const helpOwner=enrollment.help?.status ? await activeManager(enrollment.help.assignedTo||req.user.assignedHealthManager,req.user) : null;
  okay(res,{available,accepting:config.accepting,status:summary.state,version:enrollment.version,
    startedAt:enrollment.startedAt,endsAt:enrollment.endsAt,goal:enrollment.goal,
    reminderEnabled:enrollment.reminderEnabled,reminderEveryDays:enrollment.reminderEveryDays,
    reminder:active && enrollment.reminderEnabled && (!lastAt || Date.now()-lastAt>=enrollment.reminderEveryDays*DAY)
      ? '如果现在方便，可以记录一次体重，了解最近的变化。也可以稍后再记录。' : '',
    summary,feedback:active && last ? feedbackFor(last,rows) : null,actionChoice:enrollment.actionChoice,
    help:enrollment.help,helpOwner:helpOwner?.name||null,actions:ACTIONS});
}));
router.post('/me',wrap(async(req,res)=>{
  const {config,enrollment}=await contextFor(req.user);
  if (!enrollment) return fail(res,403,'本服务仅向已邀请客户开放');
  const row=await Pilot.findOne({_id:req.user._id,...tenantFilter(req.user)});
  const action=req.body.action, state=stateOf(row);
  if (action==='read-help-reply') {
    const closedAt=new Date(req.body.closedAt);
    if (Number.isNaN(closedAt.getTime())) return fail(res,400,'回复时间无效');
    const sameReply=row.help?.status==='closed' && row.help.closedAt?.getTime()===closedAt.getTime();
    if (!sameReply) return fail(res,409,'回复已更新，请刷新后查看');
    if (!row.help.readAt) {
      const result=await Pilot.updateOne({_id:row._id,...tenantFilter(req.user),'help.status':'closed','help.closedAt':closedAt,'help.readAt':null},{$set:{'help.readAt':new Date()}});
      if (!result.modifiedCount) {
        const latest=await Pilot.findOne({_id:row._id,...tenantFilter(req.user)});
        if (latest?.help?.status!=='closed'||latest.help.closedAt?.getTime()!==closedAt.getTime()||!latest.help.readAt) return fail(res,409,'回复已更新，请刷新后查看');
      }
    }
    return okay(res,{read:true});
  }
  if (action==='withdraw') { row.status='withdrawn'; row.reminderEnabled=false; }
  else {
    if (!config.enabled || !row.allowed) return fail(res,403,'试点暂未开放或已暂停');
    if (action==='start') {
      if (state==='active') return okay(res,{state});
      if (!config.accepting || state!=='invited' || req.body.consent!==true) return fail(res,409,'当前不能入组，请确认服务说明或联系健管专员');
      const access=await require('../utils/serviceAccess').resolveServiceAccess(req.user);
      if (!access.active || !req.user.assignedHealthManager) return fail(res,409,'请先联系团队核对服务期及所属健管专员');
      row.status='active'; row.startedAt=new Date(); row.endsAt=new Date(row.startedAt.getTime()+84*DAY); row.consentAt=new Date();
      row.goal=String(req.body.goal||'了解自己的体重变化，找到适合自己的健康习惯').slice(0,200);
    } else if (action==='pause' && state==='active') row.status='paused';
    else if (action==='resume' && state==='paused' && new Date(row.endsAt)>new Date()) row.status='active';
    else if (action==='preferences' && ['active','paused'].includes(state)) {
      if (typeof req.body.reminderEnabled!=='boolean' || ![1,3,7].includes(req.body.reminderEveryDays)) return fail(res,400,'请选择有效提醒偏好');
      row.reminderEnabled=req.body.reminderEnabled; row.reminderEveryDays=req.body.reminderEveryDays;
    } else if (action==='choose' && state==='active') {
      if (!ACTIONS.some(a=>a.id===req.body.id) || !['try','later','unsuitable'].includes(req.body.choice)) return fail(res,400,'行动选择无效');
      row.actionChoice={id:req.body.id,choice:req.body.choice,at:new Date()};
    } else if (action==='reflect' && ['active','completed'].includes(state)) {
      const day=Number(req.body.day),text=String(req.body.text||'').trim();
      if (![28,56,84].includes(day) || !row.startedAt || Date.now()-new Date(row.startedAt)<day*DAY || !text || text.length>1000) return fail(res,400,'复评节点未到或感受内容无效');
      row.reflections=row.reflections.filter(r=>r.day!==day); row.reflections.push({day,text,at:new Date()});
    } else if (action==='help' && ['active','paused','completed'].includes(state)) {
      const message=String(req.body.message||'').trim();
      if (!message || message.length>1000) return fail(res,400,'请填写需要帮助的内容（最多1000字）');
      if (row.help?.status==='open') return fail(res,409,'已有求助正在处理中，请查看处理状态');
      const owner=await activeManager(req.user.assignedHealthManager,req.user);
      if(!owner) return fail(res,409,'暂无法确定负责的健管专员，请联系机构管理员核对归属；本次求助尚未提交');
      row.help={status:'open',requestedAt:new Date(),message,assignedTo:owner._id,source:'health_data_page'};
    } else return fail(res,409,'当前状态不支持此操作');
  }
  audit(row,req.user,action,action==='help'?row.help.message:action==='reflect'?String(req.body.text):action==='choose'?`${row.actionChoice.id}:${row.actionChoice.choice}`:action==='preferences'?`reminder=${row.reminderEnabled};every=${row.reminderEveryDays}`:'');
  await row.save(); okay(res,{state:stateOf(row)});
}));
module.exports=router;
