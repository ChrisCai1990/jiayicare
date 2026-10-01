import React,{useState} from 'react'
import {staffAPI} from '../api'
import ProfessionalAssessmentFields from './ProfessionalAssessmentFields'
export default function AnnualNutritionAssessmentForm({task,staff,onSaved}) {
  const [value,setValue]=useState(task.formData?.nutritionAssessment || {domain:'营养',title:task.theme||'营养评估',facts:task.executedContent||'',risks:'',missingInformation:'',recommendations:''})
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const editable=task.aiStatus!=='pending' && ['planned','in_progress','missed'].includes(task.status) && (staff.role==='superadmin'||(staff.role==='nutritionist'&&String(task.assignedTo?._id||task.assignedTo)===String(staff._id)))
  async function save(submit) {
    setBusy(true);setMessage('')
    try { const res=await staffAPI.updateFollowUp(task._id,{nutritionAssessment:value,assessmentAction:submit?'submit':'draft',baseUpdatedAt:task.updatedAt});onSaved(res.data);setMessage(submit?'已提交健康顾问审核':'评估草稿已保存') }
    catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  return <section><h3>营养评估表</h3><details><summary>本次评估依据及要求</summary><p style={{whiteSpace:'pre-wrap'}}>{task.plannedContent||task.content}</p></details>
    <ProfessionalAssessmentFields value={value} onChange={setValue} disabled={!editable||busy}/>
    {task.formData?.nutritionResultReview?.action==='returned'&&<p>退回意见：{task.formData.nutritionResultReview.note}</p>}
    {editable&&<div style={{display:'flex',gap:8,marginTop:12}}><button className="btn btn-secondary" disabled={busy} onClick={()=>save(false)}>暂存评估</button><button className="btn btn-primary" disabled={busy} onClick={()=>save(true)}>提交顾问审核</button></div>}
    {message&&<p role="status">{message}</p>}
  </section>
}
