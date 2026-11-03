import React, { useState } from 'react'
export default function ConsultationFollowupReview({ consultation, busy, onSubmit, onGenerate }) {
 const [items,setItems]=useState(consultation.followupDraft?.items || [])
 const [plan,setPlan]=useState(consultation.members.map(m=>`${m.expertId?.name || '专家'}：${m.nextStep || ''}`).join('\n'))
 const [reason,setReason]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const valid=plan.trim() && confirmed && (items.length ? items.every(item=>item.date&&item.items?.trim()) : reason.trim())
 if (consultation.followupReviewedAt) return <section className="card"><h3>随访计划已审核，待完成发布</h3><p>继续发布会沿用已审核内容，不会重复创建任务。</p><button className="btn btn-primary" disabled={busy} onClick={()=>onSubmit({})}>继续发布随访计划</button></section>
 return <section className="card" style={{padding:20,marginTop:20}}><h3>审核专家意见与随访计划</h3><p>草稿尚未发布。审核通过后，复查安排进入用户端及负责健管专员的随访工作台。</p>
 {consultation.followupDraft?.status==='failed' && <p role="alert">{consultation.followupDraft.note}</p>}
 {!consultation.followupDraft && <p>尚无自动草稿，可生成或手动填写。</p>}
 <details><summary>重新提取草稿（会替换当前未保存内容）</summary><button className="btn btn-secondary" disabled={busy} onClick={onGenerate}>重新提取随访草稿</button></details>
 <label>管理路径与审核意见<textarea className="form-input" rows={4} value={plan} onChange={e=>setPlan(e.target.value)}/></label>
 {consultation.followupDraft?.note && <p>专家说明：{consultation.followupDraft.note}</p>}
 {items.map((item,i)=><div key={i} style={{border:'1px solid #DDE8E1',padding:12,marginTop:12}}><p>专家原文：{item.sourceText || item.timeText || '顾问补充'}</p><label>确认复查日期<input type="date" className="form-input" value={item.date || ''} onChange={e=>setItems(items.map((r,j)=>i===j?{...r,date:e.target.value}:r))}/></label><label>复查项目<textarea className="form-input" value={item.items || ''} onChange={e=>setItems(items.map((r,j)=>i===j?{...r,items:e.target.value}:r))}/></label><button className="btn btn-secondary" onClick={()=>setItems(items.filter((_,j)=>i!==j))}>移除此项</button></div>)}
 <button className="btn btn-secondary" disabled={items.length>=20} onClick={()=>setItems([...items,{date:'',items:'',sourceText:''}])}>＋ 添加复查项目</button>
 {!items.length && <label>不建立复查任务的原因<textarea className="form-input" value={reason} onChange={e=>setReason(e.target.value)}/></label>}
 <p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 已核对各专家意见、日期及项目，确认可发布</label></p>
 <button className="btn btn-primary" disabled={busy||!valid} onClick={()=>onSubmit({plan,reviewItems:items,noReviewReason:reason,confirmed})}>审核通过并发布随访计划</button></section>
}
