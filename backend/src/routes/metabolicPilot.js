const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Pilot = require('../models/MetabolicPilot');
const { tenantFilter, configFor } = require('../utils/metabolicPilot');
const { VERSION, stateOf } = require('../utils/metabolicPilotRules');
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
  return fail(res,410,'体重与代谢管理试点已结束');
}));
router.post('/admin/invite', wrap(async(req,res) => {
  return fail(res,410,'体重与代谢管理试点已结束');
}));
router.patch('/admin/:id', wrap(async(req,res) => {
  if (req.body.action === 'restore') return fail(res,410,'体重与代谢管理试点已结束');
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
  // Older installed clients hide the pilot card when status is absent.
  okay(res,{available:false,retired:true});
}));
router.post('/me',wrap(async(req,res)=>{
  fail(res,410,'体重与代谢管理试点已结束，健康记录仍可正常使用');
}));
module.exports=router;
