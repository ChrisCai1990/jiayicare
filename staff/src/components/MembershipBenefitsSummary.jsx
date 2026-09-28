import React from 'react'
export default function MembershipBenefitsSummary({ data, error, onRefresh }) {
  return <div className="card" style={{marginBottom:16}}><div className="card-header"><div className="card-title">会员计划与使用情况</div><button className="btn btn-secondary btn-sm" onClick={onRefresh}>刷新权益</button></div><div className="card-body">
    {error||(!data?'正在加载…':data.message)}
    {(data?.plans||[]).map(plan=><section key={plan.id} style={{marginBottom:16}}><h3>{plan.name}</h3><p>有效期：{String(plan.validFrom||'待核对').slice(0,10)} 至 {String(plan.validUntil||'待核对').slice(0,10)}</p><p style={{color:'#876B38'}}>{plan.notice}</p>
      {plan.items.map((item,i)=><div key={i} style={{padding:'6px 0'}}><strong>{item.label}</strong>：{item.value}</div>)}
      {plan.usage.map((item,i)=><div key={i}>客户使用记录：{item.name} · {String(item.usedAt).slice(0,10)}</div>)}
    </section>)}
  </div></div>
}
