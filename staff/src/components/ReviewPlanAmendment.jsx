import React, { useState } from 'react'
import { staffAPI } from '../api'
const labels={medical_treatment:'医疗问题解决',checkup_completion:'体检完善',abnormal_followup:'异常复查提醒',vaccine:'疫苗接种'}
const rowTitle=row=>row.items||row.name||row.department||'未命名事项'
export default function ReviewPlanAmendment({patientId,topicId,message,scope = 'message'}) {
  const [open,setOpen]=useState(false),[plans,setPlans]=useState([]),[planId,setPlanId]=useState(''),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const plan=plans.find(p=>p._id===planId)
  const start=async()=>{setOpen(true);setDraft(null);setBusy(true);setError('');try{const r=await staffAPI.reviewPlanChoices(patientId);setPlans(r.data||[]);setPlanId(r.data?.[0]?._id||'')}catch(e){setError(e.message)}finally{setBusy(false)}}
  const run=async action=>{setBusy(true);setError('');try{
    const r=await staffAPI.reviewPlanAmendment(patientId,{action,planId,topicId,messageId:message?._id,scope,...(action==='apply'?{...draft,items:draft.items.filter(i=>i.selected!==false),confirmed:true}:{})})
    if(action==='preview')setDraft(r.data);else {setSaved(r.message);setDraft(null);setOpen(false)}
  }catch(e){setError(e.message)}finally{setBusy(false)}}
  const edit=(index,key,value)=>setDraft(d=>({...d,items:d.items.map((r,i)=>i===index?{...r,[key]:value,...(key==='key'?{target:-1}:{})}:r)}))
  return <div style={{marginTop:10}}>
    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={start}>{scope==='topic'?'统一整理本主题补漏':'单条补入年度方案'}</button>
    {saved&&<div role="status" style={{color:'#1E6B50'}}>{saved}</div>}
    {open&&<section style={{padding:12,border:'1px solid #B7D8C9',borderRadius:8,marginTop:8}}>
      <b>核对后补入，保留其他方案内容</b>
      <select className="form-input" disabled={busy} value={planId} onChange={e=>{setPlanId(e.target.value);setDraft(null)}}><option value="">请选择年度方案</option>{plans.map(p=><option key={p._id} value={p._id}>{p.year}年 · {p.templateName||p.planType}</option>)}</select>
      {!plans.length&&!busy&&<p>请先保存年度方案，再从研判沟通补入。</p>}
      <p>{scope==='topic'?'对照整个主题的最终意见、已有方案和补入记录，整理待新增或更新事项。':'只提取本条回复的行动建议。'}日期未明确可标记待确认，先保存建议。保存不会创建或调整执行任务。</p>
      {(plan?.amendments||[]).filter(r=>scope==='topic'?r.topicId===topicId:r.messageId===message?._id).map((r,i)=><details key={i}><summary>已补入记录 · {new Date(r.createdAt).toLocaleString('zh-CN')}</summary>{(r.changes||[]).map((c,j)=><div key={j}>{labels[c.key]}：{rowTitle(c.after)}<div style={{whiteSpace:'pre-wrap'}}>{c.after.reason}</div></div>)}</details>)}
      {(plan?.pushedAt||plan?.confirmedAt||plan?.frozenAt)&&<p style={{color:'#A15C00'}}>此方案已发布或确认：本次为留痕修订，确认后客户查看的方案内容也会更新，既有任务保持不变。</p>}
      {!draft&&<button className="btn btn-primary btn-sm" disabled={busy||!planId} onClick={()=>run('preview')}>{busy?'正在提取…':'提取补充项并预览'}</button>}
      {draft&&<><details><summary>查看原回复及依据</summary><div style={{whiteSpace:'pre-wrap'}}>{draft.source.content || draft.source.messages?.map(m=>`${m.role==='ai'?'AI':'医护'}：${m.content}`).join('\n\n')}</div>{draft.source.evidence?.map((e,i)=><div key={i}>{typeof e==='string'?e:JSON.stringify(e)}</div>)}</details>
        {!draft.items.length&&<p>本次未发现尚需补入的明确行动，请结合原讨论核对。</p>}
        {draft.items.map((item,index)=><div key={index} style={{borderTop:'1px solid #DCE5E0',padding:'12px 0'}}>
          <label><input type="checkbox" checked={item.selected!==false} onChange={e=>edit(index,'selected',e.target.checked)}/>纳入此项</label>
          <select className="form-input" value={item.key} onChange={e=>edit(index,'key',e.target.value)}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
          <label>新增或更新<select className="form-input" value={item.target??-1} onChange={e=>edit(index,'target',Number(e.target.value))}><option value={-1}>新增（同名事项自动合并）</option>{(plan?.moduleData?.[item.key]?.records||[]).map((r,i)=><option key={i} value={i}>更新：{rowTitle(r)}</option>)}</select></label>
          {Number(item.target)>=0&&<div style={{whiteSpace:'pre-wrap',background:'#F3F6F4'}}>原内容：{plan?.moduleData?.[item.key]?.records?.[item.target]?.reason||'未填写原因'}</div>}
          {[['title','事项'],['reason','客观依据'],['advice','处理建议'],['timeWindow','建议时机（如三个月后）'],['date','明确日期（可留空）'],['timingReason','时间依据']].map(([k,l])=><label key={k} style={{display:'block'}}>{l}{['reason','advice','timingReason'].includes(k)?<textarea className="form-input" value={item[k]||''} onChange={e=>edit(index,k,e.target.value)}/>:<input className="form-input" disabled={busy||(k==='date'&&item.datePending)} type={k==='date'?'date':'text'} value={item[k]||''} onChange={e=>edit(index,k,e.target.value)}/>}</label>)}
          <label><input type="checkbox" checked={!!item.datePending} onChange={e=>edit(index,'datePending',e.target.checked)}/> 日期待确认（先保存建议；若更新旧事项，将清除其原日期）</label>
        </div>)}
        <button className="btn btn-primary" disabled={busy||!draft.items.some(i=>i.selected!==false)} onClick={()=>run('apply')}>{busy?'保存中…':'确认并保存到年度方案'}</button>
      </>}
      {error&&<div role="alert" style={{color:'#B42318',marginTop:8}}>{error}</div>}
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={()=>{setOpen(false);setDraft(null)}} style={{marginLeft:8}}>关闭</button>
    </section>}
  </div>
}
