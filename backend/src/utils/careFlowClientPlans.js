function project(flow) {
  const s=flow.state;
  if(s.mode==='reminder')return [{_id:`care-plan:${flow._id}:visit`,careFlowId:String(flow._id),customerReadOnly:true,canUploadReports:!s.customerUpload?.completedAt&&['upload','audit'].includes(s.stage),
    title:`已就医 · ${s.title}`,type:'followup',status:'completed',priority:'low',scheduleLabel:'已就医',dueDate:s.data.visit?.date,assignee:'健管专员',description:`已记录本次就医日期：${s.data.visit?.date||'待核对'}。请提交本次病历、处方或检查报告，由健管专员审核。`}];
  if(!s.data?.execute || !['upload','audit','draft','review','closed'].includes(s.stage)) return [];
  const booked=s.data.booking?.entries||[],actual=s.data.execute.onsite||[];
  const rows=[...booked.map(e=>({...e,...actual.find(v=>v.id===e.id)})),...actual.filter(e=>!booked.some(v=>v.id===e.id))];
  return rows.filter(e=>!['cancelled','not_required'].includes(e.status)).map((e,i)=>({
    _id:`care-plan:${flow._id}:${e.id||i}`,careFlowId:String(flow._id),customerReadOnly:true,canUploadReports:!s.customerUpload?.completedAt&&['upload','audit'].includes(s.stage),
    title:`${e.type==='exam'?'检查安排':'就医安排'} · ${e.title||s.title}`,
    type:'followup',status:['draft','review','closed'].includes(s.stage)?'completed':'pending',priority:'low',assignee:'健管专员',
    scheduleLabel:e.status==='booked'&&e.date?'已预约':'待安排',
    dueDate:e.status==='booked'?e.date:undefined,dueTime:e.status==='booked'?e.time:undefined,
    description:[e.status==='booked'?`已预约：${e.date} ${e.time||'时间待确认'}`:'待安排：具体日期尚未确认',`医院：${e.hospital||'待明确'}`,`科室：${e.department||'待明确'}`,`专家：${e.expert||'未指定专家'}`,'检查后可上传报告及病历，由健管专员核对审核。'].filter(Boolean).join('\n'),
  }));
}
function uploadContext(flow) {
    const s=flow.state||{}, actual=s.data?.execute?.onsite||[], booked=s.data?.booking?.entries||[];
    const dates=[s.data?.visit?.date,...actual.map(e=>e.date),...booked.map(e=>e.date)].filter(Boolean);
    return {serviceTitle:s.title||'本次就医',visitDate:dates[0]||'',serviceCode:String(flow._id).slice(-6)};
}
function projectTasks(f) {
    const plans=project(f),s=f.state;
    if(plans.length&&['upload','audit'].includes(s.stage)&&!s.customerUpload?.completedAt){const c=uploadContext(f);plans.push({_id:`care-plan:${f._id}:upload`,careFlowId:String(f._id),customerReadOnly:true,canUploadReports:true,uploadReminder:true,type:'upload',title:`上传报告及病历 · ${c.serviceTitle}${c.visitDate?`（${c.visitDate}）`:''}`,status:'pending',priority:'low',scheduleLabel:'待上传',dueDate:c.visitDate||undefined,assignee:'本人',description:`对应就医：${c.serviceTitle}\n日期：${c.visitDate||'待核对'}\n服务编号：${c.serviceCode}\n可在此直接上传门诊病历、医嘱单和检查报告。确认全部上传后，本提醒结束；健管专员继续审核。`});}
    if(['draft','review'].includes(s.stage)&&s.data?.audit)plans.push({_id:`care-plan:${f._id}:review`,careFlowId:String(f._id),customerReadOnly:true,type:'followup',title:`就医后健康计划 · ${s.title||'本次就医'}`,status:'pending',priority:'low',scheduleLabel:'待顾问确认',assignee:'健康顾问',description:'本次报告及病历已由健管专员审核。健康顾问正在核对后续随访时间和内容，确认后将在健康计划中显示；请以最终确认的信息为准。'});
    return plans;
}
async function clientPlans(user) {
  if(!require('./healthManagementRollout').enabledForPatient(user._id))return [];
  const rows=await require('../models/CareFlow').find({patientId:user._id,tenantId:user.tenantId||null}).lean();
  return rows.flatMap(projectTasks);
}
module.exports={project,projectTasks,clientPlans,uploadContext};
