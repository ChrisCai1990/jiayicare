import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import nutritionAdvisor from '../../../shared/annualNutritionAdvisorTargets.cjs'

const blank = kind => ({ kind, metric: '', baseline: '', target: '' })

export default function AnnualNutritionAdvisorTargets({ patientId, plan, rows = [], metrics = [], managementTargets = [], nutritionEvidence = {}, autoImport = true, executionDate = '', executorId = '', assignedNutritionistId = '', staffList = [], canEdit, onDraftChange, onSaved, toast }) {
  const [editing, setEditing] = useState(false)
  const suggested = autoImport ? nutritionAdvisor.mergeAdvisorTargets(rows, managementTargets, nutritionEvidence) : rows
  const [draft, setDraft] = useState(suggested)
  const [date, setDate] = useState(executionDate)
  const [executor, setExecutor] = useState(executorId || assignedNutritionistId)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (autoImport) setDraft(current => nutritionAdvisor.mergeAdvisorTargets(current, managementTargets, nutritionEvidence))
  }, [autoImport, managementTargets, nutritionEvidence])
  if (!canEdit) return null
  const update = (index, key, value) => setDraft(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
  const save = async () => {
    if (draft.some(row => !row.metric.trim() || !row.target.trim())) { toast('请逐项核对异常指标、症状和期望目标'); return }
    if (plan?.pushedAt && (!date || !executor)) { toast('请选择计划日期和执行营养师'); return }
    if (!plan?.pushedAt) { onDraftChange({ advisorTargets: draft, advisorTargetsManuallyAdjusted: true, executionDate: date, executorId: executor }); setEditing(false); return }
    setSaving(true)
    try {
      const response = await staffAPI.reviseAnnualNutritionMetrics(patientId, {
        planId: plan._id, baseUpdatedAt: plan.updatedAt, metrics, advisorTargets: draft, executionDate: date, executorId: executor,
      })
      onSaved(response.data)
      setEditing(false)
      toast('异常指标与顾问目标已保存')
    } catch (error) { toast(error.message || '保存失败，请刷新后重试') }
    finally { setSaving(false) }
  }
  return <div style={{ marginTop: 8 }}>
    {!editing ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDraft(suggested); setDate(executionDate); setExecutor(executorId || assignedNutritionistId); setEditing(true) }}>修改纳入指标与症状</button> : <div className="annual-nutrition-advisor-editor" onFocusCapture={event => {
      document.querySelectorAll('[data-annual-save-active]').forEach(node => node.removeAttribute('data-annual-save-active'))
      event.currentTarget.setAttribute('data-annual-save-active', 'true')
    }}>
      <strong>营养干预 · 异常指标与症状</strong>
      <div className="annual-nutrition-advisor-row"><label>计划日期<input className="form-input" type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label>执行营养师<select className="form-input" value={executor} onChange={event => setExecutor(event.target.value)}><option value="">请选择</option>{staffList.filter(staff => staff.role === 'nutritionist' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}</select></label></div>
      {draft.map((row, index) => <div className="annual-nutrition-advisor-row" key={index}>
        <label>类别<select className="form-input" value={row.kind || nutritionAdvisor.kindFor(row.metric)} onChange={event => update(index, 'kind', event.target.value)}><option value="metric">异常指标</option><option value="symptom">症状</option></select></label>
        <label>{(row.kind || nutritionAdvisor.kindFor(row.metric)) === 'symptom' ? '症状' : '指标'}<input className="form-input" list={(row.kind || nutritionAdvisor.kindFor(row.metric)) === 'symptom' ? 'annual-nutrition-symptoms' : 'annual-nutrition-indicators'} value={row.metric} onChange={event => update(index, 'metric', event.target.value)} placeholder="选择或填写" maxLength={100} /></label>
        <label>{(row.kind || nutritionAdvisor.kindFor(row.metric)) === 'symptom' ? '当前表现' : '当前数据'}<input className="form-input" value={row.baseline} onChange={event => update(index, 'baseline', event.target.value)} placeholder="填写已核对的情况" maxLength={200} /></label>
        <label>期望目标<input className="form-input" value={row.target} onChange={event => update(index, 'target', event.target.value)} placeholder="填写顾问期望目标" maxLength={200} /></label>
        {nutritionAdvisor.isInternalNutritionMetric(row.metric) && <span className="annual-nutrition-internal-note">仅内部监测，客户不可见</span>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(current => current.filter((_, i) => i !== index))}>不纳入本次评估</button>
      </div>)}
      <datalist id="annual-nutrition-indicators">{nutritionAdvisor.INDICATORS.map(name => <option key={name} value={name} />)}</datalist>
      <datalist id="annual-nutrition-symptoms">{nutritionAdvisor.SYMPTOMS.map(name => <option key={name} value={name} />)}</datalist>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {draft.length < nutritionAdvisor.MAX_ADVISOR_TARGETS && <><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(current => [...current, blank('metric')])}>＋ 添加指标</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(current => [...current, blank('symptom')])}>＋ 添加症状</button></>}
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
      </div>
    </div>}
  </div>
}
