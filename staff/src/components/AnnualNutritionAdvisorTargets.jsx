import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import nutritionAdvisor from '../../../shared/annualNutritionAdvisorTargets.cjs'

const blank = () => ({ metric: '', baseline: '', target: '' })

export default function AnnualNutritionAdvisorTargets({ patientId, plan, rows = [], metrics = [], managementTargets = [], autoImport = true, executionDate = '', executorId = '', assignedNutritionistId = '', staffList = [], canEdit, onDraftChange, onSaved, toast }) {
  const [editing, setEditing] = useState(false)
  const suggested = autoImport ? nutritionAdvisor.mergeAdvisorTargets(rows, managementTargets) : rows
  const [draft, setDraft] = useState(suggested)
  const [date, setDate] = useState(executionDate)
  const [executor, setExecutor] = useState(executorId || assignedNutritionistId)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!editing) { setDraft(autoImport ? nutritionAdvisor.mergeAdvisorTargets(rows, managementTargets) : rows); setDate(executionDate); setExecutor(executorId || assignedNutritionistId) } }, [rows, managementTargets, autoImport, executionDate, executorId, assignedNutritionistId, editing])
  if (!canEdit) return null
  const update = (index, key, value) => setDraft(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
  const save = async () => {
    if (draft.some(row => !row.metric.trim() || !row.target.trim())) { toast('请逐项核对异常指标和期望目标'); return }
    if (!date || !executor) { toast('请选择计划日期和执行营养师'); return }
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
    {!editing ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDraft(suggested); setDate(executionDate); setExecutor(executorId || assignedNutritionistId); setEditing(true) }}>核对营养指标与安排</button> : <div className="annual-nutrition-advisor-editor">
      <strong>异常指标与顾问期望目标</strong>
      <div className="annual-nutrition-advisor-row"><label>计划日期<input className="form-input" type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label>执行营养师<select className="form-input" value={executor} onChange={event => setExecutor(event.target.value)}><option value="">请选择</option>{staffList.filter(staff => staff.role === 'nutritionist' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}</select></label></div>
      {draft.map((row, index) => <div className="annual-nutrition-advisor-row" key={index}>
        <label>异常指标<input className="form-input" value={row.metric} onChange={event => update(index, 'metric', event.target.value)} placeholder="如：血压" maxLength={100} /></label>
        <label>当前数据<input className="form-input" value={row.baseline} onChange={event => update(index, 'baseline', event.target.value)} placeholder="填写已核对的异常值" maxLength={200} /></label>
        <label>期望目标<input className="form-input" value={row.target} onChange={event => update(index, 'target', event.target.value)} placeholder="填写顾问期望目标" maxLength={200} /></label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(current => current.filter((_, i) => i !== index))}>删除</button>
      </div>)}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {draft.length < 10 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(current => [...current, blank()])}>＋ 添加指标</button>}
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
      </div>
    </div>}
  </div>
}
