import React,{useEffect,useState} from 'react'
import {staffAPI} from '../api'
import interviewTools from '../../../shared/lifestyleInterview.cjs'
import DateField from '../../../shared/DateField.jsx'
const text=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v)
function Answer({q,value,onChange,disabled}) {
 const options=(q.options||[]).map(o=>typeof o==='string'?{label:o}:o)
 if(['radio','dropdown','multi'].includes(q.type)) {
  const multi=q.type==='multi',selected=multi?(Array.isArray(value)?value:value?.values||[]):[typeof value==='object'?value?.value:value],inputs=value?.inputs||{}
  return <div>{options.map(o=><div key={o.label}><label><input type={multi?'checkbox':'radio'} disabled={disabled} checked={selected.includes(o.label)} onChange={e=>{
   if(multi){const values=e.target.checked?(o.exclusive?[o.label]:[...selected.filter(v=>!options.find(x=>x.label===v)?.exclusive),o.label]):selected.filter(v=>v!==o.label);onChange({values,inputs:Object.fromEntries(Object.entries(inputs).filter(([key])=>values.includes(key)))})}
   else onChange(o.allowInput?{value:o.label,input:''}:o.label)
  }}/>{o.label}</label>{o.allowInput&&selected.includes(o.label)&&<input className="form-input" aria-label={`${q.text}：${o.label}补充`} disabled={disabled} value={multi?inputs[o.label]||'':value?.input||''} onChange={e=>onChange(multi?{values:selected,inputs:{...inputs,[o.label]:e.target.value}}:{value:o.label,input:e.target.value})}/>}</div>)}</div>
 }
 if(q.type==='matrix')return <div>{(q.rows||[]).map(row=><label key={row}>{row}<select className="form-input" disabled={disabled} value={value?.[row]||''} onChange={e=>onChange({...value,[row]:e.target.value})}><option value="">待确认</option>{(q.cols||[]).map(col=><option key={col}>{col}</option>)}</select></label>)}</div>
 if(q.type==='date')return <DateField className="form-input" type="date" disabled={disabled} value={value||''} onChange={e=>onChange(e.target.value)}/>
 return <input className="form-input" type={['number','scale'].includes(q.type)?'number':'text'} min={q.min} max={q.max} disabled={disabled} placeholder={q.placeholder||'未问清请留空'} value={value??''} onChange={e=>onChange(e.target.value)}/>
}
export default function AnnualNutritionAssessmentForm({task,staff,onSaved}) {
 const [data,setData]=useState(null),[answers,setAnswers]=useState({}),[confirmed,setConfirmed]=useState([]),[notes,setNotes]=useState(''),[method,setMethod]=useState('电话访谈'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[conflicts,setConflicts]=useState(false),[filter,setFilter]=useState('all')
 useEffect(()=>{let alive=true;staffAPI.getLifestyleInterview(task._id).then(r=>{if(!alive)return;const d=r.data,i=d.task.formData?.lifestyleInterview;setData(d);setAnswers(i?.answers||d.initialAnswers);setConfirmed(i?.confirmed||[]);setNotes(i?.notes||'');setMethod(i?.method||'电话访谈')}).catch(e=>{if(alive)setMessage(e.message)});return()=>{alive=false}},[task._id,task.updatedAt])
 if(!data)return <p role="status">{message||'正在读取膳食问卷与生活方式档案…'}</p>
 const current=data.task,editable=['planned','in_progress','missed'].includes(current.status)&&(staff.role==='superadmin'||(staff.role==='nutritionist'&&String(current.assignedTo?._id||current.assignedTo)===String(staff._id)))
 const applying=current.formData?.lifestyleInterview?.phase==='applying',disabled=!editable||busy||applying
 const questions=interviewTools.visibleQuestions(data.template.questions,answers,data.gender)
 async function save(action){setBusy(true);setMessage('');try{const r=await staffAPI.saveLifestyleInterview(task._id,{action,answers,confirmed,notes,method,patientVersion:data.patientVersion,templateVersion:data.template.updatedAt,baseUpdatedAt:current.updatedAt,confirmConflicts:conflicts});onSaved(r.data)}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <section>
  <h3>生活方式访谈与核实</h3><p>复用「{data.template.title}」。逐项核实后勾选；未问清保持待确认。提交后已核实的生活方式字段写入档案，营养师确认后即完成本次任务，无需健康顾问审核。</p>
  <details><summary>本次评估依据及要求</summary><p style={{whiteSpace:'pre-wrap'}}>{current.plannedContent||current.content}</p></details>
  <p>{data.sourceResponseId?'已带入最近答卷；请结合当前档案核实。':'尚无答卷，可通过访谈代填。'} 已核实 {confirmed.length}/{questions.length} 项</p>
  <label>访谈方式<select className="form-input" disabled={disabled} value={method} onChange={e=>setMethod(e.target.value)}>{['电话访谈','视频访谈','当面访谈','客户问卷核实'].map(v=><option key={v}>{v}</option>)}</select></label>
  <label>显示<select className="form-input" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部问题</option><option value="pending">待核实问题</option></select></label>
  {questions.filter(q=>filter!=='pending'||!confirmed.includes(q.id)).map((q,index)=><div key={q.id} style={{border:'1px solid #DCE5E0',borderRadius:10,padding:14,marginTop:12}}>
   <b>{index+1}. {q.text}</b>
   {data.archive[q.id]!==undefined&&<p style={{fontSize:12,color:'#65776F'}}>当前档案：{text(data.archive[q.id])}</p>}
   {answers[q.id]!==undefined&&<p style={{fontSize:12,color:'#65776F'}}>当前答案：{text(answers[q.id])}</p>}
   <Answer q={q} value={answers[q.id]} disabled={disabled} onChange={v=>{setAnswers(a=>({...a,[q.id]:v}));setConfirmed(c=>c.filter(id=>id!==q.id));setConflicts(false)}}/>
   {editable&&<button className="btn btn-secondary btn-sm" disabled={disabled} onClick={()=>{setAnswers(a=>({...a,[q.id]:''}));setConfirmed(c=>c.filter(id=>id!==q.id));setConflicts(false)}}>清空 / 待确认</button>}
   <label><input type="checkbox" disabled={disabled||answers[q.id]===undefined||answers[q.id]===''} checked={confirmed.includes(q.id)} onChange={e=>setConfirmed(c=>e.target.checked?[...c,q.id]:c.filter(id=>id!==q.id))}/>已核实</label>
  </div>)}
  <label style={{display:'block',marginTop:16}}>营养师评估意见 / 待补信息<textarea className="form-input" rows={4} disabled={disabled} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  {current.formData?.nutritionResultReview?.action==='returned'&&<p>退回意见：{current.formData.nutritionResultReview.note}</p>}
  {editable&&<><label><input type="checkbox" disabled={disabled} checked={conflicts} onChange={e=>setConflicts(e.target.checked)}/>已核对勾选内容与原档案的差异，确认更新</label><div style={{display:'flex',gap:8,marginTop:12,position:'sticky',bottom:0,background:'white',padding:12}}>{!applying&&<button className="btn btn-secondary" disabled={busy} onClick={()=>save('draft')}>暂存访谈</button>}<button className="btn btn-primary" disabled={busy} onClick={()=>save('submit')}>{applying?'继续完成提交':'确认写入档案并完成评估'}</button></div></>}
  {!editable&&<p>{'评估已完成，记录只读。'}</p>}
  {message&&<p role="alert">{message}</p>}
 </section>
}
