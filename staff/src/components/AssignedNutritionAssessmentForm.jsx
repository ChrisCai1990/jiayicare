import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import NutritionAssessmentFields, { initialNutritionAssessment, missingNutritionAssessment } from './NutritionAssessmentFields'

export default function AssignedNutritionAssessmentForm({ patientId, task, kind, onSaved }) {
  const [patient, setPatient] = useState(null)
  const [assessment, setAssessment] = useState(null)
  const [goal, setGoal] = useState('')
  const [previousAt, setPreviousAt] = useState('')
  const [summary, setSummary] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    setPatient(null)
    setAssessment(null)
    setError('')
    Promise.all([staffAPI.getPatient(patientId), staffAPI.getNutritionAssessmentPrefill(patientId)])
      .then(([patientResult, prefillResult]) => {
        if (!active) return
        const user = patientResult.data?.user
        if (!user) throw new Error('会员资料未找到')
        setPatient(user)
        setAssessment(initialNutritionAssessment(user, prefillResult.data))
        setGoal(task.reason || prefillResult.data?.goal || '')
        setPreviousAt(prefillResult.data?.recordedAt || '')
      })
      .catch(err => { if (active) setError(err.message || '营养评估资料加载失败') })
    return () => { active = false }
  }, [patientId, task._id])

  const submit = async () => {
    const missing = missingNutritionAssessment(assessment, goal, patient, { requireTemplate: false })
    if (missing.length) { setError(`请先补齐或核实：${missing.join('、')}`); return }
    if (summary.trim().length < 10 || recommendations.trim().length < 5) {
      setError('请填写至少10字的评估结论和至少5字的后续建议'); return
    }
    setBusy(true)
    setError('')
    try {
      const payload = { nutritionAssessment: { ...assessment, goal: goal.trim() }, summary: summary.trim(), recommendations: recommendations.trim() }
      const result = kind === 'annual'
        ? await staffAPI.completeAnnualNutritionAssessment(task._id, { ...payload, baseUpdatedAt: task.updatedAt })
        : await staffAPI.completeNutritionAssessment(task._id, payload)
      onSaved(result.data)
    } catch (err) { setError(err.message || '提交评估失败') }
    finally { setBusy(false) }
  }

  if (!assessment || !patient) return <p role="status">{error || '正在读取会员档案与营养评估资料…'}</p>
  return <div style={{ display: 'grid', gap: 12, marginTop: 12, padding: 16, border: '1px solid #DCE9E1', borderRadius: 10, background: '#F7FBF8' }}>
    <strong>{kind === 'annual' ? '年度营养评估' : '单次营养评估'} · {patient.name || '会员'}</strong>
    <label className="form-label">本次营养目标 *<textarea className="form-input" rows={2} value={goal} onChange={e => setGoal(e.target.value)} /></label>
    <NutritionAssessmentFields patient={patient} value={assessment} onChange={setAssessment} previousAssessmentAt={previousAt} requireTemplate={false} />
    <label className="form-label">评估结论 *<textarea className="form-input" rows={4} value={summary} onChange={e => setSummary(e.target.value)} /></label>
    <label className="form-label">后续建议 *<textarea className="form-input" rows={3} value={recommendations} onChange={e => setRecommendations(e.target.value)} /></label>
    {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
    <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? '提交中…' : '确认完成营养评估'}</button>
  </div>
}
