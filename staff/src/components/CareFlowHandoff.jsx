import React from 'react'
import booking from '../../../shared/annualBookingPlan.cjs'

export default function CareFlowHandoff({state}) {
  const plan = {plannedContent:state.data.advisor?.text || '',sourceScheduleKey:state.sourceScheduleKey}
  const p = booking.bookingPlan(plan), receipt = state.data.booking
  const originalRows = receipt?.entries?.length ? receipt.entries : receipt ? [{...receipt,title:'门诊预约'}] : booking.bookingSlots(plan)
  const rows = [...originalRows,...(state.data.execute?.onsite||[]).filter(e=>!originalRows.some(v=>v.id===e.id))]
  const instructions = {
    advisor:'核对就医目的、项目及科室要求，完善本次交接。',
    booking:'按顾问要求逐项落实预约，填写具体日期、时间及现场交接。',
    planner:'核对下方预约和现场待办，安排合适的就医专员。',
    execute:'按预约时间办理，向专家沟通顾问要求，并记录实际结果。',
    upload:'上传本次病历、医嘱及检查资料，说明完整性。',
    audit:'核对本次资料及办理结果，完成逐份报告审核。',
    draft:'根据已审核资料生成待顾问审核的随访草稿。',
    review:'审核随访内容及日期，通过后生成正式随访任务。',
  }
  const field = (label,value) => <React.Fragment key={label}><dt style={{color:'#65776F'}}>{label}</dt><dd style={{margin:0,whiteSpace:'pre-wrap'}}>{value || '未明确'}</dd></React.Fragment>
  return <section aria-label="办理事项与预约交接" style={{display:'grid',gap:12}}>
    <h3 style={{margin:0}}>本环节要做什么</h3><div>{instructions[state.stage] || '查看已完成服务及后续随访记录。'}</div>
    <div>顾问建议就医/检查日期：<b>{p.suggestedDate || '原计划未明确'}</b>（实际安排以下方预约结果为准）</div>
    <h3 style={{margin:0}}>预约与现场待办</h3>
    {rows.map((entry,i)=>{
      const outcome=(state.data.execute?.onsite || []).find(v=>v.id===entry.id)
      const e=outcome?{...entry,...outcome}:entry
      const booked=e.status==='booked', onsite=e.mode==='onsite'&&!booked
      return <section key={entry.id||i} style={{background:'#F6FBF8',borderRadius:12,padding:16}}>
        <b>{e.type==='exam'?'检查':'门诊'} · {e.title || p.items || '顾问指定事项'}</b>
        <dl style={{display:'grid',gridTemplateColumns:'minmax(80px,120px) minmax(0,1fr)',gap:'8px 16px',marginBottom:0}}>
          {field('医院',e.hospital || p.hospital)}{field('科室',e.department)}{field('专家',e.expert || '未指定专家')}
          {field('办理状态',e.status==='cancelled'?'专家取消／无需检查':booked?'已预约':onsite?'待就医专员现场预约（未完成）':e.mode==='not_required'?'已确认无需预约':'待落实预约')}
          {outcome?.reason&&field('专家意见／变更原因',outcome.reason)}
          {booked&&field('预约日期',e.date)}{booked&&field('具体时间',e.time)}
          {entry.note&&field('交接要求',entry.note)}{outcome?.note&&field('现场结果',outcome.note)}
        </dl>
      </section>
    })}
    {p.precautions&&<div>注意事项：{p.precautions}</div>}
    {state.data.planner?.note&&<div>派单说明：{state.data.planner.note}</div>}
  </section>
}
