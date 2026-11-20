import React, { useEffect, useState } from 'react'
import AnnualPlanSection, { annualSectionFor } from './AnnualPlanSection'
import { staffAPI } from '../api'

export default function AnnualPlanPreview({ patientId, planId, version }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setView(null)
    setError('')
    if (open && planId) staffAPI.getAnnualPlanPreview(patientId, planId)
      .then(result => { if (active) setView(result.data) })
      .catch(cause => { if (active) setError(cause.message || '读取失败，请重新展开') })
    return () => { active = false }
  }, [open, patientId, planId, version])
  return <details id="annual-plan-preview" className="annual-plan-secondary" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>查看年度管理方案</summary>
    {!planId ? <p>保存方案草稿后可在此查看。</p> : error ? <p role="alert">{error}</p> : !view ? <p>正在读取方案…</p> : <>
      <p>{view.pushedAt ? '已推送方案' : '已保存草稿'}</p>
      <div className="annual-track-stack">{['medical', 'management', 'checkup'].map(section => {
        const items = view.items.filter(item => item.moduleKey !== 'management_targets' && annualSectionFor(item.moduleKey) === section)
        const recommendations = section === 'medical' ? view.recommendations : []
        return <AnnualPlanSection key={section} section={section}>
          {items.map(item => <section key={item.id} style={{ padding: '12px 0', borderTop: '1px solid #E1EAE4' }}><strong>{item.title}</strong>
        <p>{[item.category, item.schedule, item.frequency, item.careTarget?.hospital, !item.examArrangement && item.careTarget?.department, !item.examArrangement && item.careTarget?.expert, item.service?.modeLabel, item.service?.typeLabel].filter(Boolean).join(' · ')}</p>
        {item.examArrangement && <>{[['开单科室', item.examArrangement.orderDepartment], ['开单专家', item.examArrangement.orderExperts.join('、')], ['检查科室', item.examArrangement.examDepartment], ['检查专家', item.examArrangement.examExperts.join('、')]].filter(([, value]) => value).map(([label, value]) => <p key={label}>{label}：{value}</p>)}</>}
        {[item.goal, item.interventionFocus, item.interventionPlan, item.reviewItems?.join('、'), item.customerAction, item.precautions, item.completionStandard].filter(text => text && text !== item.title).map((text, i) => <p key={i}>{text}</p>)}
      </section>)}
          {recommendations.map(row => <p key={row._id}>{[row.finding, row.recommendation, row.timeframe, row.nextStep].filter(Boolean).join(' · ')}</p>)}
          {!items.length && !recommendations.length && <p>暂无已纳入的安排。</p>}
        </AnnualPlanSection>
      })}</div>
    </>}
  </details>
}
