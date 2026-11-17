import React, { useEffect, useMemo, useRef, useState } from 'react'
import { staffAPI } from '../api'

const LABELS = { medical_treatment: '就医安排', checkup_completion: '完善检查', abnormal_followup: '定期复查', vaccine: '疫苗接种', nutrition_assessment: '营养评估' }
const titleOf = row => row?.items || row?.name || row?.department || (row?.institution !== undefined ? '年度体检' : '未命名事项')
const originalReason = row => String(row?.basisSummary || row?.reason || '').split('\n处理建议：')[0]
const originalAdvice = row => row?.personalizedAdvice || row?.personalization || String(row?.reason || '').split('\n处理建议：')[1] || ''
const draftOf = row => row ? { title: titleOf(row), reason: originalReason(row), advice: originalAdvice(row), date: row.visit_time || row.time || row.date || '', timingReason: row.timingReason || '', hospital: row.hospital || '', department: row.department || '', institution: row.institution || '', focus: row.focus || '' } : { title: '', reason: '', advice: '', date: '', timingReason: '', hospital: '', department: '', institution: '', focus: '' }

export default function AnnualPlanRevision({ patientId, plan, pilot = false, inlineItem, onSaved, toast }) {
  const editorRef = useRef(null)
  const options = useMemo(() => [
    ...Object.entries(LABELS).flatMap(([key, label]) =>
      (plan?.moduleData?.[key]?.records || []).map((row, target) => ({ key, target, label, row }))),
    ...(pilot && plan?.moduleData?.annual_checkup?.enabled !== false && plan?.moduleData?.annual_checkup
      ? [{ key: 'annual_checkup', target: 0, label: '年度体检', row: plan.moduleData.annual_checkup }] : []),
  ], [plan, pilot])
  const inlineSelection = inlineItem ? `${inlineItem.key}:${inlineItem.target}` : ''
  const [selection, setSelection] = useState(inlineSelection)
  const [draft, setDraft] = useState(() => draftOf(options.find(option => `${option.key}:${option.target}` === inlineSelection)?.row))
  const [revisionReason, setRevisionReason] = useState('')
  const [saving, setSaving] = useState(false)
  const selected = options.find(option => `${option.key}:${option.target}` === selection)
  const choose = value => {
    setSelection(value)
    const next = options.find(option => `${option.key}:${option.target}` === value)
    setDraft(draftOf(next?.row))
  }
  useEffect(() => {
    if (inlineItem) return
    const openItem = event => {
      const value = `${event.detail?.key}:${event.detail?.target}`
      if (!options.some(option => `${option.key}:${option.target}` === value)) return
      choose(value)
      const editor = editorRef.current
      if (editor) editor.open = true
    }
    window.addEventListener('annual-plan-edit-item', openItem)
    return () => window.removeEventListener('annual-plan-edit-item', openItem)
  }, [options, inlineItem])
  useEffect(() => {
    if (inlineItem) return
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        const editor = editorRef.current
        if (editor?.open) editor.open = false
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [inlineItem])
  const save = async () => {
    if (!selected || (selected.key !== 'annual_checkup' && (!draft.title.trim() || !draft.reason.trim() || !draft.advice.trim())) || revisionReason.trim().length < 2) {
      toast('请选择事项并填写内容、依据、处理建议和修订原因'); return
    }
    const originalDate = selected.row.visit_time || selected.row.time || selected.row.date || ''
    if (selected.key !== 'annual_checkup' && draft.date !== originalDate && draft.date && !draft.timingReason.trim()) { toast('修改日期时请填写时间依据'); return }
    if (!window.confirm('确认保存这一项修订并通知客户？已有执行任务的排期需要另行核对。')) return
    setSaving(true)
    try {
      const res = await staffAPI.reviseAnnualPlan(patientId, {
        planId: plan._id, baseUpdatedAt: plan.updatedAt, reason: revisionReason.trim(),
        item: selected.key === 'annual_checkup' ? { key: 'annual_checkup', date: draft.date, institution: draft.institution.trim(), focus: draft.focus.trim() } : { key: selected.key, target: selected.target, title: draft.title.trim(), reason: draft.reason.trim(), advice: draft.advice.trim(),
          ...(draft.date !== originalDate ? draft.date ? { date: draft.date, timingReason: draft.timingReason.trim() } : { datePending: true, timingReason: draft.timingReason.trim() } : {}) ,
          ...(pilot && ['medical_treatment', 'checkup_completion', 'abnormal_followup'].includes(selected.key) ? { location: { hospital: draft.hospital, department: selected.key === 'medical_treatment' ? draft.title : draft.department } } : {}) },
      })
      onSaved(res.data)
      if (!inlineItem) setSelection('')
      setRevisionReason('')
      const editor = editorRef.current
      if (editor) editor.open = false
      toast(res.message || '局部修订已推送给客户')
    } catch (error) { toast(error.message || '修订失败，请刷新后重试') }
    finally { setSaving(false) }
  }
  useEffect(() => {
    if (inlineItem) return
    const saveFromPage = () => {
      const editor = editorRef.current
      if (editor) editor.open = true
      if (!selected) { toast('请先选择要修改的方案事项'); return }
      save()
    }
    window.addEventListener('annual-plan-save-revision', saveFromPage)
    return () => window.removeEventListener('annual-plan-save-revision', saveFromPage)
  })
  if (!options.length || (inlineItem && !options.some(option => option.key === inlineItem.key && option.target === inlineItem.target))) return null
  const fields = <>
    {!inlineItem && <p style={{ fontSize: 13, color: '#52675D' }}>修改后保存。已派发任务的实际排期另行核对。</p>}
    {!inlineItem && <label>方案事项<select className="form-input" value={selection} onChange={event => choose(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 5 }}><option value="">请选择</option>{options.map(option => <option key={`${option.key}:${option.target}`} value={`${option.key}:${option.target}`}>{option.label} · {titleOf(option.row)}</option>)}</select></label>}
    {selected && <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      {selected.key === 'annual_checkup' ? <>
        <label>计划体检日期<input className="form-input" type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
        <label>体检机构<input className="form-input" value={draft.institution} onChange={event => setDraft({ ...draft, institution: event.target.value })} /></label>
        <label>重点关注<textarea className="form-input" rows={3} value={draft.focus} onChange={event => setDraft({ ...draft, focus: event.target.value })} /></label>
      </> : <>
      <label>{selected.key === 'medical_treatment' ? '就诊科室' : '事项名称'}<input className="form-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>设置依据<textarea className="form-input" rows={2} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
      <label>处理建议<textarea className="form-input" rows={3} value={draft.advice} onChange={event => setDraft({ ...draft, advice: event.target.value })} /></label>
      {pilot && ['medical_treatment', 'checkup_completion', 'abnormal_followup'].includes(selected.key) && <><label>就医医院<input className="form-input" value={draft.hospital} onChange={event => setDraft({ ...draft, hospital: event.target.value })} /></label>{selected.key !== 'medical_treatment' && <label>就诊科室<input className="form-input" value={draft.department} onChange={event => setDraft({ ...draft, department: event.target.value })} /></label>}</>}
      <label>建议日期<input className="form-input" type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      {draft.date !== (selected.row.visit_time || selected.row.time || selected.row.date || '') && <label>时间调整依据<input className="form-input" value={draft.timingReason} onChange={event => setDraft({ ...draft, timingReason: event.target.value })} /></label>}
      </>}
      <label>修订原因<textarea className="form-input" rows={2} value={revisionReason} onChange={event => setRevisionReason(event.target.value)} placeholder="记录客户意见及顾问核对结果" /></label>
      <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存本项'}</button>
    </div>}
  </>
  if (inlineItem) return <div className="annual-plan-revision annual-plan-revision--inline">{fields}</div>
  return <details ref={editorRef} id="annual-plan-revision" className="annual-plan-revision" style={{ marginBottom: 16, padding: 14, border: '1px solid #C7D8CB', borderRadius: 10, background: '#fff' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>修改方案事项</summary>
    {fields}
  </details>
}
