const express=require('express'), mongoose=require('mongoose');
const User=require('../models/User'), Review=require('../models/ManagementReview');
const Phase=require('../models/PhaseAssessment'), Monthly=require('../models/MonthlyServiceReview');
const policy=require('../utils/managementReviewPolicy');
const router=express.Router();
const fail=(message,code=400)=>{throw Object.assign(new Error(message),{statusCode:code});};
const text=(x,max=1200)=>{if(typeof x!=='string'||x.length>max)fail('请填写规定长度内的内容');return x.trim();};
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.statusCode||(e.code===11000?409:500)).json({success:false,message:e.code===11000?'该周期已建立，请刷新':e.message});}};
async function userFor(req) {
 if(!mongoose.isValidObjectId(req.params.id))fail('客户不存在',404);
 const u=await User.findOne({_id:req.params.id,isDeleted:{$ne:true}}).lean();
 if(!u||!policy.enabled(u._id))fail('该客户未进入新复盘试点',404);
 if(!policy.canRead(u,req.staff))fail('仅所属服务团队可访问',403);return u;
}
async function sources(user,period) {
 const range={$gte:new Date(period.start+'T00:00:00+08:00'),$lt:new Date(Date.parse(period.end+'T00:00:00+08:00')+86400000)};
 const [phase,monthly,plans,followups,reports,services]=await Promise.all([
 Phase.find({patientId:user._id}).select('periodKey periodLabel status content createdAt finalizedAt').sort({createdAt:1}).lean(),
 Monthly.find({patientId:user._id,month:{$gte:period.start.slice(0,7),$lte:period.end.slice(0,7)}}).lean(),
 require('../models/HealthPlan').find({patientId:user._id,createdAt:{$lt:range.$lt}}).select('type title items content createdAt startDate endDate status').sort({createdAt:-1}).limit(40).lean(),
 require('../models/FollowUp').find({patientId:user._id,date:range}).select('date theme status executedContent').sort({date:1}).limit(200).lean(),
 require('../models/MedicalReport').find({user:user._id,audit_status:'audited',checkDate:{$gte:period.start,$lte:period.end}}).select('title checkDate reportItems').sort({checkDate:1}).limit(100).lean(),
 require('../models/ServiceRecord').find({patientId:user._id,date:range}).select('date title type content').sort({date:1}).limit(100).lean()
 ]);
 return {phase:phase.filter(x=>period.kind!=='monthly'||String(x.periodKey).startsWith(period.start.slice(0,7))),monthly,plans,followups,reports,services,note:'来源供人工核对；方案和服务状态不自动等同目标达成。列表有上限，请结合客户完整档案核对。'};
}
router.get('/patients/:id/management-reviews',wrap(async(req,res)=>{
 if(!policy.enabled(req.params.id))return res.json({success:true,enabled:false});
 const user=await userFor(req), rows=await Review.find({patientId:user._id}).sort({start:1}).lean();
 res.json({success:true,enabled:true,data:{patientName:user.name,serviceStart:user.serviceStartDate,serviceEnd:user.serviceExpiry,periods:policy.periods(user),rows,labels:policy.labels,assigned:Object.fromEntries(Object.entries(policy.fields).map(([r,f])=>[r,!!user[f]])),canReview:policy.advisor(user,req.staff),role:req.staff.role}});
}));
router.get('/patients/:id/management-reviews/sources',wrap(async(req,res)=>{const user=await userFor(req),period=policy.periods(user).find(x=>x.key===req.query.period);if(!period)fail('周期无效');res.json({success:true,data:await sources(user,period)});}));
router.post('/patients/:id/management-reviews',wrap(async(req,res)=>{
 const user=await userFor(req), period=policy.periods(user).find(x=>x.key===req.body.periodKey);
 if(!period||!period.due)fail('该周期尚未结束或注册未满一个月');
 if(period.kind!=='monthly'&&!policy.advisor(user,req.staff))fail('季度和年度由健康顾问发起分发',403);
 if(period.kind==='monthly'&&!['familyDoctor','nutritionist','healthManager','rehabSpecialist','superadmin'].includes(req.staff.role))fail('无权发起',403);
 const existing=await Review.findOne({patientId:user._id,periodKey:period.key});if(existing)return res.json({success:true,data:existing});
 const roles=['nutritionist','healthManager'];
 if(period.kind!=='monthly')roles.push('familyDoctor');
 const rehabPlan=await require('../models/HealthPlan').exists({patientId:user._id,type:'rehab',status:{$in:['active','completed']},pushedAt:{$ne:null,$lt:new Date(period.end+'T23:59:59+08:00')},$or:[{endDate:null},{endDate:{$gte:new Date(period.start+'T00:00:00+08:00')}}]});
 if(rehabPlan&&period.kind==='monthly')roles.push('rehabSpecialist');
 if(req.body.includeRehab){if(!policy.advisor(user,req.staff))fail('运动复健参与由顾问确认',403);if(!text(req.body.rehabBasis||''))fail('请填写运动复健指导意见依据');if(!roles.includes('rehabSpecialist'))roles.push('rehabSpecialist');}
 for(const role of [...roles,'familyDoctor'])if(!user[policy.fields[role]])fail('请先分配'+policy.labels[role]);
 const focus=text(req.body.focus||'',200);if(!focus)fail('请填写本周期重点');
 const questions={};for(const role of roles){questions[role]=text(req.body.questions?.[role]||'');if(period.kind!=='monthly'&&!questions[role])fail('请明确分发给'+policy.labels[role]+'的问题');}
 const origin=await sources(user,period);
 const row=await Review.create({patientId:user._id,periodKey:period.key,kind:period.kind,label:period.label,start:period.start,end:period.end,focus,roles,questions,sources:{phase:origin.phase.map(x=>x._id),monthly:origin.monthly.map(x=>x._id)},audit:[{action:'created',by:req.staff._id,at:new Date(),note:req.body.includeRehab?req.body.rehabBasis:''}]});res.status(201).json({success:true,data:row});
}));
router.post('/patients/:id/management-reviews/:reviewId/:action',wrap(async(req,res)=>{
 const user=await userFor(req), row=await Review.findOne({_id:req.params.reviewId,patientId:user._id}).lean();if(!row)fail('复盘不存在',404);
 if(req.body.revision!==row.__v)fail('内容已更新，请刷新',409);
 const action=req.params.action, role=req.body.role||req.staff.role, now=new Date();let set={},note='',snapshot=null;
 if(action==='complete-action') {
  const item=row.actions.find(x=>policy.id(x._id)===req.body.actionId);if(!item||row.status!=='finalized'||item.status==='completed')fail('行动状态已改变',409);
  if(!policy.assigned(user,req.staff,item.role))fail('仅对应岗位负责人可完成行动',403);
  set.actions=row.actions.map(x=>policy.id(x._id)===req.body.actionId?{...x,status:'completed',completedAt:now,completedBy:req.staff._id}:x);
 } else {
 if(row.status==='finalized')fail('已审核归档，请保留原结论',409);
 if(action==='submit') {
  if(!policy.assigned(user,req.staff,role)||!row.roles.includes(role))fail('仅对应岗位本人可提交',403);
  if(row.status!=='collecting')fail('已提交顾问审核',409);
  const value={};for(const field of ['action','execution','reason','impact','feedback','evidence','next'])value[field]=text(req.body.contribution?.[field]||'');
  value.state=req.body.contribution?.state;if(!['completed','partial','not_done','unknown','not_applicable'].includes(value.state))fail('请选择执行状态');
  if(!value.action||!value.execution||!value.evidence||!value.feedback||!value.next)fail('请补充行动、执行情况、依据、客户反馈和下一步；未知请明确说明');
  if(['partial','not_done','unknown'].includes(value.state)&&(!value.reason||!value.impact))fail('未完成或待核实事项须说明原因与影响');
  snapshot=row.contributions?.[role];set.contributions={...row.contributions,[role]:{...value,status:'submitted',by:req.staff._id,at:now}};
  set.status=row.roles.every(r=>set.contributions[r]?.status==='submitted')?'advisor_review':'collecting';
 } else if(action==='return') {
  if(!policy.advisor(user,req.staff))fail('仅健康顾问可退回',403);if(!row.roles.includes(role))fail('岗位无效');note=text(req.body.note||'');if(!note)fail('请填写退回原因');
  snapshot=row.contributions?.[role];set.contributions={...row.contributions,[role]:{...snapshot,status:'returned',returnNote:note}};set.status='collecting';
 } else if(action==='add-role') {
  if(!policy.advisor(user,req.staff))fail('仅健康顾问可分发',403);
  if(!policy.fields[role]||!user[policy.fields[role]]||row.roles.includes(role))fail('请选择已分配且尚未参与的岗位');
  note=text(req.body.note||'');if(!note)fail('请填写分发问题及指导依据');set.roles=[...row.roles,role];set.questions={...row.questions,[role]:note};set.status='collecting';
 } else if(action==='finalize') {
  if(!policy.advisor(user,req.staff))fail('仅健康顾问可审核',403);
  if(row.status!=='advisor_review'||!row.roles.every(r=>row.contributions?.[r]?.status==='submitted'))fail('各岗位尚未完成提交',409);
  if(!policy.periods(user).some(x=>x.key===row.periodKey&&x.due))fail('该周期尚未到期');
  set.summary=text(req.body.summary||'');if(!set.summary)fail('请填写审核结论');set.nextPlan=text(req.body.nextPlan||'',4000);if(row.kind==='annual'&&!set.nextPlan)fail('年度总评须形成下一年度目标、行动和评估节点');
  if(!Array.isArray(req.body.actions)||req.body.actions.length>15)fail('行动清单最多15项');
  set.actions=req.body.actions.map(a=>({title:text(a.title,200),role:a.role,dueAt:a.dueAt,status:'pending'}));
  if(set.actions.some(a=>!a.title||!policy.fields[a.role]||!user[policy.fields[a.role]]||!/^\d{4}-\d{2}-\d{2}$/.test(a.dueAt)||a.dueAt<policy.day(now)))fail('行动须有有效责任岗位和今天或之后的期限');
  set.status='finalized';set.finalizedAt=now;set.finalizedBy=req.staff._id;
 } else fail('操作不存在',404);
 }
 const updated=await Review.findOneAndUpdate({_id:row._id,__v:row.__v,status:row.status},{$set:set,$inc:{__v:1},$push:{audit:{action,role,by:req.staff._id,at:now,note,snapshot}}},{new:true,runValidators:true});if(!updated)fail('记录已更新，请刷新',409);res.json({success:true,data:updated});
}));
async function workbench(staff){
 const ids=String(process.env.MANAGEMENT_REVIEW_PATIENT_IDS||'').split(',').filter(x=>mongoose.isValidObjectId(x)&&policy.enabled(x));
 const users=await User.find({_id:{$in:ids},isDeleted:{$ne:true}}).lean(),pending=[],actions=[];
 for(const user of users){if(!policy.canRead(user,staff))continue;const rows=await Review.find({patientId:user._id}).lean();for(const period of policy.periods(user).filter(x=>x.due)){
  const row=rows.find(x=>x.periodKey===period.key);let title='';
  if(!row&&(policy.advisor(user,staff)||(period.kind==='monthly'&&['nutritionist','healthManager'].includes(staff.role))))title=period.kind==='monthly'?'建立月度复盘':'分发团队评估';
  else if(row&&policy.pendingRole(row,staff.role)&&policy.assigned(user,staff))title='提交'+policy.labels[staff.role]+'复盘';
  else if(row?.status==='advisor_review'&&policy.advisor(user,staff))title='健康顾问审核';
  if(title)pending.push({annualPlanId:'cycle',patientId:user._id,patientName:user.name,month:period.key,label:period.label+' · '+title,reviewId:row?._id});
 }
 for(const row of rows.filter(x=>x.status==='finalized'))for(const a of row.actions||[])if(a.status==='pending'&&policy.assigned(user,staff,a.role))actions.push({reviewId:row._id,annualPlanId:'cycle',patientId:user._id,month:row.periodKey,actionId:a._id,title:a.title,dueAt:a.dueAt});
 }return {pending,actions};
}
module.exports={router,workbench};
