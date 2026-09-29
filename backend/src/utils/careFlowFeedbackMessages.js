// Read-only projection of feedback already explicitly submitted by the customer.
// No messages are sent, no AI is triggered and no clinical records are rewritten.
function project(flow){
 const d=flow.state?.customerUpload?.declaration;if(!d?.submittedAt)return null;
 const verified=!!flow.state.data?.upload?.noDocuments;
 return {_id:`care-feedback:${flow._id}:${new Date(d.submittedAt).getTime()}`,user:flow.patientId,type:'user',sender:'客户',recipient:'manager',conversationId:`${flow.patientId}_manager`,unread:false,isAI:false,readOnly:true,
 createdAt:d.submittedAt,updatedAt:flow.updatedAt||d.submittedAt,content:`【本次就医反馈】\n服务：${flow.state.title||'本次就医'}\n服务编号：${String(flow._id).slice(-6)}\n情况：${d.label}\n补充说明：${d.note||'未填写'}\n处理状态：${verified?'专员已核实本次无资料':'已提交，等待专员核实'}\n此条是已提交的服务反馈，请以此更新为准。`};
}
async function list(patientId,tenantId,Flow=require('../models/CareFlow')){
 const flows=await Flow.find({patientId,tenantId:tenantId||null,'state.customerUpload.declaration.submittedAt':{$exists:true}}).select('_id patientId updatedAt state.title state.customerUpload state.data.upload.noDocuments').lean();
 return flows.map(project).filter(Boolean);
}
module.exports={project,list};
