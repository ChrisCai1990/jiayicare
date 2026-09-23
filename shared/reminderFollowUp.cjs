const outcomes={reminded:'已提醒，尚未就医',unreachable:'未接通，继续联系',deferred:'客户暂缓',booked:'客户已预约，尚未就医',visited:'已完成本次就医 / 检查，转资料收集',obtained:'已取得药品，结束提醒'};
function kindOf(task){return task?.formData?.adHocMedicalReminder===true ? task.formData.reminderKind||'visit' : 'visit';}
function outcomesFor(task){
  if(kindOf(task)==='medication')return {reminded:'已提醒，尚未配药',unreachable:outcomes.unreachable,deferred:outcomes.deferred,booked:'已安排配药，尚未取得',obtained:outcomes.obtained};
  if(kindOf(task)==='review')return {reminded:'已提醒，尚未复查',unreachable:outcomes.unreachable,deferred:outcomes.deferred,booked:'已预约，尚未复查',visited:'已完成复查，转资料收集'};
  return {reminded:outcomes.reminded,unreachable:outcomes.unreachable,deferred:outcomes.deferred,booked:outcomes.booked,visited:outcomes.visited};
}
function eligible(task){
  if(!task||task.taskRole||task.careFlowId||task.healthManagementEnabled===false||['single','managed'].includes(task.deliveryMode)||task.serviceTracking?.linkId)return false;
  if(task.workflowKey&&!/^(professional_assessment|report_followup):dynamic_followup$/.test(task.workflowKey))return false;
  if(!task.sourceType&&task.formData?.adHocMedicalReminder===true&&task.followUpSchemeId)return true;
  return task.sourceType==='scheduled'&&/^(annual_checkup|checkup_completion|abnormal_followup|medical_treatment|functional_medicine):/.test(task.sourceScheduleKey||'')
    ||['professional_assessment','report_followup'].includes(task.sourceType)&&['medical_visit','examination','review'].includes(task.formData?.category);
}
module.exports={eligible,outcomes,outcomesFor,kindOf};
