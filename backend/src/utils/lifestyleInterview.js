const crypto=require('crypto');
const {FIELD_MAP}=require('../config/archiveFields');
const {normalizeValue,getByPath,answerToText}=require('./archiveImport');
const {effectiveLifestyle}=require('./effectiveLifestyle');
const QUESTIONNAIRE_ID='6a49eab9fc1595013da70645';
const fail=(message,statusCode=409)=>Object.assign(new Error(message),{statusCode});
const fingerprint=user=>crypto.createHash('sha256').update(JSON.stringify({lifestyle:effectiveLifestyle(user),history:user.lifestyleHistory,archive:user.archiveVersionHistory})).digest('hex');
const present=v=>v!==undefined&&v!==null&&v!==''&&(!Array.isArray(v)||v.length>0)&&(typeof v!=='object'||Array.isArray(v)||('values' in v?v.values.length>0:('value' in v?!!v.value:Object.values(v).some(present))));
function prepare(user,template,body) {
 if(!Array.isArray(body.confirmed||[]))throw fail('核实项格式无效',400);
 const answers=body.answers||{},confirmed=new Set(body.confirmed||[]),items=[];
 if(typeof answers!=='object'||Array.isArray(answers)||JSON.stringify(answers).length>100000)throw fail('问卷格式无效',400);
 const safe={},pending=[];
 for(const q of require('../../../shared/lifestyleInterview.cjs').visibleQuestions(template.questions,answers,user.gender)) {
  if(Object.hasOwn(answers,q.id))safe[q.id]=answers[q.id];
  if(!confirmed.has(q.id)||!present(answers[q.id])) {pending.push(q.id);continue;}
  if(['number','scale'].includes(q.type)&&(!Number.isFinite(Number(answers[q.id]))||(q.min!=null&&Number(answers[q.id])<q.min)||(q.max!=null&&Number(answers[q.id])>q.max)))throw fail(`请核对数值：${q.text}`,400);
  const path=q.archiveField,def=FIELD_MAP[path];
  if(!def||!path.startsWith('lifestyle_data.'))continue;
  const answer=answers[q.id];
  const value=normalizeValue(def,def.type==='array'&&Array.isArray(answer?.values)?answer.values:answer);
  const from=getByPath({...user,lifestyle_data:effectiveLifestyle(user)},path);
  if(items.some(item=>item.path===path&&JSON.stringify(item.value)!==JSON.stringify(value)))throw fail('问卷多题映射到同一档案字段且答案不同，请核对模板',400);
  items.push({path,value,from,questionId:q.id,label:q.text});
 }
 const verified=Object.fromEntries(Object.entries(safe).filter(([id,v])=>confirmed.has(id)&&present(v)));
 return {answers:safe,verified,confirmed:[...confirmed].filter(id=>Object.hasOwn(safe,id)),pending,items};
}
async function context(task,actor,User,write=false) {
 const user=await User.findById(task.patientId).lean();
 if(!user)throw fail('会员不存在',404);
 const id=String(actor._id),assigned=String(task.assignedTo?._id||task.assignedTo);
 const nutrition=actor.role==='nutritionist'&&id===assigned&&id===String(user.assignedNutritionist);
 const advisor=actor.role==='familyDoctor'&&id===String(user.assignedFamilyDoctor);
 if(actor.role!=='superadmin'&&!(write?nutrition:nutrition||advisor))throw fail('仅所属营养师可填写，所属健康顾问可查看',403);
 return user;
}
async function handle(req,res) {
 const FollowUp=require('../models/FollowUp'),User=require('../models/User');
 const {DynamicQuestionnaire,QuestionnaireResponse}=require('../models/DynamicQuestionnaire');
 try {
  let task=await FollowUp.findById(req.params.id).lean();
  if(!require('../../../shared/annualNutrition.cjs').isTask(task))throw fail('营养评估任务不存在',404);
  let user=await context(task,req.staff,User,req.method!=='GET');
  const template=await DynamicQuestionnaire.findById(QUESTIONNAIRE_ID).lean();
  if(!template||template.deletedAt)throw fail('膳食调查问卷不可用，请联系管理员',400);
  if(req.method==='GET') {
   const response=await QuestionnaireResponse.findOne({user:user._id,questionnaire:QUESTIONNAIRE_ID}).sort({submittedAt:-1}).lean();
   const answers={...(response?.answers||{})},archive={};
   for(const q of template.questions||[]) {
    const value=getByPath({...user,lifestyle_data:effectiveLifestyle(user)},q.archiveField);
    if(present(value))archive[q.id]=value;
    if(!present(answers[q.id])&&present(value))answers[q.id]=q.type==='multi'?(Array.isArray(value)?value:[value]):value;
   }
   return res.json({success:true,data:{task,template,initialAnswers:answers,archive,sourceResponseId:response?._id,patientVersion:fingerprint(user),gender:user.gender}});
  }
  const body=req.body,old=task.formData?.lifestyleInterview;
  if(task.status==='completed')throw fail('评估已完成，请刷新');
  if(!['planned','in_progress','missed'].includes(task.status))throw fail('任务已结束');
  if(!['draft','submit'].includes(body.action))throw fail('操作无效',400);
  if(old?.phase!=='applying') {
   if(String(body.baseUpdatedAt)!==new Date(task.updatedAt).toISOString())throw fail('任务已更新，请重新打开');
   const prepared=prepare(user,template,body);
   const notes=String(body.notes||'').trim().slice(0,10000),method=String(body.method||'').trim();
   if(body.action==='submit') {
    if(!Object.keys(prepared.verified).length||!notes||!['电话访谈','视频访谈','当面访谈','客户问卷核实'].includes(method))throw fail('请核实至少一项，并填写访谈方式及评估意见',400);
    if(body.templateVersion!==new Date(template.updatedAt).toISOString())throw fail('问卷模板已更新，请重新打开核对');
    if(body.patientVersion!==fingerprint(user))throw fail('生活方式档案已更新，请重新打开核对');
    if(prepared.items.some(i=>present(i.from)&&JSON.stringify(i.from)!==JSON.stringify(i.value))&&body.confirmConflicts!==true)throw fail('请确认已核对与原档案不同的内容',400);

   }
   const interview={...prepared,notes,method,patientVersion:body.patientVersion,phase:body.action==='draft'?'draft':'applying',submissionId:new (require('mongoose').Types.ObjectId)(),by:req.staff._id,byName:req.staff.name||req.staff.username,at:new Date(),questionnaireId:template._id,questions:template.questions};
   task=await FollowUp.findOneAndUpdate({_id:task._id,updatedAt:task.updatedAt,aiStatus:task.aiStatus,status:task.status},{$set:{formData:{...(task.formData||{}),lifestyleInterview:interview},plannedContent:task.plannedContent||task.content}},{new:true}).lean();
   if(!task)throw fail('任务已更新，请刷新');
   if(body.action==='draft')return res.json({success:true,data:task});
  }
  const interview=task.formData.lifestyleInterview,submissionId=String(interview.submissionId);
  // Durable submission intent; retries resume the same archive/response/task writes.
  user=await context(task,req.staff,User,true);
  if(!(user.lifestyleHistory||[]).some(row=>row.interviewId===submissionId)) {
   if(interview.patientVersion!==fingerprint(user)) {
    await FollowUp.updateOne({_id:task._id,'formData.lifestyleInterview.phase':'applying','formData.lifestyleInterview.submissionId':interview.submissionId},{$set:{'formData.lifestyleInterview.phase':'draft'}});
    throw fail('档案已变化，草稿已保留，请重新打开核对后提交');
   }
   const changes={},set={};
   for(const item of interview.items) {if(!present(getByPath(user,item.path)))set[item.path]=item.value;changes[item.path.slice(15)]={from:item.from,to:item.value};}
   const guard=Object.fromEntries(['lifestyle_data','lifestyleHistory','archiveVersionHistory'].map(key=>[key,user[key]===undefined?{$exists:false}:user[key]]));
   const result=await User.updateOne({_id:user._id,...guard,'lifestyleHistory.interviewId':{$ne:submissionId}},{$set:set,$push:{lifestyleHistory:{interviewId:submissionId,changes:{lifestyle_data:changes},source:'staff',effectiveAt:interview.at,recordedAt:new Date(),recordedById:interview.by,recordedByName:interview.byName,recordedByRole:'nutritionist',healthStatusChange:interview.notes,method:interview.method,sourceFollowUpId:task._id,sourceQuestionnaireId:template._id}}});
   if(!result.matchedCount)throw fail('档案有并发变化，请重试完成提交');
  }
  await QuestionnaireResponse.updateOne({_id:interview.submissionId},{$setOnInsert:{questionnaire:template._id,user:user._id,answers:interview.verified,submittedAt:interview.at,proxyEntry:{by:interview.by,byName:interview.byName,method:interview.method,sourceFollowUpId:task._id,pendingQuestionIds:interview.pending},nutritionistReview:{status:'reviewed',by:interview.by,byName:interview.byName,at:interview.at}}},{upsert:true});
  const result=['生活方式访谈评估',`方式：${interview.method}`,`营养师意见：${interview.notes}`,`已核实 ${Object.keys(interview.verified).length} 项；待确认 ${interview.pending.length} 项`,...interview.questions.filter(q=>Object.hasOwn(interview.verified,q.id)).map(q=>`${q.text}：${answerToText(interview.verified[q.id])}`)].join('\n');
  const event={action:'completed',result,by:interview.by,at:new Date(),sourceResponseId:interview.submissionId};
  const saved=await FollowUp.findOneAndUpdate({_id:task._id,status:task.status,aiStatus:task.aiStatus,assignedTo:task.assignedTo,'formData.lifestyleInterview.phase':'applying','formData.lifestyleInterview.submissionId':interview.submissionId},{$set:{'formData.lifestyleInterview.phase':'submitted',content:result,executedContent:result,status:'completed',completedAt:new Date(),completedBy:'staff',aiStatus:'approved',reviewRole:null,reviewAssignedTo:null,isBlocked:false,'formData.nutritionResultReview':event},$push:{'formData.nutritionResultHistory':event}},{new:true});
  if(!saved)throw fail('任务已变化，请刷新核对提交状态');
  let entitlementRedemption = null;
  if (saved.sourceAnnualPlanId && saved.workflowKey === 'annual_nutrition_assessment') {
   try { entitlementRedemption = await require('./packageServiceRedemption').recordCompletedService({
    patientId: saved.patientId, sourceType: 'follow_up', sourceId: saved._id, workflowKey: 'nutrition_intervention',
   }); } catch (error) { console.error('[package-service-redemption] nutrition deferred', saved._id, error.message); entitlementRedemption = { status: 'needs_review' }; }
  }
  res.json({success:true,data:saved,entitlementRedemption});
 }catch(e){res.status(e.statusCode||500).json({success:false,message:e.message});}
}
module.exports={handle,prepare,fingerprint};
async function start(req,res) {
 const User=require('../models/User'),FollowUp=require('../models/FollowUp'),mongoose=require('mongoose');
 try {
  const user=await User.findById(req.params.id).lean();
  if(!user)throw fail('会员不存在',404);
  if(req.staff.role!=='superadmin'&&(req.staff.role!=='nutritionist'||String(user.assignedNutritionist)!==String(req.staff._id)))throw fail('仅所属营养师可开始访谈',403);
  if(!user.assignedNutritionist)throw fail('请先分配营养师',400);
  const active=await FollowUp.findOne({patientId:user._id,status:{$in:['planned','in_progress','missed']},$or:[{sourceType:'scheduled',workflowKey:'annual_nutrition_assessment',sourceAnnualPlanId:{$ne:null}},{sourceType:'professional_assessment',workflowKey:'lifestyle_interview'}]}).sort({createdAt:-1}).lean();
  if(active)return res.json({success:true,data:active});
  let taskId=user.lifestyleInterviewTaskId;
  const previous=taskId?await FollowUp.findById(taskId).lean():null;
  if(!taskId||previous&&['completed','cancelled'].includes(previous.status)) {
   taskId=new mongoose.Types.ObjectId();
   const claimed=await User.updateOne({_id:user._id,lifestyleInterviewTaskId:user.lifestyleInterviewTaskId||null},{$set:{lifestyleInterviewTaskId:taskId}});
   if(!claimed.matchedCount)throw fail('另一处正在开始访谈，请重试');
  }
  const task=await FollowUp.findOneAndUpdate({_id:taskId},{$setOnInsert:{staffId:req.staff._id,patientId:user._id,assignedTo:user.assignedNutritionist,date:new Date(),type:'phone',status:'in_progress',sourceType:'professional_assessment',workflowKey:'lifestyle_interview',theme:'生活方式访谈与核实',content:'营养师使用膳食调查问卷逐项核实生活方式，记录访谈意见并更新档案。',aiStatus:'approved',reviewRole:null,reviewAssignedTo:null}},{upsert:true,new:true});
  res.json({success:true,data:task});
 }catch(e){res.status(e.statusCode||500).json({success:false,message:e.message});}
}
module.exports.start=start;

// Read-only preview from a saved annual item; never creates an execution task.
module.exports.preview=async(req,res)=>{
 try {
  const plan=await require('../models/AnnualPlan').findById(req.params.id).lean();
  if(!plan)throw fail('方案不存在',404);
  const user=await require('../models/User').findById(plan.patientId).lean();
  const roleFields={nutritionist:'assignedNutritionist',familyDoctor:'assignedFamilyDoctor',healthManager:'assignedHealthManager',healthPlanner:'assignedHealthPlanner'};
  const field=roleFields[req.staff.role];
  if(req.staff.role!=='superadmin'&&(!field||String(user?.[field])!==String(req.staff._id)))throw fail('无权查看此方案',403);
  const index=Number(req.query.index),row=plan.moduleData?.personalized_followups?.records?.[index];
  if(!Number.isInteger(index)||index<0||!require('../../../shared/annualNutrition.cjs').isRow(row))throw fail('营养评估事项不存在',404);
  const template=await require('../models/DynamicQuestionnaire').DynamicQuestionnaire.findById(QUESTIONNAIRE_ID).lean();
  if(!template||template.deletedAt)throw fail('关联问卷不可用',404);
  const date=new Date(row.executionDate);
  const task=Number.isNaN(+date)?null:await require('../models/FollowUp').findOne({sourceAnnualPlanId:plan._id,patientId:plan.patientId,workflowKey:'annual_nutrition_assessment',status:{$ne:'cancelled'},sourceScheduleKey:`personalized:${row.standardPlanId||index}:0:${date.toISOString().slice(0,10)}`}).lean();
  res.json({success:true,data:{template,row,patientId:plan.patientId,taskId:task?._id}});
 }catch(e){res.status(e.statusCode||500).json({success:false,message:e.message});}
};
