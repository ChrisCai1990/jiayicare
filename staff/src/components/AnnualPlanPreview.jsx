import React, { useEffect, useState } from 'react'
import AnnualPlanSection, { annualSectionFor, medicalGroups } from './AnnualPlanSection'
import { staffAPI } from '../api'

export default function AnnualPlanPreview({ patientId, planId, version, staffList = [], assignedNutritionist }) {
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
    const renderItem = item => <section key={item.id} style={{ padding: '12px 0', borderTop: '1px solid #E1EAE4' }}><strong>{item.title}</strong>
        <p>{[item.category, item.schedule, item.frequency, item.careTarget?.hospital, !item.examArrangement && item.careTarget?.department, !item.examArrangement && item.careTarget?.expert, item.service?.modeLabel, item.service?.typeLabel].filter(Boolean).join(' · ')}</p>
        {item.moduleKey === 'annual_checkup' && item.focus && <p style={{ whiteSpace: 'pre-line' }}>下一年度重点关注项目：{item.focus}</p>}
        {item.examArrangement && <>{[['开单科室', item.examArrangement.orderDepartment], ['开单专家', item.examArrangement.orderExperts.join('、')], ['检查科室', item.examArrangement.examDepartment], ['检查专家', item.examArrangement.examExperts.join('、')]].filter(([, value]) => value).map(([label, value]) => <p key={label}>{label}：{value}</p>)}</>}
        {[item.goal, item.interventionFocus, item.interventionPlan, item.reviewItems?.join('、'), item.customerAction, item.precautions, item.completionStandard].filter(text => text && text !== item.title).map((text, i) => <p key={i}>{text}</p>)}
      </section>
  return <details id="annual-plan-preview" className="annual-plan-secondary" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>查看年度管理方案</summary>
    {!planId ? <p>保存方案草稿后可在此查看。</p> : error ? <p role="alert">{error}</p> : !view ? <p>正在读取方案…</p> : <>
      <p>{view.pushedAt ? '已推送方案' : '已保存草稿'}</p>
      <div className="annual-track-stack">{['medical', 'management', 'checkup'].map(section => {
        const items = view.items.filter(item => item.moduleKey !== 'management_targets' && item.moduleKey !== 'monitoring' && annualSectionFor(item.moduleKey) === section)
        const recommendations = section === 'medical' ? view.recommendations : []
        return <AnnualPlanSection key={section} section={section}>
          {section === 'medical' && medicalGroups.map(group => <div key={group.title} className="annual-medical-group">
            <h4 className="annual-medical-group-heading">{group.title}</h4>
            {items.filter(item => group.keys.includes(item.moduleKey)).map(renderItem)}
            {!items.some(item => group.keys.includes(item.moduleKey)) && <p>待安排</p>}
          </div>)}
          {section === 'medical' && items.filter(item => !medicalGroups.some(group => group.keys.includes(item.moduleKey))).map(renderItem)}
          {section !== 'medical' && items.map(renderItem)}
          {section === 'management' && !!view.monitoring?.records?.length && <section style={{ borderTop: '1px solid #E1EAE4', padding: '14px 0' }}>
            <h4>日常监测</h4>
            {view.monitoring.records.map((row, index) => <p key={index}>{row.items || '监测项目'}{row.measurementPeriod && ` · ${row.measurementPeriod}`} · {row.frequency || '周期待确认'}</p>)}
          </section>}
          {section === 'management' && view.nutritionAssessment && <section style={{ borderTop: '1px solid #E1EAE4', padding: '14px 0' }}>
            <h4>营养评估与干预</h4>
            <p>评估日期：{view.nutritionAssessment.executionDate || '待安排'}</p>
            <p>评估人员：{staffList.find(person => String(person._id) === String(view.nutritionAssessment.executorId || assignedNutritionist?._id || assignedNutritionist || ''))?.name || assignedNutritionist?.name || '待确认'}</p>
            {(view.nutritionAssessment.records || []).map((row, index) => <p key={index}>{[row.items, row.personalizedAdvice].filter(Boolean).join(' · ')}</p>)}
          </section>}

          {recommendations.map(row => <p key={row._id}>{[row.finding, row.recommendation, row.timeframe, row.nextStep].filter(Boolean).join(' · ')}</p>)}
          {section !== 'medical' && !items.length && !recommendations.length && !(section === 'management' && (view.nutritionAssessment || view.monitoring?.records?.length)) && <p>暂无已纳入的安排。</p>}
        </AnnualPlanSection>
      })}</div>
    </>}
  </details>
}
