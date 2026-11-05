import React, { useEffect, useState } from 'react'
import { managementReviewAPI as api } from '../api'
const labels={monthly:'月度复盘',quarterly:'季度评估',annual:'年度总评'}
const statuses={collecting:'各岗位复盘中',advisor_review:'待健康顾问审核',finalized:'已审核归档'}
const fields={action:'本岗位行动 / 分析重点',execution:'实际执行与观察结果',reason:'未完成原因 / 变化原因（区分已核实与待核实）',impact:'影响与待解决问题',feedback:'客户反馈与处理结果',evidence:'依据：来源记录、日期及已核实事实',next:'下一步建议'}
const evidenceText=s=>[typeof s.content==='string'?s.content:'',s.executedContent, ...Object.values(s.sections||{}),...(s.items||s.reportItems||[]).map(x=>[x.name,x.value,x.unit,x.status,x.scheduledDate?.slice(0,10),x.notes].filter(Boolean).join(' · '))].filter(Boolean).join('\n') || '请结合客户完整方案或原始报告核对具体内容。'
const empty={action:'',execution:'',reason:'',impact:'',feedback:'',evidence:'',next:'',state:'unknown'}
export default function ManagementReviewPanel({patientId,initialData}) {
 const [data,setData]=useState(initialData),[kind,setKind]=useState('monthly'),[key,setKey]=useState(new URLSearchParams(window.location.search).get('month')||''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[focus,setFocus]=useState(''),[questions,setQuestions]=useState({}),[rehab,setRehab]=useState(false),[basis,setBasis]=useState(''),[form,setForm]=useState(empty),[summary,setSummary]=useState(''),[nextPlan,setNextPlan]=useState(''),[actions,setActions]=useState([]),[sources,setSources]=useState(null),[sourceError,setSourceError]=useState(''),[returnNotes,setReturnNotes]=useState({}),[addRole,setAddRole]=useState('rehabSpecialist'),[addNote,setAddNote]=useState('');
 const period=data?.periods.find(p=>p.key===key), row=data?.rows.find(r=>r.periodKey===key);
 useEffect(()=>{if(!data)return;const selected=data.periods.find(p=>p.key===key);if(selected){setKind(selected.kind);return}const p=data.periods.filter(p=>p.kind===kind&&p.due).at(-1)||data.periods.find(p=>p.kind===kind);setKey(p?.key||'')},[data]);
 useEffect(()=>{setForm({...empty,...row?.contributions?.[data.role]});setSummary(row?.summary||'');setNextPlan(row?.nextPlan||'');setActions(row?.actions||[]);setFocus(row?.focus||'');setQuestions(row?.questions||{});setReturnNotes({});setError('');setSources(null);setSourceError('')},[key,row?.__v]);
 const run=async fn=>{setBusy(true);setError('');try{await fn();setData((await api.get(patientId)).data)}catch(e){setError(e.message)}finally{setBusy(false)}};
 const send=(action,body={})=>run(()=>api.act(patientId,row._id,action,{revision:row.__v,...body}));
 const changeKind=value=>{setKind(value);const ps=data.periods.filter(p=>p.kind===value);setKey((ps.filter(p=>p.due).at(-1)||ps[0])?.key||'')};
 const loadSources=async()=>{setSourceError('');try{setSources((await api.sources(patientId,key)).data)}catch(e){setSourceError(e.message)}};
 const input=(label,value,onChange,rows=2)=><label style={{display:'block',margin:'12px 0'}}>{label}<textarea className="form-input" rows={rows} maxLength={label.includes('下年度')?4000:1200} style={{width:'100%'}} value={value} onChange={e=>onChange(e.target.value)} disabled={busy}/></label>;
 const roles=['nutritionist','healthManager',...(kind==='monthly'?[]:['familyDoctor']),...(rehab?['rehabSpecialist']:[])];
 return <div className="card" style={{padding:20}}>
  <h2>{data.patientName} · 持续管理复盘</h2><p>服务期：{String(data.serviceStart||'').slice(0,10)} 至 {String(data.serviceEnd||'').slice(0,10)}。以档案登记日期计算，请健康顾问核对服务依据。</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{Object.entries(labels).map(([k,v])=><button className={'btn '+(kind===k?'btn-primary':'btn-secondary')} key={k} onClick={()=>changeKind(k)}>{v}</button>)}</div>
  <select className="form-input" style={{margin:'16px 0'}} value={key} onChange={e=>setKey(e.target.value)}>{data.periods.filter(p=>p.kind===kind).map(p=><option key={p.key} value={p.key}>{p.label}{p.due?'':' · 尚未到期'}</option>)}</select>
  {error&&<p role="alert" style={{color:'#b42318'}}>{error}</p>}
  {period&&<p>{period.start} — {period.end} · {row?statuses[row.status]:period.due?'待建立':'观察中'}</p>}
  <p style={{color:'#65776f'}}>{kind==='monthly'?'各岗位复盘行动执行、障碍和客户反馈，提交健康顾问审核。':kind==='quarterly'?'健康顾问分发重点问题，各专业分析原因后综合确认。':'团队总评全年行动和健康结果，制定下年度目标、计划和评估节点。'}</p>
  {!row&&period&&!period.due&&<div style={{padding:18,background:'#f2f6f3'}}>本周期尚未结束，到期后开放正式评估。{kind==='annual'&&'年度总评包括持续行为改变、预防计划落实、重要问题结局、客户反馈及下一年度计划。'}</div>}
  {!row&&period?.due&&<>
   {input('本周期一个主要行动重点',focus,setFocus)}
   {data.canReview&&<><label><input type="checkbox" checked={rehab} onChange={e=>setRehab(e.target.checked)}/> 有运动复健指导，邀请运动复健师</label>{rehab&&input('运动复健指导依据',basis,setBasis)}</>}
   {kind!=='monthly'&&roles.map(r=>input('分发给'+data.labels[r]+'的问题',questions[r]||'',v=>setQuestions({...questions,[r]:v})))}
   {(kind==='monthly'||data.canReview)&&<button className="btn btn-primary" disabled={busy} onClick={()=>run(()=>api.create(patientId,{periodKey:key,focus,questions,includeRehab:rehab,rehabBasis:basis}))}>建立并分发{labels[kind]}</button>}
  </>}
  {row&&<>
   <h3>本期重点：{row.focus}</h3>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{row.roles.map(r=><span key={r} style={{padding:8,background:'#f2f6f3',borderRadius:8}}>{data.labels[r]}：{row.contributions?.[r]?.status==='submitted'?'已提交':row.contributions?.[r]?.status==='returned'?'已退回':'待提交'}</span>)}</div>
   {row.roles.includes(data.role)&&row.status==='collecting'&&<section>
    <h3>我的复盘</h3><p>{row.questions?.[data.role]}</p>{row.contributions?.[data.role]?.returnNote&&<p style={{color:'#b42318'}}>顾问退回：{row.contributions[data.role].returnNote}</p>}
    <select className="form-input" value={form.state} onChange={e=>setForm({...form,state:e.target.value})}>{Object.entries({completed:'已完成',partial:'部分完成',not_done:'未完成',unknown:'待核实',not_applicable:'本期无适用行动'}).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
    {Object.entries(fields).map(([k,v])=><React.Fragment key={k}>{input(v,form[k],value=>setForm({...form,[k]:value}))}</React.Fragment>)}
    <button className="btn btn-primary" disabled={busy} onClick={()=>send('submit',{contribution:form})}>提交健康顾问审核</button>
   </section>}
   {row.roles.map(r=><details key={r} style={{marginTop:12}}><summary>{data.labels[r]} · 查看复盘与依据</summary><p>{row.questions?.[r]}</p>{Object.entries(fields).map(([k,v])=><p key={k}><b>{v}：</b>{row.contributions?.[r]?.[k]||'待提交'}</p>)}{data.canReview&&row.status!=='finalized'&&<>{input('退回原因',returnNotes[r]||'',v=>setReturnNotes({...returnNotes,[r]:v}))}<button className="btn btn-secondary" disabled={busy} onClick={()=>send('return',{role:r,note:returnNotes[r]})}>退回该岗位</button></>}</details>)}
   {data.canReview&&row.status!=='finalized'&&<details style={{marginTop:16}}><summary>增加专业协作</summary><select value={addRole} onChange={e=>setAddRole(e.target.value)}>{Object.entries(data.labels).filter(([r])=>!row.roles.includes(r)&&data.assigned[r]).map(([r,l])=><option key={r} value={r}>{l}</option>)}</select>{input('分发问题及指导依据',addNote,setAddNote)}<button disabled={busy} onClick={()=>send('add-role',{role:addRole,note:addNote})}>分发</button></details>}
   {data.canReview&&row.status==='advisor_review'&&<>
    {input('健康顾问审核结论',summary,setSummary)}{kind==='annual'&&input('下年度目标、行动计划、责任岗位及评估节点',nextPlan,setNextPlan,5)}
    <h3>下一步行动</h3>{actions.map((a,i)=><div key={i} style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}><input className="form-input" placeholder="具体行动" value={a.title} onChange={e=>setActions(actions.map((v,j)=>j===i?{...v,title:e.target.value}:v))}/><select value={a.role} onChange={e=>setActions(actions.map((v,j)=>j===i?{...v,role:e.target.value}:v))}>{Object.entries(data.labels).filter(([r])=>data.assigned[r]).map(([r,l])=><option key={r} value={r}>{l}</option>)}</select><input type="date" value={a.dueAt} onChange={e=>setActions(actions.map((v,j)=>j===i?{...v,dueAt:e.target.value}:v))}/><button onClick={()=>setActions(actions.filter((_,j)=>i!==j))}>移除</button></div>)}
    <button className="btn btn-secondary" onClick={()=>setActions([...actions,{title:'',role:'healthManager',dueAt:''}])}>增加行动</button> <button className="btn btn-primary" disabled={busy} onClick={()=>send('finalize',{summary,nextPlan,actions})}>审核通过并归档</button>
   </>}
   {row.status==='finalized'&&<><h3>审核结论</h3><p style={{whiteSpace:'pre-wrap'}}>{row.summary}</p>{row.nextPlan&&<><h3>下一年度计划</h3><p style={{whiteSpace:'pre-wrap'}}>{row.nextPlan}</p></>}{row.actions.map(a=><p key={a._id}>{a.title} · {data.labels[a.role]} · {a.dueAt} · {a.status==='completed'?'已完成':<>待完成 {data.role===a.role&&<button disabled={busy} onClick={()=>send('complete-action',{actionId:a._id})}>完成</button>}</>}</p>)}</>}
   <details style={{marginTop:16}}><summary>提交、退回与审核记录</summary>{row.audit.map((a,i)=><p key={i}>{new Date(a.at).toLocaleString('zh-CN')} · {{created:'建立并分发',submit:'岗位提交',return:'退回补充','add-role':'增加专业分发',finalize:'审核归档','complete-action':'行动完成'}[a.action]||a.action} · {data.labels[a.role]||'团队'} {a.note}</p>)}</details>
  </>}
  {period&&<details style={{marginTop:22}} onToggle={e=>{if(e.currentTarget.open&&!sources)loadSources()}}><summary>查看原始方案、计划执行、检查与历史复盘依据</summary>{sourceError&&<p>{sourceError} <button onClick={loadSources}>重试</button></p>}{!sources&&!sourceError&&<p>正在读取依据…</p>}{sources&&<><p>{sources.note}</p>{[['phase','原阶段记录'],['monthly','原月度草稿'],['plans','既有方案（按制定时间核对适用范围）'],['followups','本期随访'],['reports','本期已审核报告'],['services','本期服务记录']].map(([k,title])=><details key={k}><summary>{title} · {sources[k].length}条</summary>{sources[k].map((s,i)=><details key={s._id||i} style={{margin:8}}><summary>{s.title||s.periodLabel||s.month||s.theme||'记录'} · {s.checkDate||s.date?.slice(0,10)||s.createdAt?.slice(0,10)} · {s.status||''}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit'}}>{evidenceText(s)}</pre></details>)}</details>)}</>}</details>}
 </div>
}
