import React, { useEffect, useState } from 'react'
import { staffAPI, managementReviewAPI } from '../api'

const MEDICAL = /^(annual_checkup|checkup_completion|abnormal_followup|medical_treatment|functional_medicine):/
export const canDeferMedicalFollowUp = task => !!task && !task.taskRole && !task.isBlocked
  && ['planned', 'in_progress', 'missed'].includes(task.status)
  && ((task.sourceType === 'scheduled' && MEDICAL.test(task.sourceScheduleKey || ''))
    || (task.sourceType === 'report_followup' && ['medical_visit', 'examination', 'review'].includes(task.formData?.category)))

export default function DeferMedicalFollowUp({ task, onSaved }) {
  const [reason, setReason] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pilot, setPilot] = useState(false)
  const patientId = String(task?.patientId?._id || task?.patientId || '')
  useEffect(() => {
    let active = true
    setPilot(false)
    if (patientId) managementReviewAPI.get(patientId).then(result => { if (active) setPilot(result.restored === true || result.annualFlowEnabled === true && task?.formData?.annualFlowVersion === 2) }).catch(() => {})
    return () => { active = false }
  }, [patientId, task?.formData?.annualFlowVersion])
  if (!pilot || !canDeferMedicalFollowUp(task)) return null
  const save = async () => {
    if (reason.trim().length < 5 || !nextDate) { setError('请填写本轮未做的实际情况与下次跟进日期'); return }
    setSaving(true); setError('')
    try { await staffAPI.deferMedicalFollowUp(task._id, { reason: reason.trim(), nextDate }); onSaved?.() }
    catch (err) { setError(err.message || '保存失败，可重试本轮任务') }
    finally { setSaving(false) }
  }
  return <details style={{ border: '1px solid #C7DED0', borderRadius: 8, padding: 12, background: '#F7FAF8' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>本轮已跟进，客户尚未检查或就医 · 转下一轮</summary>
    <p style={{ fontSize: 12 }}>此操作办结工作人员本轮任务，不表示客户已完成医疗行为。原记录留存，新计划按下次跟进日期计算待办和逾期。</p>
    <label style={{ display: 'block', fontSize: 13 }}>本轮实际情况与未做原因<textarea className="form-control" value={reason} maxLength={1000} rows={3} onChange={event => setReason(event.target.value)} /></label>
    <label style={{ display: 'block', fontSize: 13, marginTop: 8 }}>下次跟进日期<input className="form-control" type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} /></label>
    {error && <div role="alert" style={{ color: '#B42318', fontSize: 12, marginTop: 8 }}>{error}</div>}
    <button className="btn btn-secondary btn-sm" type="button" disabled={saving} onClick={save} style={{ marginTop: 10 }}>{saving ? '保存中…' : '办结本轮并创建下一轮'}</button>
  </details>
}
