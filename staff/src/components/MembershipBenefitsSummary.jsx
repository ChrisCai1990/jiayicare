import React from 'react'
const muted={fontSize:12,color:'#718579',lineHeight:1.7}
function Quota({item,shared}) {
  return <div style={{background:'#F4F7F3',borderRadius:12,padding:16}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{item.name}</strong><strong style={{fontSize:20,color:'#1E6B50'}}>{item.total==null?'待核对':item.total+' 次'}</strong></div>
    {shared && <p style={muted}>可用于：{item.services.join('、')||'适用服务待核对'}<br/>上述服务合计共用，不按项目重复累计</p>}
    <div style={muted}>{item.detail || '使用情况待核对 · 暂不显示剩余次数'}</div>
  </div>
}
export default function MembershipBenefitsSummary({ data, error, onRefresh, onViewRedemption }) {
  return <div className="card" style={{marginBottom:16}}><div className="card-header"><div className="card-title">会员计划与使用情况</div><div style={{display:'flex',gap:8}}>{onViewRedemption && <button className="btn btn-primary btn-sm" onClick={onViewRedemption}>查看服务核销</button>}<button className="btn btn-secondary btn-sm" onClick={onRefresh}>刷新权益</button></div></div><div className="card-body">
    {error||(!data?'正在加载…':data.message)}
    {!!data?.redemptionAlerts && <p role="alert" style={{color:'#B45309'}}>有 {data.redemptionAlerts} 项服务已完成，但套餐次数自动核销待核对。请核对服务包来源与剩余次数。</p>}
    {(data?.plans||[]).map(plan=><section key={plan.id} style={{marginBottom:20}}>
      <div style={{background:'#193C30',borderRadius:14,padding:20,color:'#fff'}}><h3 style={{margin:'0 0 8px'}}>{plan.name}</h3><div style={{fontSize:12,color:'#C5D9CE'}}>有效期：{String(plan.validFrom||'待核对').slice(0,10)} — {String(plan.validUntil||'待核对').slice(0,10)}</div></div>
      {plan.groups ? <>
      {!!plan.groups.features.length && <><h4>健康管理服务</h4><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>{(plan.groups.serviceStages||[{name:'计划服务',services:plan.groups.features.map(name=>({name,frequency:'已包含 · 频次待确认'}))}]).map(stage=><div key={stage.name} style={{background:'#F4F7F3',borderRadius:12,padding:16}}><strong>{stage.name}</strong>{stage.services.map(item=><div key={item.name} style={{display:'flex',justifyContent:'space-between',gap:12,marginTop:12,fontSize:13}}><span>{item.name}</span><span style={muted}>{item.frequency}</span></div>)}</div>)}</div></>}
        {[['shared','服务共用次数'],['independent','独立次数权益']].map(([key,title])=>!!plan.groups[key].length && <div key={key}><h4>{title}</h4><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>{plan.groups[key].map((item,i)=><Quota key={i} item={item} shared={key==='shared'}/>)}</div></div>)}
      </> : (plan.items||[]).map((item,i)=><p key={i}>{item.label}：{item.value}</p>)}
      <p style={muted}>{plan.notice}</p>
      <details><summary style={{cursor:'pointer',color:'#1E6B50',padding:'10px 0'}}>客户使用记录</summary>
        {(plan.usage||[]).map((item,i)=><div key={i} style={{padding:'8px 0',borderBottom:'1px solid #E7ECE7'}}>{item.name}<span style={{...muted,marginLeft:16}}>{String(item.usedAt||'待核对').slice(0,10)}</span></div>)}
        {!plan.usage?.length && <p style={muted}>{plan.source==='configuration'?'历史记录待核对，不能据此认定未使用。':'暂无该客户使用记录；共用额度可能包含其他成员使用。'}</p>}
      </details>
    </section>)}
  </div></div>
}
