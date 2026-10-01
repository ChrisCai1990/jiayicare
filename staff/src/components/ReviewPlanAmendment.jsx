import DateField from '../../../shared/DateField.jsx'
import './ReviewPlanAmendment.css'
import React, { useState } from 'react'
import { staffAPI } from '../api'
const labels={medical_treatment:'医疗问题解决',checkup_completion:'体检完善',abnormal_followup:'异常复查提醒',vaccine:'疫苗接种',personalized_followups:'个性化方案（Admin模板）'}
const rowTitle=row=>row?.items||row?.name||row?.department||row?.standardPlanName||'已移除原分类事项'
function TemplateSearch({catalog,value,onChange,disabled}) {
  const [query,setQuery]=useState('')
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches=catalog.filter(t=>words.every(word=>`${t.name} ${t.content||''}`.toLocaleLowerCase().includes(word)))
  const selected=catalog.find(t=>t.id===value)
  return <div style={{marginTop:6}}>
    <input className="form-input" type="search" aria-label="搜索Admin标准模板" placeholder="搜索模板，如：饮水、营养、生活方式" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)} />
    {query&&<div style={{fontSize:12,color:'#718375',margin:'5px 0'}}>匹配 {matches.length} 项{!matches.length?'，请更换关键词':''}</div>}
    <select className="form-input" aria-label="选择Admin标准模板" disabled={disabled} value={value} size={words.length?Math.min(6,Math.max(2,matches.length+1)):undefined} style={{marginTop:6}} onChange={e=>{onChange(e);setQuery('')}}>
      <option value="">请选择模板</option>
      {selected&&!matches.some(t=>t.id===value)&&<option value={value}>已选：{selected.name}</option>}
      {matches.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  </div>
}
export default function ReviewPlanAmendment({patientId,topicId,message,scope = 'message'}) {
  const [open,setOpen]=useState(false),[plans,setPlans]=useState([]),[planId,setPlanId]=useState(''),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
  const [catalog,setCatalog]=useState([])
  const plan=plans.find(p=>p._id===planId)
  const start=async()=>{setOpen(true);setDraft(null);setBusy(true);setError('');try{const r=await staffAPI.reviewPlanChoices(patientId);setPlans(r.data||[]);setCatalog(r.catalog||[]);setPlanId(r.data?.[0]?._id||'')}catch(e){setError(e.message)}finally{setBusy(false)}}
  const run=async action=>{if(action==='apply'&&draft?.items.some(i=>i.operation==='remove'&&i.selected!==false)&&!window.confirm('确认从年度方案删除所选事项？将保留原内容和删除原因，已有执行任务不会自动删除。'))return;setBusy(true);setError('');try{
    const r=await staffAPI.reviewPlanAmendment(patientId,{action,planId,topicId,messageId:message?._id,scope,...(action==='apply'?{...draft,items:draft.items.filter(i=>i.selected!==false),confirmed:true}:{})})
    if(action.startsWith('preview'))setDraft(r.data);else {setSaved(r.message);setDraft(null);setOpen(false)}
  }catch(e){setError(e.message)}finally{setBusy(false)}}
  const edit=(index,key,value)=>setDraft(d=>({...d,items:d.items.map((r,i)=>i===index?{...r,[key]:value,...(key==='key'?{target:-1}:{})}:r)}))
  const originals=Object.keys(labels).flatMap(key=>(plan?.moduleData?.[key]?.records||[]).map((row,index)=>({key,index,row})))
  const history=(plan?.amendments||[]).filter(r=>scope==='topic'?r.topicId===topicId:r.messageId===message?._id)
  const chooseOriginal=async (key,index,row,operation)=>{
    setBusy(true);setError('')
    try {
      const base=draft || (await staffAPI.reviewPlanAmendment(patientId,{action:'preview-manual',planId,topicId,messageId:message?._id,scope})).data
      if(base.baseUpdatedAt!==plan.updatedAt) throw Error('方案已更新，请关闭后重新打开，核对最新事项再选择')
      const exists=base.items.findIndex(item=>item.operation==='remove'?item.key===key&&item.target===index:item.moveFrom?.key===key&&item.moveFrom?.index===index)
      if(operation==='remove'){
        const removal={key,target:index,title:rowTitle(row),operation:'remove',deletionReason:''};
        setDraft({...base,items:exists>=0?base.items.map((r,i)=>i===exists?(r.operation==='remove'?{...r,selected:r.selected===false}:removal):r):[...base.items,removal]});return;
      }
      if(exists>=0 && base.items[exists].operation==='remove') {
        if(base.items[exists].selected!==false){setError('请先取消待删除项，再调整分类');return}
        setDraft({...base,items:base.items.map((r,i)=>i===exists?{key:'personalized_followups',target:-1,title:rowTitle(row),reason:row.basisSummary||row.reason||'',advice:row.personalizedAdvice||row.reason||'',date:'',datePending:true,moveFrom:{key,index}}:r)});return
      }
      if(exists>=0) setDraft({...base,items:base.items.map((r,i)=>i===exists?{...r,selected:r.selected===false}:r)})
      else setDraft({...base,items:[...base.items,{key:'personalized_followups',target:-1,title:rowTitle(row),reason:row.basisSummary||row.reason||'',advice:row.personalization||row.personalizedAdvice||row.reason||'',date:'',datePending:true,timeWindow:'',timingReason:'',moveFrom:{key,index}}]})
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <div style={{marginTop:10}}>
    <button className="btn btn-secondary btn-sm" disabled={busy} onClick={start}>{scope==='topic'?'统一整理本主题补漏':'单条补入年度方案'}</button>
    {saved&&<div role="status" style={{color:'#1E6B50'}}>{saved} <a href={`/patients/${patientId}/annual-health?year=${plan?.year}&planType=${encodeURIComponent(plan?.planType||'')}`}>查看更新后的年度方案</a></div>}
    {open&&<section style={{padding:12,border:'1px solid #B7D8C9',borderRadius:8,marginTop:8}}>
      <b>核对后补入，保留其他方案内容</b>
      <select className="form-input" disabled={busy} value={planId} onChange={e=>{setPlanId(e.target.value);setDraft(null)}}><option value="">请选择年度方案</option>{plans.map(p=><option key={p._id} value={p._id}>{p.year}年 · {p.templateName||p.planType}</option>)}</select>
      {!plans.length&&!busy&&<p>请先保存年度方案，再从研判沟通补入。</p>}
      <p>{scope==='topic'?'对照整个主题的最终意见、已有方案和补入记录，整理待新增或更新事项。':'只提取本条回复的行动建议。'}日期未明确可标记待确认，先保存建议。保存不会创建或调整执行任务。</p>
      {plan&&<section className="amendment-picker">
        <h4>1. 选择要调整的事项</h4><p>可选择调整或删除。删除先标记，在下方填写原因，确认保存后才生效。</p>
        <div className="amendment-picker__grid">{originals.map(({key,index,row})=>{
          const selected=draft?.items.some(item=>item.moveFrom?.key===key&&item.moveFrom?.index===index&&item.selected!==false)
          const removing=draft?.items.some(item=>item.operation==='remove'&&item.key===key&&item.target===index&&item.selected!==false)
          return <article key={`${key}:${index}`} className={`amendment-picker__item ${selected?'is-selected':''}`}>
            <span className="amendment-picker__category">{labels[key]} · 第{index+1}项</span>
            <strong>{rowTitle(row)}</strong>
            <p>{row.reason||row.basisSummary||row.personalizedAdvice||'暂无原建议内容'}</p>
            {key!=='personalized_followups'&&<button className={`btn btn-sm ${selected?'btn-primary':'btn-secondary'}`} disabled={busy||removing} onClick={()=>chooseOriginal(key,index,row)}>{selected?'已选择 · 点击取消':'调整此项'}</button>} <button className="btn btn-secondary btn-sm" style={{color:'#B42318'}} disabled={busy} onClick={()=>chooseOriginal(key,index,row,'remove')}>{removing?'已标记删除 · 撤销':'删除此项'}</button>
          </article>
        })}</div>
        {!originals.length&&<p>此方案暂无可迁移的事项，请核对所选年度方案。</p>}
      </section>}
      {!!history.length&&<details className="amendment-history"><summary>历史补录记录 · {history.length} 次</summary>{[...history].reverse().map((r,i)=><details key={i}><summary>{[...new Set((r.changes||[]).map(c=>rowTitle(c.after||c.before)))].join('、') || '方案调整'} <small> · {new Date(r.createdAt).toLocaleString('zh-CN')}</small></summary>{(r.changes||[]).map((c,j)=><div key={j}>{labels[c.key]}：{rowTitle(c.after||c.before)}<p>{c.operation==='remove'?`删除原因：${c.deletionReason}`:c.after?.reason||'已从原分类移除并留痕'}</p></div>)}</details>)}</details>}
      {(plan?.pushedAt||plan?.confirmedAt||plan?.frozenAt)&&<p style={{color:'#A15C00'}}>此方案已发布或确认：本次为留痕修订，确认后客户查看的方案内容也会更新，既有任务保持不变。</p>}
      {!draft&&<button className="btn btn-primary btn-sm" disabled={busy||!planId} onClick={()=>run('preview')}>{busy?'正在提取…':'提取补充项并预览'}</button>}
      {!draft&&<button className="btn btn-secondary btn-sm" disabled={busy||!planId} onClick={()=>run('preview-manual')}>调整已有事项分类（不调用AI）</button>}
      {draft&&<><details><summary>查看原回复及依据</summary><div style={{whiteSpace:'pre-wrap'}}>{draft.source.content || draft.source.messages?.map(m=>`${m.role==='ai'?'AI':'医护'}：${m.content}`).join('\n\n')}</div>{draft.source.evidence?.map((e,i)=><div key={i}>{typeof e==='string'?e:JSON.stringify(e)}</div>)}</details>
        {!draft.items.length&&<p>尚未选择调整项。请在上方点击“调整此项”；AI未提取到新增建议也可手动选择。</p>}
        {draft.items.map((item,index)=>item.operation==='remove'?<div key={index} className="amendment-editor" style={{borderColor:'#F3CCCC'}}><h4 style={{color:'#B42318'}}>待删除：{item.title}</h4><label><input type="checkbox" checked={item.selected!==false} onChange={e=>edit(index,'selected',e.target.checked)}/>确认移除此事项</label><p>仅从年度方案移除，保留审计记录；已有任务需另行处理。</p><label>删除原因<textarea className="form-input" maxLength={500} value={item.deletionReason} onChange={e=>edit(index,'deletionReason',e.target.value)} placeholder="如：重复事项、后续研判已调整处理方式" /></label></div>:<div key={index} className="amendment-editor">
          <h4>2. 调整内容：{item.moveFrom?rowTitle(plan?.moduleData?.[item.moveFrom.key]?.records?.[item.moveFrom.index]):item.title}</h4>
          <label><input type="checkbox" checked={item.selected!==false} onChange={e=>edit(index,'selected',e.target.checked)}/>纳入此项</label>
          <select className="form-input" value={item.key} onChange={e=>edit(index,'key',e.target.value)}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
          {item.key==='personalized_followups'&&<div style={{marginTop:12}}>Admin标准模板<TemplateSearch catalog={catalog} disabled={busy} value={item.standardPlanId||''} onChange={e=>{const t=catalog.find(t=>t.id===e.target.value);setDraft(d=>({...d,items:d.items.map((r,i)=>i===index?{...r,standardPlanId:t?.id||'',templateHash:t?.hash||'',title:t?.name||r.title}:r)}))}} />{(()=>{const t=catalog.find(t=>t.id===item.standardPlanId);return t&&<details><summary>标准内容与周期（按库保留）</summary><p>{t.content}</p><p>{t.schedule}</p></details>})()}</div>}
          {item.moveFrom&&<div style={{background:'#FFF4D6',padding:8}}>确认后从“{labels[item.moveFrom.key]}”移除：{rowTitle(plan?.moduleData?.[item.moveFrom.key]?.records?.[item.moveFrom.index])}，并保留迁移记录。请将下方处理建议修订为最终确认内容。</div>}
          <label>新增或更新<select className="form-input" value={item.target??-1} onChange={e=>edit(index,'target',Number(e.target.value))}><option value={-1}>新增（同名事项自动合并）</option>{(plan?.moduleData?.[item.key]?.records||[]).map((r,i)=><option key={i} value={i}>更新：{rowTitle(r)}</option>)}</select></label>
          {Number(item.target)>=0&&<div style={{whiteSpace:'pre-wrap',background:'#F3F6F4'}}>原内容：{plan?.moduleData?.[item.key]?.records?.[item.target]?.reason||'未填写原因'}</div>}
          {[['title','事项'],['reason','客观依据'],['advice','处理建议'],['timeWindow','建议时机（如三个月后）'],['date','明确日期（可留空）'],['timingReason','时间依据']].map(([k,l])=><label key={k} style={{display:'block'}}>{l}{['reason','advice','timingReason'].includes(k)?<textarea className="form-input" value={item[k]||''} onChange={e=>edit(index,k,e.target.value)}/>:<DateField className="form-input" disabled={busy||(k==='date'&&item.datePending)} type={k==='date'?'date':'text'} value={item[k]||''} onChange={e=>edit(index,k,e.target.value)}/>}</label>)}
          <label><input type="checkbox" checked={!!item.datePending} onChange={e=>edit(index,'datePending',e.target.checked)}/> 日期待确认（先保存建议；若更新旧事项，将清除其原日期）</label>
          <details open={['precautions','customerAction','frequency'].some(k=>!!item[k])}>
            <summary>研判带入的执行要求</summary>
            <p>仅提取研判已明确的内容；未提及的字段保留原方案，顾问可核对修改。</p>
            {[['precautions','客户注意事项'],['customerAction','客户行动'],['frequency','执行频次']].map(([k,label])=><label key={k} style={{display:'block'}}>{label}<textarea className="form-input" value={item[k]||''} placeholder="研判未明确，暂无补充" onChange={e=>edit(index,k,e.target.value)}/></label>)}
          </details>
        </div>)}
        <button className="btn btn-primary" disabled={busy||!draft.items.some(i=>i.selected!==false)} onClick={()=>run('apply')}>{busy?'保存中…':'确认并保存到年度方案'}</button>
      </>}
      {error&&<div role="alert" style={{color:'#B42318',marginTop:8}}>{error}</div>}
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={()=>{setOpen(false);setDraft(null)}} style={{marginLeft:8}}>关闭</button>
    </section>}
  </div>
}
