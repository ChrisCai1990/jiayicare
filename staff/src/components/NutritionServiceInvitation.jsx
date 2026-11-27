import React,{useState} from 'react'
import {staffAPI} from '../api'

export default function NutritionServiceInvitation({task,onClose,onSaved}){
  const s=task.bodyCompCycle
  const [date,setDate]=useState(s.targetAt)
  const [reason,setReason]=useState('')
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  async function save(action){
    setSaving(true);setError('')
    try{await staffAPI.updateNutritionService(task._id,{action,date,reason,updatedAt:task.updatedAt});onSaved('updated')}
    catch(e){setError(e.message||'保存失败');setSaving(false)}
  }
  return <div className="modal-overlay"><div className="modal" style={{maxWidth:620}}>
    <div className="modal-header"><h3>{task.theme}</h3><button onClick={onClose}>关闭</button></div>
    <div className="modal-body" style={{display:'grid',gap:12}}>
      <p>营养服务　{s.start} 至 {s.end}　｜　强化 2 个周期</p>
      <strong>{task.plannedContent}</strong>
      {s.phase!=='finished'&&<><div>当前安排　{s.targetAt}</div><label>{s.phase==='rest'?'协调日期 / 实际启动日':'体测计划日期'} <input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <div><button disabled={saving} onClick={()=>save('schedule')}>{s.phase==='rest'?'保存下次协调日期':s.phase==='quarter'&&s.waiting?'登记营养师确认的目标日':'保存预约日期'}</button>
      {s.phase==='rest'&&<button disabled={saving} onClick={()=>save('start')}>登记第二周期实际启动</button>}</div>
      <details><summary>提前结束营养随访</summary><textarea placeholder="具体结束原因" value={reason} onChange={e=>setReason(e.target.value)}/><button disabled={saving||!reason.trim()} onClick={()=>save('end')}>确认结束</button></details></>}
      {error&&<p role="alert">{error}</p>}
      <h4>历次随访安排</h4>{s.history.slice().reverse().map((r,i)=><div key={i} style={{borderTop:'1px solid #ddd',paddingTop:6}}>{r.at}　{r.action}
        {r.previous&&<div>此前计划　{r.previous}</div>}{r.actual&&<div>实际测量　{r.actual}</div>}{r.target&&<div>当次记录后的安排　{r.target}</div>}</div>)}
    </div></div></div>
}
