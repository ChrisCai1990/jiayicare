import React from 'react'
export default function CareFlowReviewEvidence({reports=[]}){
  return <section style={{background:'#F6FBF8',padding:16,borderRadius:12}}><h4>核对依据：已审核病历、医嘱与报告</h4><p>核对下方随访内容及日期是否承接专科医嘱；AI草稿不是已确认医嘱。缺失或冲突时先退回核查，不直接发布。</p>
    {reports.map(r=><details key={r.id}><summary>{r.title} · {r.checkDate||'日期待核对'}</summary>{r.reportItems?.length?r.reportItems.map((item,i)=><div key={item.itemId||i} style={{whiteSpace:'pre-wrap',padding:8}}><b>{item.name}</b>{[item.value,item.findings,item.diagnosis,item.conclusion].filter(Boolean).map((value,j)=><div key={j}>{value}</div>)}</div>):<p>未录入可对照的结构化内容，请打开上方原件核对；不能仅依据AI摘要确认。</p>}</details>)}
  </section>
}
