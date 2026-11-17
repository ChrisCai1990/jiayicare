import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const blank = () => ({ metric: '', baseline: '', target: '' })

export default function AnnualNutritionAdvisorTargets({ patientId, plan, rows = [], metrics = [], canEdit, onDraftChange, onSaved, toast }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(rows)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!editing) setDraft(rows) }, [rows, editing])
  if (!canEdit) return null
  const update = (index, key, value) => setDraft(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
  const save = async () => {
    if (draft.some(row => !row.metric.trim() || !row.baseline.trim() || !row.target.trim())) { toast('请逐项填写异常指标、当前数据和顾问期望目标'); return }
    if (!plan?.pushedAt) { onDraftChange(draft); setEditing(false); return }
    setSaving(true)
    try {
      const response = await staffAPI.reviseAnnualNutritionMetrics(patientId, {
        planId: plan._id, baseUpdatedAt: plan.updatedAt, metrics, advisorTargets: draft,
      })
      onSaved(response.data)
      setEditing(false)
      toast('异常指标与顾问目标已保存')
    } catch (error) { toast(error.message || '保存失败，请刷新后重试') }
    finally { setSaving(false) }
  }
  return <div style={{ marginTop: 8 }}>
    {!editing ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDraft(rows); setEditing(true) }}>设置异常指标与目标</button> : <div className="annual-nutrition-advisor-editor">
      <strong>异常指标与顾问期望目标</strong>
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
