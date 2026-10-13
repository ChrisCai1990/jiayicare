const mongoose = require('mongoose');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const ServiceRecord = require('../models/ServiceRecord');
const HealthPlan = require('../models/HealthPlan');
const PlanTemplate = require('../models/PlanTemplate');
const Order = require('../models/Order');
const User = require('../models/User');
const Admin = require('../models/Admin');
const PushRecord = require('../models/PushRecord');
const FollowUp = require('../models/FollowUp');
const {idFor,fail,normalizeEntry,reportText,assertUsableOrder,KINDS,expiryOf} = require('../utils/rehabService');
const writers = ['superadmin','rehabSpecialist'];

async function pushScreening(order, staffId) {
  const qid=order.serviceWorkflowSnapshot?.questionnaireId;
  if (!qid || order.paymentStatus !== 'paid') return null;
  const q=await DynamicQuestionnaire.findOne({_id:qid,status:'active',deletedAt:null});
  if (!q) fail('请在 Admin 启用绑定的运动筛查表',409);
  const _id=idFor(`rehab-screening:${order._id}`);
  await PushRecord.updateOne({_id},{$setOnInsert:{tenantId:order.tenantId,staffId:staffId || order.supervisorId,patientId:order.user,type:'questionnaire',questionnaireId:q._id,sourceOrderId:order._id,title:q.title,content:'请在运动评估前完成筛查表，健管专员将联系您安排预约。'}},{upsert:true});
  await DynamicQuestionnaire.updateOne({_id:q._id},{$addToSet:{targetUsers:order.user}});
  return _id;
}

module.exports = function registerRehabRoutes(router,{staffAuth,getVisiblePlanPatientIds,checkPermission}) {
  async function access(req) {
    if (!mongoose.isValidObjectId(req.params.patientId)) fail('客户编号无效');
    const patient=await User.findById(req.params.patientId).select('tenantId assignedHealthPlanner assignedHealthManager assignedRehabSpecialist');
    if (!patient || String(patient.tenantId || '') !== String(req.staff.tenantId || '')) fail('客户不存在',404);
    const ids=await getVisiblePlanPatientIds(req.staff);
    if(ids && !ids.some(id=>String(id)===String(patient._id)) && !await FollowUp.exists({patientId:patient._id,assignedTo:req.staff._id,workflowKey:/^rehab:/})) fail('无权访问该客户',403);
    return patient;
  }
  function wrap(fn) { return async(req,res)=>{try { const patient=await access(req); const data=await fn(req,patient); res.json({success:true,data}); } catch(e){res.status(e.statusCode || 500).json({success:false,message:e.message});}}; }
  const base='/patients/:patientId/rehab';
  router.get(base,staffAuth,checkPermission('service_records','view'),wrap(async(req,p)=>{
    const [records,orders,templates,questions,plans]=await Promise.all([
      ServiceRecord.find({patientId:p._id,type:'rehab'}).populate('staffId','name role').sort({date:-1}).lean(),
      Order.find({user:p._id,'serviceWorkflowSnapshot.key':'rehab'}).select('serviceName orderNo skuCode paidAt paymentStatus status tradeStatus refundStatus totalUnits usedUnits redemptions scheduledAt currentStage serviceWorkflowSnapshot rehabBooking').sort({createdAt:-1}).lean(),
      PlanTemplate.find({type:'rehab',status:'active'}).lean(),
      DynamicQuestionnaire.find({standardTemplateKey:'rehab_screening_v1',deletedAt:null}).select('title questions').lean(),
      HealthPlan.find({patientId:p._id,type:'rehab'}).sort({createdAt:-1}).lean(),
    ]);
    const responses=await QuestionnaireResponse.find({user:p._id,questionnaire:{$in:questions.map(q=>q._id)}}).sort({submittedAt:-1}).lean();
    const pushes=await PushRecord.find({patientId:p._id,type:'questionnaire',questionnaireId:{$in:questions.map(q=>q._id)}}).select('sourceOrderId questionnaireId createdAt').lean();
    return {records,orders:orders.map(o=>({...o,expiresAt:expiryOf(o)})),templates,questions,responses,pushes,plans};
  }));
  router.post(base+'/screening',staffAuth,checkPermission('questionnaires','send'),wrap(async(req,p)=>{
    if(!['superadmin','healthPlanner','healthManager','rehabSpecialist'].includes(req.staff.role)) fail('当前岗位不能发送运动筛查表',403);
    const order=await Order.findOne({_id:req.body.orderId,user:p._id});
    assertUsableOrder(order);
    return {pushId:await pushScreening(order,req.staff._id)};
  }));
  router.post(base+'/handoff',staffAuth,checkPermission('plans','edit'),wrap(async(req,p)=>{
    if(!['superadmin','healthPlanner'].includes(req.staff.role)) fail('由健康规划师确认接单',403);
    const order=await Order.findOne({_id:req.body.orderId,user:p._id}); assertUsableOrder(order);
    if(!p.assignedHealthManager) fail('请先分配健管专员');
    await FollowUp.updateOne({_id:idFor(`rehab-booking:${order._id}`)},{$setOnInsert:{tenantId:p.tenantId,patientId:p._id,staffId:p.assignedHealthManager,assignedTo:p.assignedHealthManager,sourceType:'order',sourceOrderId:order._id,workflowKey:'rehab:booking',status:'planned',type:'other',theme:'运动服务预约安排',content:'请在客户服务管理的运动管理中安排线上或线下服务并指定运动复健师。'}},{upsert:true});
    await Order.updateOne({_id:order._id,currentStage:{$in:['','intake','pending_intake',null]}},{$set:{currentStage:'rehab_booking',currentAssignee:p.assignedHealthManager}});
    await FollowUp.updateMany({sourceType:'order',sourceOrderId:order._id,$or:[{workflowKey:''},{workflowKey:null}],status:{$in:['planned','in_progress']}},{$set:{status:'completed',completedAt:new Date(),executedContent:'规划师已接单并交健管专员预约'}});
    await pushScreening(order,req.staff._id);
    return {message:'已交健管专员安排预约'};
  }));
  router.post(base+'/booking',staffAuth,checkPermission('plans','edit'),wrap(async(req,p)=>{
    if(!['superadmin','healthManager'].includes(req.staff.role)) fail('由健管专员安排预约',403);
    const order=await Order.findOne({_id:req.body.orderId,user:p._id}); assertUsableOrder(order);
    if(!await FollowUp.exists({_id:idFor(`rehab-booking:${order._id}`)})) fail('请先由健康规划师确认接单',409);
    const at=new Date(req.body.at);
    if(!Number.isFinite(at.getTime()) || !['online','offline'].includes(req.body.mode)) fail('请填写预约时间和服务方式');
    assertUsableOrder(order,at);
    const specialist=await Admin.findOne({_id:req.body.specialistId || p.assignedRehabSpecialist,tenantId:p.tenantId,role:'rehabSpecialist',staffStatus:{$ne:'inactive'}});
    if(!specialist) fail('请先选择有效的运动复健师');
    const sequence=(order.usedUnits || 0)+1;
    const taskId=idFor(`rehab-session:${order._id}:${sequence}`);
    const booked=await Order.updateOne({_id:order._id,updatedAt:order.updatedAt,usedUnits:order.usedUnits},{$set:{scheduledAt:at,status:'scheduled',currentStage:'rehab_session',currentAssignee:specialist._id,rehabBooking:{at,mode:req.body.mode,specialistId:specialist._id,specialistName:specialist.name,sequence,taskId}}});
    if(booked.modifiedCount!==1) fail('订单已变化，请刷新后重新预约',409);
    await FollowUp.updateOne({_id:taskId,status:{$ne:'completed'}},{$set:{patientId:p._id,staffId:specialist._id,assignedTo:specialist._id,sourceType:'order',sourceOrderId:order._id,workflowKey:`rehab:session:${sequence}`,status:'planned',type:req.body.mode==='online'?'video':'visit',date:at,theme:`运动服务第${sequence}次`,content:'在客户基础档案的运动筛查与能力评估中完成评估；在运动服务档案中登记指导与训练。'}},{upsert:true});
    await FollowUp.updateOne({_id:idFor(`rehab-booking:${order._id}`)},{$set:{status:'completed',completedAt:new Date(),executedContent:'已安排运动服务预约'}});
    return {message:'预约已安排'};
  }));
  router.post(base+'/records',staffAuth,checkPermission('service_records','create'),wrap(async(req,p)=>{
    if(!writers.includes(req.staff.role)) fail('仅运动复健师可以填写和发布运动记录',403);
    const publish=req.body.publish===true;
    const entry=normalizeEntry(req.body,publish);
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(req.body.requestId || '')) fail('缺少保存标识，请重新打开表单');
    if(entry.orderId) {
      const order=await Order.findOne({_id:entry.orderId,user:p._id});
      if(!order || order.serviceWorkflowSnapshot?.key!=='rehab') fail('请选择该客户的运动服务订单');
      if(publish && order.status !== 'completed') assertUsableOrder(order);
    }
    if(entry.planId && !await HealthPlan.exists({_id:entry.planId,patientId:p._id,type:'rehab'})) fail('方案不属于该客户');
    if(entry.screeningResponseId && !await QuestionnaireResponse.exists({_id:entry.screeningResponseId,user:p._id})) fail('筛查答卷不属于该客户');
    const template=await PlanTemplate.findOne({type:'rehab',status:'active','content.purpose':'assessment_report'}).lean();
    let text=reportText(entry,template?.content);
    const _id=req.body.recordId || idFor(`rehab-record:${p._id}:${req.body.requestId}`);
    if(!mongoose.isValidObjectId(_id)) fail('记录编号无效');
    const existing=await ServiceRecord.findOne({_id,patientId:p._id,type:'rehab'});
    if(req.body.recordId && !existing) fail('记录不存在',404);
    if(existing && String(existing.staffId)!==String(req.staff._id)) fail('无权修改他人的记录',403);
    if(existing?.structuredContent?.rehab?.status==='published') {
      if(JSON.stringify(normalizeEntry(existing.structuredContent.rehab,true))!==JSON.stringify(entry)) fail('已发布记录不能覆盖，请新增复评或补充记录',409);
      text=existing.content;
    } else {
      const data={tenantId:p.tenantId,staffId:req.staff._id,patientId:p._id,type:'rehab',date:entry.date,title:KINDS[entry.kind],content:text,result:entry.fields.findings || entry.fields.response,structuredContent:{rehab:{...entry,status:publish?'published':'draft',publishedAt:publish?new Date():null,templateId:template?._id || null}}};
      if(existing) {
        const updated=await ServiceRecord.updateOne({_id,'structuredContent.rehab.status':'draft'},{$set:data});
        if(updated.modifiedCount!==1) fail('记录已变化，请刷新核对',409);
      } else {try {await ServiceRecord.create({_id,...data});} catch(e){if(e.code===11000) fail('记录已保存，请刷新核对',409); throw e;}}
    }
    if(publish) await PushRecord.updateOne({_id:idFor(`rehab-report:${_id}`)},{$setOnInsert:{tenantId:p.tenantId,staffId:req.staff._id,patientId:p._id,type:'notice',title:KINDS[entry.kind]+'报告',content:text,sourceOrderId:entry.orderId}},{upsert:true});
    return {id:_id,published:publish};
  }));
  router.post(base+'/redeem',staffAuth,checkPermission('service_records','edit'),wrap(async(req,p)=>{
    const order=await Order.findOne({_id:req.body.orderId,user:p._id});
    if(!order) fail('订单不存在',404);
    const result=await require('../utils/rehabRedemption').redeem(order,req.staff,req.body.recordId,{Order,ServiceRecord});
    {
      await FollowUp.updateOne({_id:idFor(`rehab-session:${order._id}:${result.redemption.sequence}`)},{$set:{status:'completed',completedAt:new Date(),executedContent:result.redemption.note}});
      if(result.order.status==='completed') {
        await FollowUp.updateMany({sourceType:'order',sourceOrderId:order._id,status:{$nin:['completed','cancelled']}},{$set:{status:'completed',completedAt:new Date()}});
        await require('../utils/commissionSettlement').settleOrderCommission(result.order);
        await require('../utils/packageServiceRedemption').safeReconcilePackageOrder(result.order);
      } else if(result.order.currentStage==='rehab_booking') {
        await FollowUp.updateOne({_id:idFor(`rehab-booking:${order._id}`)},{$set:{status:'planned',completedAt:null,date:new Date(),executedContent:'',content:'请联系客户安排下一次运动服务'}});
        await Order.updateOne({_id:order._id,currentStage:'rehab_booking'},{$set:{currentAssignee:p.assignedHealthManager}});
      }
      await require('../models/Fulfillment').updateOne({order:order._id},{$set:{status:result.order.status==='completed'?'completed':'in_service',...(result.order.status==='completed'?{completedAt:result.order.completedAt}:{})}});
    }
    return {message:result.already?'本次已经核销':'本次服务已核销',usedUnits:result.order.usedUnits,totalUnits:result.order.totalUnits};
  }));
  router.post(base+'/plans',staffAuth,checkPermission('plans','create'),require('../middleware/checkPermission').checkPlanType(()=>'rehab'),wrap(async(req,p)=>{
    if(!writers.includes(req.staff.role)) fail('由运动复健师制定并发布方案',403);
    const {goal,exercises,weeklyFreq,precautions,progression,duration}=req.body;
    if([goal,exercises,weeklyFreq,precautions].some(v=>typeof v!=='string'||!v.trim())) fail('请填写目标、训练安排、频次和注意事项');
    if([goal,exercises,weeklyFreq,precautions,progression,duration].some(v=>v && (typeof v!=='string'||v.length>6000))) fail('方案内容格式无效');
    let order=null;
    if(req.body.orderId){order=await Order.findOne({_id:req.body.orderId,user:p._id});assertUsableOrder(order);}
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(req.body.requestId || '')) fail('缺少保存标识');
    const _id=idFor(`rehab-plan:${p._id}:${req.body.requestId}`);
    const content={goal,exercises,weeklyFreq,precautions,progression:progression||'',duration:duration||'',serviceMode:'线上或线下',rehabPlanVersion:1};
    const previous=await HealthPlan.findById(_id).lean();
    if(previous && (String(previous.staffId)!==String(req.staff._id) || JSON.stringify(previous.content)!==JSON.stringify(content))) fail('该方案已发布，请刷新后新建调整方案',409);
    const items=Object.entries({目标:goal,训练安排:exercises,频次:weeklyFreq,每次时长:duration||'预约时确认',注意事项:precautions,进阶与复评:progression||''}).filter(([,v])=>v).map(([name,v])=>({name:name+'：'+v,category:'运动复健'}));
    await HealthPlan.updateOne({_id},{$setOnInsert:{patientId:p._id,staffId:req.staff._id,type:'rehab',title:'个性化运动与复健方案',status:'active',pushedAt:new Date(),sourceOrderId:order?._id || null,content,items,summary:goal}},{upsert:true,runValidators:true});
    await PushRecord.updateOne({_id:idFor(`rehab-plan-push:${_id}`)},{$setOnInsert:{tenantId:p.tenantId,staffId:req.staff._id,patientId:p._id,type:'plan',planId:_id,title:'个性化运动与复健方案',content:items.map(i=>i.name).join('\n\n')}},{upsert:true});
    return {id:_id};
  }));
};
module.exports.pushScreening=pushScreening;
