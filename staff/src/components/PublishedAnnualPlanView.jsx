import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function PublishedAnnualPlanView({ patientId, planId, version }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setView(null)
    setError('')
    if (open && planId) staffAPI.getPublishedAnnualView(patientId, planId)
      .then(result => { if (active) setView(result.data) })
      .catch(cause => { if (active) setError(cause.message || '读取失败，请重新展开') })
    return () => { active = false }
  }, [open, patientId, planId, version])
  return <details className="annual-plan-secondary" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>查看年度管理方案与随访计划</summary>
    {!planId ? <p>方案尚未推送。</p> : error ? <p role="alert">{error}</p> : !view ? <p>正在读取已推送方案…</p> : <>
      {view.items.map(item => <section key={item.id}><strong>{item.title}</strong>
        <p>{[item.category, item.schedule, item.frequency, item.careTarget?.hospital, item.careTarget?.department, item.careTarget?.expert, item.service?.modeLabel, item.service?.typeLabel].filter(Boolean).join(' · ')}</p>
        {[item.goal, item.interventionFocus, item.interventionPlan, item.reviewItems?.join('、'), item.customerAction, item.precautions, item.completionStandard].filter(Boolean).map((text, i) => <p key={i}>{text}</p>)}
      </section>)}
      {view.recommendations.map(row => <p key={row._id}>{[row.finding, row.recommendation, row.timeframe, row.nextStep].filter(Boolean).join(' · ')}</p>)}
      <h3>随访计划</h3>{view.tasks.length ? view.tasks.map(row => <p key={row._id}>{new Date(row.date).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })} · {row.theme || '随访'} · {({ planned:'待执行', in_progress:'执行中', completed:'已完成', missed:'待跟进' })[row.status] || row.status}</p>) : <p>暂无已生成的客户随访。</p>}
    </>}
  </details>
}
