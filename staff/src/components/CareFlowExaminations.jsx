import React from 'react'
export function initialExaminations(state) {
  const rows=(state.data.booking?.entries||[]).filter(e=>e.type==='exam'||e.mode==='onsite')
  const saved=state.data.execute?.onsite||[]
  return [...rows.map(e=>({...e,status:e.status==='booked'?'booked':'pending',...saved.find(v=>v.id===e.id)})),...saved.filter(e=>!rows.some(v=>v.id===e.id))]
}
export default function CareFlowExaminations({rows,onChange}) {
  const change=(i,k,v)=>onChange(rows.map((r,j)=>i===j?{...r,[k]:v}:r))
  const field=(e,i,k,label,type='text')=><label style={{display:'grid',gap:6,minWidth:0}}>{label}<input className="form-input" style={{width:'100%',minHeight:46,padding:12,boxSizing:'border-box'}} type={type} value={e[k]||''} onChange={v=>change(i,k,v.target.value)}/></label>
  return <section style={{display:'grid',gap:16}}><h4>专家确认后的检查与预约</h4><p>按专家实际意见记录更换、增补或取消；原计划保留。变更须填写专家意见，未预约事项须说明后续安排。</p>{rows.map((e,i)=><section key={e.id} style={{padding:18,border:'1px solid #C9DED4',borderRadius:12,display:'grid',gap:12}}>
    {e.id?.startsWith('added-')&&!e.confirmedAt&&<button type="button" className="btn" style={{justifySelf:'end',color:'#B91C1C'}} onClick={()=>onChange(rows.filter((_,j)=>j!==i))}>删除新增项目</button>}
    {field(e,i,'title','实际检查项目')}
    <label>办理状态<select className="form-input" style={{width:'100%',minHeight:46}} value={e.status} onChange={v=>change(i,'status',v.target.value)}><option value="booked">已预约</option><option value="pending">待预约／待安排</option><option value="cancelled">专家取消／无需检查</option></select></label>
    {e.status!=='cancelled'&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>{field(e,i,'hospital','实际医院')}{field(e,i,'department','检查科室')}{field(e,i,'expert','检查专家（选填）')}</div>{e.status==='booked'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>{field(e,i,'date','实际预约日期','date')}{field(e,i,'time','具体时间','time')}</div>}</>}
    <label>专家意见／变更原因（变更必填）<textarea className="form-input" style={{width:'100%',minHeight:90}} value={e.reason||''} onChange={v=>change(i,'reason',v.target.value)}/></label>
    <label>办理结果及后续安排（待预约必填）<textarea className="form-input" style={{width:'100%',minHeight:90}} value={e.note||''} onChange={v=>change(i,'note',v.target.value)}/></label>
  </section>)}<button type="button" className="btn" onClick={()=>onChange([...rows,{id:`added-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title:'',status:'pending'}])}>＋ 增加专家建议的检查</button></section>
}
