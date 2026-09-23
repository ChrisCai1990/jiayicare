function project(flow) {
  const s=flow.state;
  if(!s.data?.execute || !['upload','audit','draft','review','closed'].includes(s.stage)) return [];
  const booked=s.data.booking?.entries||[],actual=s.data.execute.onsite||[];
  const rows=[...booked.map(e=>({...e,...actual.find(v=>v.id===e.id)})),...actual.filter(e=>!booked.some(v=>v.id===e.id))];
  return rows.filter(e=>!['cancelled','not_required'].includes(e.status)).map((e,i)=>({
    _id:`care-plan:${flow._id}:${e.id||i}`,careFlowId:String(flow._id),customerReadOnly:true,canUploadReports:['upload','audit'].includes(s.stage),
    title:`${e.type==='exam'?'检查安排':'就医安排'} · ${e.title||s.title}`,
    type:'followup',status:s.stage==='closed'?'completed':'pending',priority:'medium',assignee:'健管专员',
    dueDate:e.status==='booked'?e.date:undefined,dueTime:e.status==='booked'?e.time:undefined,
    description:[e.status==='booked'?`已预约：${e.date} ${e.time||''}`:'待安排：具体日期尚未确认',`医院：${e.hospital||'待明确'}`,`科室：${e.department||'待明确'}`,e.expert&&`专家：${e.expert}`,'检查后可上传报告及病历，由健管专员核对审核。'].filter(Boolean).join('\n'),
  }));
}
async function clientPlans(user) {
  if(!require('./healthManagementRollout').enabledForPatient(user._id))return [];
  const rows=await require('../models/CareFlow').find({patientId:user._id,tenantId:user.tenantId||null}).lean();
  return rows.flatMap(project);
}
module.exports={project,clientPlans};
