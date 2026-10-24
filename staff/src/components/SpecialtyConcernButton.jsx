import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { specialtyIssueSuggestions } from '../utils/specialtyIssueSuggestion.mjs'

const DIRECTIONS = [
  ['checkup_completion', '完善检查'], ['medical_treatment', '安排就医'],
  ['abnormal_followup', '定期复查'], ['ongoing_management', '持续管理或观察'],
  ['vaccine', '疫苗接种'], ['monitoring', '日常监测'],
]
const pending = new Map()
function load(patientId, year) {
  const key = `${patientId}:${year}`
  if (!pending.has(key)) pending.set(key, staffAPI.getAnnualManagementDecisions(patientId, year).finally(() => pending.delete(key)))
  return pending.get(key)
}
function sourceKey(source) {
  const itemId = source?.kind === 'screening' ? source.itemId || source.itemName : ''
  return `${source?.kind}:${source?.reportId}${itemId ? `:${itemId}` : ''}`
}

export default function SpecialtyConcernButton({ patientId, year, source, sourceLabel, sourceText = '', suggestedIssue = '', staff, toast }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [title, setTitle] = useState(''), [direction, setDirection] = useState(''), [note, setNote] = useState('')
  const [saved, setSaved] = useState(null), [error, setError] = useState('')
  const suggestions = specialtyIssueSuggestions(sourceText)
  const key = sourceKey(source)
  useEffect(() => {
    if (!patientId || !year || !source?.reportId || !['screening', 'screening_report'].includes(source.kind)) return
    let active = true
    load(patientId, year).then(result => {
      if (active) setSaved((result.data || []).find(item => item.sourceKey === key) || null)
    }).catch(() => {})
    return () => { active = false }
  }, [patientId, year, key])
  if (!['familyDoctor', 'superadmin'].includes(staff?.role) || !source?.reportId || !['screening', 'screening_report'].includes(source.kind)) return null
  const submit = async () => {
    if (title.trim().length < 2 || !direction) { setError('请填写具体问题并选择管理方向'); return }
    setBusy(true); setError('')
    try {
      const result = await staffAPI.saveAnnualManagementDecision(patientId, { year, source, title: title.trim(), direction, note: note.trim() })
      setSaved(result.data); setOpen(false)
      toast('已纳入管理，生成年度方案时将按此方向带入', 5000)
    } catch (e) { setError(e.message || '保存失败，请重试') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" className="btn btn-secondary btn-sm" onClick={event => {
      event.stopPropagation(); setTitle(saved?.title || suggestedIssue || suggestions[0] || '');
      setDirection(saved?.direction || ''); setNote(saved?.note || ''); setError(''); setOpen(true)
    }}>{saved ? '✓ 已纳入管理' : '＋ 纳入管理'}</button>
    {open && <div className="modal-overlay" onClick={event => event.stopPropagation()}><div className="modal" style={{ maxWidth: 520 }}>
      <div className="modal-header"><div className="modal-title">纳入年度管理</div><button className="modal-close" onClick={() => setOpen(false)}>×</button></div>
      <div className="modal-body">
        <div style={{ fontSize: 13, color: '#65776F', marginBottom: 10 }}>来源：{sourceLabel || '已审核专项筛查'}。请选择对应现有方案的管理方向。</div>
        <label className="form-label">具体问题</label><input autoFocus className="form-input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：肺结节" />
        <label className="form-label" style={{ marginTop: 12 }}>管理方向</label>
        <select className="form-input" value={direction} onChange={e => setDirection(e.target.value)}><option value="">请选择</option>{DIRECTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="form-label" style={{ marginTop: 12 }}>顾问补充说明（可选）</label>
        <textarea className="form-input" rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="如已确认的复查时限、就医意向或待核实事项" />
        {error && <div role="alert" style={{ marginTop: 8, color: '#B42318' }}>{error}</div>}
        <div style={{ marginTop: 8, fontSize: 12, color: '#65776F' }}>团队专项研判可另行开展，不影响本项进入年度方案。</div>
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '确认纳入管理'}</button></div>
    </div></div>}
  </>
}
