import React, { useMemo, useState } from 'react'
import { staffAPI } from '../api'

const LABELS = { medical_treatment: '就医安排', checkup_completion: '完善检查', abnormal_followup: '定期复查', vaccine: '疫苗接种', nutrition_assessment: '营养评估' }
const titleOf = row => row?.items || row?.name || row?.department || '未命名事项'
const originalReason = row => String(row?.basisSummary || row?.reason || '').split('\n处理建议：')[0]
const originalAdvice = row => row?.personalizedAdvice || row?.personalization || String(row?.reason || '').split('\n处理建议：')[1] || ''

export default function AnnualPlanRevision({ patientId, plan, onSaved, toast }) {
  const options = useMemo(() => Object.entries(LABELS).flatMap(([key, label]) =>
    (plan?.moduleData?.[key]?.records || []).map((row, target) => ({ key, target, label, row }))), [plan])
  const [selection, setSelection] = useState('')
  const [draft, setDraft] = useState({ title: '', reason: '', advice: '' })
  const [revisionReason, setRevisionReason] = useState('')
  const [saving, setSaving] = useState(false)
  const selected = options.find(option => `${option.key}:${option.target}` === selection)
  const choose = value => {
    setSelection(value)
    const next = options.find(option => `${option.key}:${option.target}` === value)
    setDraft(next ? { title: titleOf(next.row), reason: originalReason(next.row), advice: originalAdvice(next.row) } : { title: '', reason: '', advice: '' })
  }
  const save = async () => {
    if (!selected || !draft.title.trim() || !draft.reason.trim() || !draft.advice.trim() || revisionReason.trim().length < 2) {
      toast('请选择事项并填写内容、依据、处理建议和修订原因'); return
    }
    if (!window.confirm('确认只修订这一项并通知客户？已有执行任务不会自动改期或完成。')) return
    setSaving(true)
    try {
      const res = await staffAPI.reviseAnnualPlan(patientId, {
        planId: plan._id, baseUpdatedAt: plan.updatedAt, reason: revisionReason.trim(),
        item: { key: selected.key, target: selected.target, title: draft.title.trim(), reason: draft.reason.trim(), advice: draft.advice.trim() },
      })
      onSaved(res.data)
      setSelection(''); setRevisionReason('')
      toast(res.message || '局部修订已推送给客户')
    } catch (error) { toast(error.message || '修订失败，请刷新后重试') }
    finally { setSaving(false) }
  }
  if (!options.length) return null
  return <details style={{ marginBottom: 16, padding: 14, border: '1px solid #C7D8CB', borderRadius: 10, background: '#fff' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>局部修订并通知客户</summary>
    <p style={{ fontSize: 13, color: '#52675D' }}>选择原方案中的一项修改正文。执行日期及已有任务需要另行核对。</p>
    <label>方案事项<select className="form-input" value={selection} onChange={event => choose(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 5 }}><option value="">请选择</option>{options.map(option => <option key={`${option.key}:${option.target}`} value={`${option.key}:${option.target}`}>{option.label} · {titleOf(option.row)}</option>)}</select></label>
    {selected && <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      <label>事项名称<input className="form-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>设置依据<textarea className="form-input" rows={2} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
      <label>处理建议<textarea className="form-input" rows={3} value={draft.advice} onChange={event => setDraft({ ...draft, advice: event.target.value })} /></label>
      <label>修订原因<textarea className="form-input" rows={2} value={revisionReason} onChange={event => setRevisionReason(event.target.value)} placeholder="记录客户意见及顾问核对结果" /></label>
      <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? '推送中…' : '保存本项修订并通知客户'}</button>
    </div>}
  </details>
}
