import React,{useEffect,useState,useRef} from 'react'
import {careFlowAPI} from '../api'
import config from '../../../shared/careFlow.cjs'
import booking from '../../../shared/annualBookingPlan.cjs'
import briefTools from '../../../shared/annualConsultationBrief.cjs'
import CareFlowHandoff from './CareFlowHandoff'
import CareFlowExaminations,{initialExaminations} from './CareFlowExaminations'

export default function CareFlowCard({task,staff,initialData=null,onCompleted}){
  const [data,setData]=useState(initialData),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [form,setForm]=useState({}),[back,setBack]=useState({}),[confirmed,setConfirmed]=useState(false),[correction,setCorrection]=useState('')
  const [file,setFile]=useState(null),[fileTitle,setFileTitle]=useState(''),[category,setCategory]=useState('outpatient_record')
  const topRef=useRef(null)
  const errorRef=useRef(null)
  useEffect(()=>{if(error)errorRef.current?.scrollIntoView({block:'center',behavior:'smooth'})},[error,busy])
  useEffect(()=>{if(initialData)topRef.current?.scrollIntoView({block:'start'})},[initialData])
  const receive=r=>{setData(r.data);setForm({});setConfirmed(false);setCorrection('');setBack({})}
  useEffect(()=>{if(initialData)return;let active=true;careFlowAPI.task(task._id).then(r=>{if(active)receive(r)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[task._id,initialData])
  const act=async (fn,completed=false)=>{setBusy(true);setError('');try{receive(await fn());if(completed)onCompleted?.()}catch(e){setError(e.message);if(data?._id)try{setData((await careFlowAPI.get(data._id)).data)}catch{}}finally{setBusy(false)}}
  if(!data)return <p role={error?'alert':undefined}>{error||'正在加载服务流程…'}</p>
  if(data.unstarted)return <section><h3>完整就医协助流程</h3><p>启用后，本次事项进入执行、资料上传、健管审核、随访草稿和顾问审核流程。各环节支持定向回退、修订直返，年度方案保持不变。</p><button className="btn btn-primary" disabled={busy} onClick={()=>act(()=>careFlowAPI.start(task._id))}>进入本次完整流程</button>{error&&<p role="alert">{error}</p>}</section>
  const s=data.state,stage=s.stage,current=s.people[config.roles[stage]],mine=staff?.role==='superadmin'||(staff?.role===current?.role&&String(staff?._id)===String(current?.id))
  const existing=s.data[stage]||{},get=(key,fallback='')=>form[key]??existing[key]??fallback,set=(key,value)=>setForm(p=>({...p,[key]:value}))
  const plan={plannedContent:s.data.advisor?.text||'',sourceScheduleKey:s.sourceScheduleKey},slots=booking.bookingSlots(plan)
  const brief=briefTools.consultationBrief({},plan)
  const input=(key,label,rows=3,fallback='')=><label style={{display:'grid',gap:6}}>{label}<textarea className="form-input" rows={rows} value={get(key,fallback)} onChange={e=>set(key,e.target.value)} maxLength={10000}/></label>
  const entries=slots.map(slot=>({id:slot.id,mode:'prebook',date:'',time:'',note:'',hospital:slot.hospital,...s.data.booking?.entries?.find(e=>e.id===slot.id),...form.entries?.find(e=>e.id===slot.id)}))
  const reportChoices=[...(data.reports||[]),...(data.availableReports||[]).filter(r=>!(data.reports||[]).some(v=>String(v._id)===String(r._id)))];
  const changeEntry=(id,key,value)=>set('entries',entries.map(e=>e.id===id?{...e,[key]:value}:e))
  const complete=()=>{
    let value={...existing,...form}
    if(stage==='booking')value={entries:entries.map(e=>({id:e.id,mode:e.mode,date:e.date,time:e.time,note:e.note,hospital:e.hospital}))}
    if(stage==='planner')value={assigneeId:get('assigneeId'),note:get('note')}
    if(stage==='execute')value={...value,examinations:get('examinations',initialExaminations(s))}
    if(stage==='upload')value={reportIds:get('reportIds',s.data.upload?.reportIds||[]),note:get('note')}
    if(stage==='review')value={content:get('content',s.data.draft?.content||''),date:get('date',s.data.draft?.date||''),note:get('note')}
    return act(()=>careFlowAPI.action(data._id,{action:'complete',revision:data.revision,confirmed,correction,value}),true)
  }
  return <section ref={topRef} style={{display:'grid',gap:16,fontSize:14,lineHeight:1.6}}>
    <h3 style={{margin:0}}>{s.title}</h3><p>当前：{stage==='closed'&&!s.finalized?'顾问已通过，待同步随访任务':config.labels[stage]}{current&&` · ${current.name}`}</p>
    <CareFlowHandoff state={s}/>
    {error&&<div ref={errorRef} role="alert" style={{color:'#B91C1C',background:'#FFF1F2',padding:16,borderRadius:12}}>提交未完成：{error}。已填写的内容仍保留，请核对后重试。</div>}
    {s.returns?.length>0&&<div role="status" style={{background:'#FFF7E6',padding:12}}>退回修订：{s.returns.at(-1).reason}<br/>修订后直接返回：{config.labels[s.returns.at(-1).from]} · {s.returns.at(-1).name}</div>}
    {s.lastCorrection&&<div style={{background:'#EFF8F3',padding:12}}>最新修订：{s.lastCorrection.correction}（原内容保留在下方记录）</div>}
    {s.bookingStale&&<p role="alert">顾问要求已变化，请定向退回健管预约核对，再直返本环节。</p>}
    <section style={{background:'#F6FBF8',padding:12}}><h4>就医目的与专家沟通（本次顾问交接）</h4><div style={{whiteSpace:'pre-wrap'}}>{brief.reason||'就医原因未明确，请退回顾问补充。'}{brief.basis&&`\n依据：${brief.basis}`}{brief.communication&&`\n明确沟通要求：${brief.communication}`}</div><p>向专家说明上述目的与既往检查记录，请专家评估本次项目：{brief.items||'待顾问明确'}。记录专家意见、开单和后续要求，不自行新增医疗判断。</p></section>
    <details><summary>本次交接与各环节结果（年度方案不覆盖）</summary>{Object.entries(s.data).map(([k,v])=><div key={k}><h4>{config.labels[k]}</h4><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word',fontFamily:'inherit'}}>{k==='advisor'?v?.text:k==='booking'?(v?.entries||[v]).filter(Boolean).map(e=>`${e.title||''} ${e.hospital||''} ${e.department||''} ${e.expert||''} ${e.date||'现场或无需预约'} ${e.time||''} ${e.note||''}`).join('\n'):k==='audit'?v?.note:k==='upload'?v?.note:typeof v?.content==='string'?v.content: v?.text||v?.note||''}</pre></div>)}</details>
    {(data.reports||[]).length>0&&<section><h4>本次资料</h4>{data.reports.map(r=><div key={r._id}><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> · {r.audit_status==='audited'?'已审核':'待审核'}</div>)}</section>}
    {mine&&stage!=='closed'&&<>
      {stage==='advisor'&&input('text','修订本次顾问交接（保留明确的原因、项目、科室、专家及沟通要求）',10)}
      {stage==='booking'&&slots.map((slot,i)=>{const e=entries[i];return <section key={slot.id} style={{background:'#F6FBF8',padding:12,display:'grid',gap:8}}><b>{slot.title}</b><div>{slot.hospital||'医院未指定'} · {slot.department||'科室待顾问明确'} · {slot.expert||'未指定专家'}</div><select className="form-input" value={e.mode} onChange={ev=>changeEntry(slot.id,'mode',ev.target.value)}><option value="prebook">提前预约</option>{slot.type==='exam'&&<option value="onsite">现场预约</option>}<option value="not_required">无需预约（说明依据）</option></select>{e.mode==='prebook'&&<><input aria-label="预约日期" type="date" className="form-input" value={e.date} onChange={ev=>changeEntry(slot.id,'date',ev.target.value)}/><input aria-label="预约时间" type="time" className="form-input" value={e.time} onChange={ev=>changeEntry(slot.id,'time',ev.target.value)}/>{!slot.hospital&&<input placeholder="实际医院" className="form-input" value={e.hospital} onChange={ev=>changeEntry(slot.id,'hospital',ev.target.value)}/>}</>}<textarea placeholder="预约备注或现场交接要求" className="form-input" value={e.note} onChange={ev=>changeEntry(slot.id,'note',ev.target.value)}/></section>})}
      {stage==='planner'&&<><label>办理人员<select className="form-input" value={get('assigneeId')} onChange={e=>set('assigneeId',e.target.value)}><option value="">请选择就医专员</option>{data.assistants.map(a=><option key={a._id} value={a._id}>{a.name}</option>)}</select></label>{input('note','派单说明（选填）')}</>}
      {stage==='execute'&&<>{input('text','专家沟通与实际办理结果',5)}<CareFlowExaminations rows={get('examinations',initialExaminations(s))} onChange={rows=>set('examinations',rows)}/></>}
      {stage==='upload'&&<><label>资料类型<select className="form-input" value={category} onChange={e=>setCategory(e.target.value)}><option value="outpatient_record">门诊病历</option><option value="prescription_order">处方/医嘱单</option><option value="exam_report">检查报告</option></select></label><input className="form-input" placeholder="资料名称" value={fileTitle} onChange={e=>setFileTitle(e.target.value)}/><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0])}/><button disabled={busy||!file||!fileTitle.trim()} onClick={()=>act(()=>{const body=new FormData();body.append('file',file);body.append('title',fileTitle);body.append('category',category);return careFlowAPI.upload(data._id,body)})}>上传并留存原件</button><p>可勾选客户已上传的本次报告，无需重复上传；请核对报告名称和检查日期。</p><a href={`/patients/${data.patientId}?tab=reports`} target="_blank" rel="noreferrer">查看并审核客户报告</a>{reportChoices.map(r=><label key={r._id}><input type="checkbox" checked={get('reportIds',s.data.upload?.reportIds||[]).includes(String(r._id))} onChange={e=>set('reportIds',e.target.checked?[...get('reportIds',s.data.upload?.reportIds||[]),String(r._id)]:get('reportIds',s.data.upload?.reportIds||[]).filter(v=>v!==String(r._id)))}/>{r.title} · {r.checkDate||''} · {r.audit_status==='audited'?'已审核':'待审核'}（取消仅移出本次交接，原件保留）</label>)}{input('note','资料完整性说明、尚缺内容或补传说明')}</>}
      {stage==='audit'&&<><p>先在客户报告管理完成逐份审核；本环节不会替代原报告审核。</p><a href={`/patients/${data.patientId}?tab=reports`} target="_blank" rel="noreferrer">打开客户报告管理</a>{input('note','本次资料审核意见（确认齐全后自动生成随访草稿）',5)}</>}
      {(stage==='draft'||(stage==='review'&&s.draftStale))&&<><p>{s.generationError||'资料已审核，等待生成随访草稿。生成失败不会结束服务。'}</p><button disabled={busy} onClick={()=>act(()=>careFlowAPI.generate(data._id))}>生成 / 重试随访草稿</button></>}
      {stage==='review'&&!s.draftStale&&<>{input('content','审核修订随访计划',8,s.data.draft?.content||'')}<label>随访日期<input type="date" className="form-input" value={get('date',s.data.draft?.date||'')} onChange={e=>set('date',e.target.value)}/></label>{input('note','顾问审核意见')}</>}
      {s.returns?.length>0&&<label>本次修订说明（必填）<textarea className="form-input" value={correction} onChange={e=>setCorrection(e.target.value)} maxLength={3000}/></label>}
      {stage!=='draft'&&!(stage==='review'&&s.draftStale)&&<><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 我已核对本次交接及修订内容</label><button className="btn btn-primary" disabled={busy||!confirmed||(s.returns?.length>0&&!correction.trim())} onClick={complete}>{s.returns?.length?'修订完成，直接返回发起环节':stage==='review'?'审核通过，生成随访任务并结束服务':stage==='planner'?'确认派单，交就医专员':'完成本环节，交下一步'}</button></>}
    </>}
      {mine&&config.targets(s).length>0&&<details aria-label="退回修订" style={{borderTop:"1px solid #E0D9CE",paddingTop:12}}><summary style={{cursor:"pointer",color:"#65776F"}}>信息有误？退回修订</summary><p>①选择退回环节和负责人　②选择问题分类并填写原因　③确认回退。修订完成后直接返回本环节，原年度方案不覆盖。</p><div style={{display:'grid',gap:8}}><select className="form-input" value={back.target||''} onChange={e=>setBack({...back,target:e.target.value,category:"",reason:""})}><option value="">选择责任环节</option>{config.targets(s).map(k=><option key={k} value={k}>{config.labels[k]} · {s.people[config.roles[k]]?.name||'尚未分配'}</option>)}</select><select className="form-input" disabled={!back.target} value={back.category||''} onChange={e=>setBack({...back,category:e.target.value})}><option value="">问题分类（非责任认定）</option>{Object.entries(back.target?config.problemLabels(back.target):{}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><textarea className="form-input" placeholder="具体问题及需修订内容（必填）" value={back.reason||''} onChange={e=>setBack({...back,reason:e.target.value})} maxLength={2000}/><button disabled={busy||!back.target||!back.category||!back.reason?.trim()} onClick={()=>act(()=>careFlowAPI.action(data._id,{action:'return',revision:data.revision,...back}))}>确认回退并留痕</button></div></details>}
    {!mine&&stage!=='closed'&&<p>等待当前负责人处理；其他岗位不能越级提交。</p>}
    <button disabled={busy} onClick={()=>act(()=>careFlowAPI.action(data._id,{action:'sync'}))}>刷新并同步本环节任务（不重复创建）</button>
    <details><summary>完整流转及修订记录（{data.events.length}）</summary>{data.events.map((e,i)=><div key={i} style={{borderBottom:'1px solid #ddd',padding:10}}><b>{config.labels[e.stage]||e.stage} · {({start:'接入',complete:'完成交接',return:'回退',correct:'修订直返',upload:'上传',draft_requested:'生成草稿',draft_generated:'草稿生成完成',draft_failed:'生成未完成',quality_review:'质量复核',upload_owner_updated:'报告承接岗位调整'})[e.action]||e.action}</b><div>{e.name||e.role||'系统'} · {new Date(e.at).toLocaleString('zh-CN')}</div>{e.action==='upload_owner_updated'&&<div>{e.reason}（原负责人：{e.previousAssignee}；现负责人：{e.assignedTo}）</div>}{e.reason&&e.action!=='upload_owner_updated'&&<div>问题：{e.reason}；责任环节：{config.labels[e.targetStage]} · {e.targetName}（归因待复核）</div>}{e.correction&&<div>修订：{e.correction}；返回{config.labels[e.returnTo]}；耗时{Math.round(e.durationMs/60000)}分钟</div>}{(e.before||e.after)&&<details><summary>修订前后原文</summary><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{JSON.stringify({修订前:e.before,修订后:e.after},null,2)}</pre></details>}</div>)}</details>
    {error&&<p role="alert" style={{color:'#B91C1C'}}>{error}</p>}
  </section>
}
