import React, { useEffect, useState } from 'react'
import { rehabAPI } from '../api'
const fields = { goal:'本次目标',history:'运动与伤病情况',tests:'测试项目与实际结果',findings:'评估结论与当前能力',recommendations:'运动方式及起始安排',precautions:'注意事项与调整条件',nextReview:'复评安排',training:'本次指导与训练内容',response:'客户反馈与训练反应',nextSteps:'下一步安排' }
const kinds={initial:'首次运动能力评估',reassessment:'运动能力复评',training:'运动指导与复健训练',guidance:'日常线上答疑'}
const box={padding:16,border:'1px solid #DBE7E0',borderRadius:10,marginTop:12,background:'#fff'}
const row={display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}
const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
const date=()=>new Date().toLocaleDateString('sv-SE')
const answer=v=>typeof v==='string'?v:Array.isArray(v)?v.map(answer).join('、'):v && typeof v==='object'?Object.values(v).map(answer).join('；'):String(v??'未填写')

export default function RehabWorkspace({patientId,staff,view='assessment',onSaved}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [form,setForm]=useState(null),[plan,setPlan]=useState(null),[booking,setBooking]=useState(null),[notice,setNotice]=useState('')
  const canWrite=['rehabSpecialist','superadmin'].includes(staff?.role)
  const canSend=['rehabSpecialist','superadmin','healthManager','healthPlanner'].includes(staff?.role)
  const load=async()=>{try {const r=await rehabAPI.get(patientId);setData(r.data);setError('')}catch(e){setError(e.message)}}
  useEffect(()=>{setData(null);setForm(null);setPlan(null);load()},[patientId])
  const action=async(fn,message)=>{setBusy(true);setError('');setNotice('');try {await fn();await load();onSaved?.();setNotice(message);return true}catch(e){setError(e.message);return false}finally{setBusy(false)}}
  const start=(kind,record)=>setForm(record?{...record.structuredContent.rehab,recordId:record._id,requestId:uid()}:{kind,mode:kind==='guidance'?'online':'offline',date:date(),fields:{},orderId:'',planId:'',screeningResponseId:'',requestId:uid()})
  if(!data) return <div style={box}>{error || '正在加载运动管理资料…'}</div>
  const orders=data.orders || []
  const usable=orders.filter(o=>o.paymentStatus==='paid'&&!['completed','cancelled'].includes(o.status)&&!['requested','processing','refunded'].includes(o.refundStatus)&&!['closed','refund_pending','refunded'].includes(o.tradeStatus)&&(!o.expiresAt||new Date(o.expiresAt)>new Date()))
  const records=(data.records || []).filter(r=>view!=='assessment'||['initial','reassessment'].includes(r.structuredContent?.rehab?.kind))
  const orderSelect=(value,onChange)=><select className="form-input" value={value||''} onChange={e=>onChange(e.target.value)}><option value="">请选择关联订单</option>{orders.filter(o=>o.paymentStatus==='paid').map(o=><option key={o._id} value={o._id}>{o.serviceName} · {o.orderNo || o._id.slice(-6)} · 已用{o.usedUnits}/{o.totalUnits}次</option>)}</select>
  const labelInput=(label,child)=><label style={{display:'block',margin:'12px 0'}}><span style={{display:'block',marginBottom:5,fontWeight:600}}>{label}</span>{child}</label>
  return <div style={{padding:16}}>
    <div style={{...row,justifyContent:'space-between'}}><h3 style={{margin:0}}>{view==='assessment'?'运动筛查与能力评估':view==='plans'?'运动服务方案':'运动评估与复健'}</h3><button className="btn btn-secondary btn-sm" onClick={load}>刷新</button></div>
    {error&&<div role="alert" style={{...box,color:'#B42318',background:'#FFF3F1'}}>{error}</div>}
    {notice&&<div role="status" style={{...box,color:'#1E6B50'}}>{notice}</div>}
    {view==='assessment'&&<>
      <details style={box} open><summary style={{fontWeight:700}}>预约前筛查 · {data.responses.length}份答卷</summary>
        {canSend&&<div style={{...row,marginTop:12}}>{usable.map(o=><button key={o._id} disabled={busy} className="btn btn-secondary btn-sm" onClick={()=>action(()=>rehabAPI.send(patientId,'screening',{orderId:o._id}),'筛查表已发送；同一订单不会重复推送')}>{data.pushes.some(p=>p.sourceOrderId===o._id)?'确认筛查表已发送':'发送筛查表'} · {o.serviceName}</button>)}</div>}
        {!data.responses.length&&<p style={{color:'#65776F'}}>暂无已提交答卷。付款后自动推送，健管专员可在此跟进填写。</p>}
        {data.responses.map(r=><details key={r._id} style={box}><summary>运动预约前筛查 · {new Date(r.submittedAt).toLocaleString('zh-CN')}</summary>{(r.questionnaireSnapshot?.questions || data.questions.find(q=>q._id===r.questionnaire)?.questions || []).map(q=><p key={q.id}><strong>{q.text}</strong><br/>{answer(r.answers[q.id])}</p>)}</details>)}
      </details>
      <p style={{color:'#65776F'}}>完整记录同时归入服务档案；线上评估无法完成的测试，请注明未测项目及原因。</p>
    </>}
    {view==='plans'&&<>
      <p style={{color:'#65776F'}}>健康规划师确认接单，健管专员预约安排；运动复健师制定方案并直接发布。</p>
      {orders.map(o=><div style={box} key={o._id}><strong>{o.serviceName}</strong><p>{o.paymentStatus==='paid'?'已支付':'未支付'} · {o.status==='completed'?'已完成':o.status==='cancelled'?'已取消':o.currentStage==='rehab_booking'?'待健管预约':o.currentStage==='rehab_session'?'待开展服务':'待规划师接单'} · 已用 {o.usedUnits}/{o.totalUnits} 次</p>{o.expiresAt&&<p>有效期至 {new Date(o.expiresAt).toLocaleDateString('zh-CN')}{new Date(o.expiresAt)<=new Date()?'（已到期）':''}</p>}{o.rehabBooking&&<p>第{o.rehabBooking.sequence}次 · {new Date(o.rehabBooking.at).toLocaleString('zh-CN')} · {o.rehabBooking.mode==='online'?'线上':'线下'} · {o.rehabBooking.specialistName}</p>}<div style={row}>
        {usable.some(x=>x._id===o._id)&&['healthPlanner','superadmin'].includes(staff?.role)&&<button disabled={busy} className="btn btn-secondary btn-sm" onClick={()=>action(()=>rehabAPI.send(patientId,'handoff',{orderId:o._id}),'已交健管专员预约安排')}>确认接单并交健管预约</button>}
        {usable.some(x=>x._id===o._id)&&['healthManager','superadmin'].includes(staff?.role)&&<button className="btn btn-secondary btn-sm" onClick={()=>setBooking({orderId:o._id,mode:'offline',at:'',specialistId:''})}>安排预约</button>}
      </div></div>)}
      {canWrite&&<button className="btn btn-primary" style={{marginTop:16}} onClick={()=>setPlan({requestId:uid(),goal:'',exercises:'',weeklyFreq:'',duration:'',precautions:'',progression:'',orderId:''})}>制定运动服务方案</button>}
      {!data.plans.length&&<p>尚无运动方案。</p>}
      {data.plans.map(p=><details key={p._id} style={box}><summary>{p.title} · {p.pushedAt?'已发布':'草稿'} · {new Date(p.createdAt).toLocaleDateString('zh-CN')}</summary>{(p.items||[]).map((i,n)=><p key={n} style={{whiteSpace:'pre-wrap'}}>{i.name}</p>)}</details>)}
    </>}
    {view!=='plans'&&<>
      {canWrite&&<div style={{...row,marginTop:12}}>{(view==='assessment'?['initial','reassessment']:['initial','training','reassessment','guidance']).map(k=><button className="btn btn-primary btn-sm" key={k} onClick={()=>start(k)}>{kinds[k]}</button>)}</div>}
      {!records.length&&<p style={{color:'#65776F'}}>暂无运动评估或训练记录。</p>}
      {records.map(r=>{const e=r.structuredContent?.rehab;const o=orders.find(o=>o._id===e?.orderId);const redeemed=o?.redemptions?.some(x=>x.rehabRecordId===r._id);return <details style={box} key={r._id}><summary>{r.title} · {new Date(r.date).toLocaleDateString('zh-CN')} · {e?.mode==='online'?'线上':e?.mode==='offline'?'线下':''} · {e?.status==='draft'?'草稿':'已发布'} · {r.staffId?.name || ''}</summary><div style={{whiteSpace:'pre-wrap',lineHeight:1.8,margin:'12px 0'}}>{r.content}</div><div style={row}>
        {canWrite&&e?.status==='draft'&&String(r.staffId?._id||r.staffId)===String(staff?._id||staff?.id)&&<button className="btn btn-secondary btn-sm" onClick={()=>start(e.kind,r)}>继续编辑</button>}
        {canWrite&&e?.status==='published'&&<button disabled={busy} className="btn btn-secondary btn-sm" onClick={()=>action(()=>rehabAPI.send(patientId,'records',{...e,recordId:r._id,requestId:uid(),publish:true}),'报告已确认推送至客户消息')}>确认报告推送</button>}
        {canWrite&&e?.status==='published'&&e.kind!=='guidance'&&o&&<button disabled={busy||redeemed} className="btn btn-secondary btn-sm" onClick={()=>{if(window.confirm('确认本次服务已实际完成？将核销1次，重复操作不会再次扣次。'))action(()=>rehabAPI.send(patientId,'redeem',{orderId:o._id,recordId:r._id}),'本次服务已核销')}}>{redeemed?'本次已核销':'确认服务完成并核销1次'}</button>}
      </div></details>})}
    </>}
    {(form||plan||booking)&&<div className="modal-overlay"><div className="modal" style={{maxWidth:820,width:'94vw',maxHeight:'90vh',overflowY:'auto'}}><div className="modal-header"><h3>{form?kinds[form.kind]:plan?'制定运动服务方案':'安排运动服务预约'}</h3><button className="modal-close" disabled={busy} onClick={()=>{setForm(null);setPlan(null);setBooking(null);setError('')}}>×</button></div><div className="modal-body">
      {error&&<p role="alert" style={{color:'#B42318'}}>{error}</p>}
      {form&&<>
        {labelInput('服务订单',orderSelect(form.orderId,v=>setForm({...form,orderId:v})))}
        {labelInput('日期',<input className="form-input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/>)}
        {labelInput('服务方式',<select className="form-input" value={form.mode} onChange={e=>setForm({...form,mode:e.target.value})}><option value="offline">线下</option><option value="online">线上</option></select>)}
        {labelInput('关联筛查答卷',<select className="form-input" value={form.screeningResponseId||''} onChange={e=>setForm({...form,screeningResponseId:e.target.value})}><option value="">未选择</option>{data.responses.map(r=><option key={r._id} value={r._id}>{new Date(r.submittedAt).toLocaleString('zh-CN')}</option>)}</select>)}
        {labelInput('关联运动方案',<select className="form-input" value={form.planId||''} onChange={e=>setForm({...form,planId:e.target.value})}><option value="">未选择</option>{data.plans.map(p=><option key={p._id} value={p._id}>{p.title} · {new Date(p.createdAt).toLocaleDateString('zh-CN')}</option>)}</select>)}
        {(['initial','reassessment'].includes(form.kind)?['goal','history','tests','findings','recommendations','precautions','nextReview']:['goal','training','response','nextSteps']).map(k=><React.Fragment key={k}>{labelInput(fields[k],<textarea className="form-input" rows={3} maxLength={6000} value={form.fields[k]||''} onChange={e=>setForm({...form,fields:{...form.fields,[k]:e.target.value}})} placeholder={k==='tests'?'逐项记录测试方法、结果、单位；未测项目注明原因':`填写${fields[k]}`}/>)}</React.Fragment>)}
        <p>发布后客户将在消息中收到报告；已发布内容保留，可另建复评记录。日常答疑不扣套餐次数。</p>
        <div style={row}><button disabled={busy} className="btn btn-secondary" onClick={async()=>{if(await action(()=>rehabAPI.send(patientId,'records',form),'草稿已保存'))setForm(null)}}>保存草稿</button><button disabled={busy} className="btn btn-primary" onClick={async()=>{if(await action(()=>rehabAPI.send(patientId,'records',{...form,publish:true}),'记录已发布并推送客户'))setForm(null)}}>确认并发布报告</button></div>
      </>}
      {plan&&<>
        {labelInput('关联订单',orderSelect(plan.orderId,v=>setPlan({...plan,orderId:v})))}
        {labelInput('选择方案模板',<select className="form-input" defaultValue="" onChange={e=>{const t=data.templates.find(t=>t._id===e.target.value);if(t)setPlan({...plan,...Object.fromEntries(['goal','exercises','weeklyFreq','duration','precautions','progression'].map(k=>[k,t.content?.[k]||'']))})}}><option value="">请选择</option>{data.templates.filter(t=>t.content?.purpose!=='assessment_report').map(t=><option key={t._id} value={t._id}>{t.name}</option>)}</select>)}
        {Object.entries({goal:'目标',exercises:'训练安排',weeklyFreq:'频次',duration:'每次时长',precautions:'注意事项与调整条件',progression:'进阶与复评'}).map(([k,l])=><React.Fragment key={k}>{labelInput(l,<textarea className="form-input" rows={3} value={plan[k]} onChange={e=>setPlan({...plan,[k]:e.target.value})}/>)}</React.Fragment>)}
        <button disabled={busy} className="btn btn-primary" onClick={async()=>{if(await action(()=>rehabAPI.send(patientId,'plans',plan),'方案已由运动复健师直接发布'))setPlan(null)}}>确认并发布方案</button>
      </>}
      {booking&&<>
        {labelInput('预约时间',<input className="form-input" type="datetime-local" value={booking.at} onChange={e=>setBooking({...booking,at:e.target.value})}/>)}
        {labelInput('服务方式',<select className="form-input" value={booking.mode} onChange={e=>setBooking({...booking,mode:e.target.value})}><option value="offline">线下</option><option value="online">线上</option></select>)}
        <p>安排给客户所属运动复健师；如需调整负责人，请先在客户归属中选择。</p>
        <button disabled={busy} className="btn btn-primary" onClick={async()=>{if(await action(()=>rehabAPI.send(patientId,'booking',{...booking,at:new Date(booking.at).toISOString()}),'预约已安排'))setBooking(null)}}>保存预约</button>
      </>}
    </div></div></div>}
  </div>
}
