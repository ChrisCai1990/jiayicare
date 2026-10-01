import React from 'react'
import DateField from '../../../shared/DateField.jsx'
export default function HealthDataPlanFields({value, onChange}) {
  const v=value||{}, set=(key,val)=>onChange({...v,[key]:val})
  return <div style={{marginTop:16,padding:16,background:'#F0F8F4',borderRadius:12}}>
    <label><input type="checkbox" checked={!!v.enabled} onChange={e=>onChange({...v,id:v.id||crypto.randomUUID(),enabled:e.target.checked,kind:v.kind||'water',reminderDays:v.reminderDays||1,followUpDays:v.followUpDays||14,reminderTime:v.reminderTime||'20:00'})}/> 记录健康数据 · 周期跟进</label>
    {v.enabled&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:12}}>
      <label>记录内容<select className="form-input" value={v.kind} onChange={e=>set('kind',e.target.value)}><option value="water">饮水</option><option value="medication">用药</option><option value="supplement">营养素</option></select></label>
      <label>开始日期<DateField type="date" className="form-input" value={v.startDate||''} onChange={e=>set('startDate',e.target.value)}/></label>
      <label>结束日期<DateField type="date" className="form-input" value={v.endDate||''} onChange={e=>set('endDate',e.target.value)}/></label>
      <label>客户记录提醒（每几天）<input type="number" min="1" max="365" className="form-input" value={v.reminderDays} onChange={e=>set('reminderDays',Number(e.target.value))}/></label>
      <label>记录提醒时间<input type="time" className="form-input" value={v.reminderTime} onChange={e=>set('reminderTime',e.target.value)}/></label>
      <label>人工随访周期（天）<input type="number" min="1" max="365" className="form-input" value={v.followUpDays} onChange={e=>set('followUpDays',Number(e.target.value))}/></label>
    </div><p style={{fontSize:12,color:'#4A6558'}}>上方随访日期为首次跟进日期。客户提醒在记录周期内重复展示；工作人员保留一条任务，记录进展后按周期安排下次跟进。记录提醒不改变用药或营养素服用安排。</p></>}
  </div>
}
