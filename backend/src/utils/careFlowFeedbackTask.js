const id=v=>String(v?._id||v||'');
function feedbackForTask(task,flow){
 const s=flow?.state,d=s?.customerUpload?.declaration;
 if(!d||!['upload','audit'].includes(s.stage)||s.customerUpload?.completedAt||s.data?.upload?.noDocuments)return null;
 if(!['planned','in_progress','missed'].includes(task.status)||task.taskRole!=='executor'||task.workflowKey!==`care_flow:${s.stage}`||task.formData?.careFlowSequence!==s.sequence)return null;
 if(id(task.careFlowId)!==id(flow._id)||id(task.patientId)!==id(flow.patientId)||id(task.assignedTo)!==id(s.people?.healthManager?.id))return null;
 return {label:d.label,note:d.note||'',submittedAt:d.submittedAt,theme:`核实客户就医反馈 · ${s.title||'本次就医'}`};
}
module.exports={feedbackForTask};
