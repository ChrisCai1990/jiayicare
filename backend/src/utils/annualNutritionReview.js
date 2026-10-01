const {isTask}=require('../../../shared/annualNutrition.cjs');
const fail=(message,statusCode=409)=>Object.assign(new Error(message),{statusCode});
async function transition({task,actor,body,FollowUp,User,review=false}) {
  if (!isTask(task)) throw fail('不是营养评估任务');
  const patient=await User.findById(task.patientId).select('assignedFamilyDoctor').lean();
  let fields,event;
  const now=new Date();
  if (review) {
    if (actor.role!=='superadmin' && (actor.role!=='familyDoctor'||String(patient?.assignedFamilyDoctor)!==String(actor._id))) throw fail('仅所属健康顾问可审核',403);
    if (task.aiStatus!=='pending') throw fail('结果已审核，请刷新');
    const approved=body.action==='approve';
    const note=String(body.rejectReason||body.edits?.returnNote||'').trim();
    if (!approved && !note) throw fail('请填写退回原因',400);
    fields={aiStatus:'approved',isBlocked:false,status:approved?'completed':'planned',completedAt:approved?now:null,completedBy:approved?'staff':null};
    event={action:approved?'approved':'returned',note,by:actor._id,at:now,result:task.executedContent};
  } else {
    if (actor.role!=='superadmin' && (actor.role!=='nutritionist'||String(task.assignedTo)!==String(actor._id))) throw fail('仅本任务营养师可提交结果',403);
    if (task.aiStatus==='pending'||!['planned','in_progress','missed'].includes(task.status)) throw fail('任务正在审核或已结束');
    if (!patient?.assignedFamilyDoctor) throw fail('请先分配健康顾问',400);
    const result=String(body.executedContent||body.content||'').trim();
    if (!result) throw fail('请填写营养评估结果',400);
    fields={content:result,executedContent:result,plannedContent:task.plannedContent||task.content,status:'in_progress',aiStatus:'pending',reviewRole:'familyDoctor',reviewAssignedTo:patient.assignedFamilyDoctor,isBlocked:true,completedAt:null,completedBy:null};
    event={action:'submitted',result,by:actor._id,at:now};
  }
  fields.formData={...(task.formData||{}),nutritionResultReview:event,nutritionResultHistory:[...(task.formData?.nutritionResultHistory||[]),event]};
  const saved=await FollowUp.findOneAndUpdate({_id:task._id,updatedAt:task.updatedAt,aiStatus:task.aiStatus,status:task.status},{$set:fields},{new:true});
  if (!saved) throw fail('任务已变化，请刷新');
  return saved;
}
module.exports={transition};
