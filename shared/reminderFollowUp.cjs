const outcomes={reminded:'已提醒，尚未就医',unreachable:'未接通，继续联系',deferred:'客户暂缓',booked:'客户已预约，尚未就医',visited:'已完成本次就医 / 检查，转资料收集'};
function eligible(task){
  if(!task||task.taskRole||task.careFlowId||task.healthManagementEnabled===false||['single','managed'].includes(task.deliveryMode)||task.serviceTracking?.linkId)return false;
  if(task.workflowKey&&!/^(professional_assessment|report_followup):dynamic_followup$/.test(task.workflowKey))return false;
  return task.sourceType==='scheduled'&&/^(annual_checkup|checkup_completion|abnormal_followup|medical_treatment|functional_medicine):/.test(task.sourceScheduleKey||'')
    ||['professional_assessment','report_followup'].includes(task.sourceType)&&['medical_visit','examination','review'].includes(task.formData?.category);
}
module.exports={eligible,outcomes};
