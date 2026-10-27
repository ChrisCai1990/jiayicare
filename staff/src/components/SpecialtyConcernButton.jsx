import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { specialtyIssueSuggestions } from '../utils/specialtyIssueSuggestion.mjs'
import { annualManagementSourceKey, findAnnualManagementDecision } from '../utils/annualManagementDecision.mjs'
import DateField from '../../../shared/DateField.jsx'

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
export default function SpecialtyConcernButton({ patientId, year, source, sourceLabel, sourceText = '', suggestedIssue = '', staff, toast }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [title, setTitle] = useState(''), [direction, setDirection] = useState(''), [note, setNote] = useState('')
  const [reviewKind, setReviewKind] = useState('none'), [reviewMonths, setReviewMonths] = useState('3'), [reviewItems, setReviewItems] = useState('')
  const [reviewAnchorDate, setReviewAnchorDate] = useState('')
  const [reviewDepartment, setReviewDepartment] = useState('')
  const [saved, setSaved] = useState(null), [legacy, setLegacy] = useState(null), [adoptLegacy, setAdoptLegacy] = useState(false), [error, setError] = useState('')
  const suggestions = specialtyIssueSuggestions(sourceText)
  const key = annualManagementSourceKey(source)
  useEffect(() => {
    if (!patientId || !year || !source?.reportId || !['screening', 'screening_report'].includes(source.kind)) return
    let active = true
    load(patientId, year).then(result => {
      if (!active) return
      setSaved(findAnnualManagementDecision(result.data || [], source))
      setLegacy(source.kind === 'screening'
        ? (result.data || []).find(item => item.sourceKey === `screening_report:${source.reportId}`) || null
        : null)
    }).catch(() => {})
    return () => { active = false }
  }, [patientId, year, key])
  if (!['familyDoctor', 'superadmin'].includes(staff?.role) || !source?.reportId || !['screening', 'screening_report'].includes(source.kind)) return null
  const submit = async () => {
    if (title.trim().length < 2 || !direction) { setError('请填写具体问题并选择管理方向'); return }
    setBusy(true); setError('')
    try {
      const result = await staffAPI.saveAnnualManagementDecision(patientId, { year, source, title: title.trim(), direction, note: note.trim(),
        reviewPlan: { kind: reviewKind, intervalMonths: Number(reviewMonths), anchorDate: reviewAnchorDate, items: reviewItems, department: reviewDepartment },
        ...(adoptLegacy && legacy?._id ? { legacyDecisionId: legacy._id } : {}) })
      setSaved(result.data); if (adoptLegacy) setLegacy(null); setOpen(false)
      toast('已纳入管理，生成年度方案时将按此方向带入', 5000)
    } catch (e) { setError(e.message || '保存失败，请重试') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" className="btn btn-secondary btn-sm" onClick={event => {
      event.stopPropagation(); setTitle(saved?.title || suggestedIssue || suggestions[0] || '');
      setDirection(saved?.direction || ''); setNote(saved?.note || ''); setAdoptLegacy(false); setError(''); setOpen(true)
      setReviewKind(saved?.reviewPlan?.kind === 'recheck' ? 'recheck' : 'none')
      setReviewMonths(String(saved?.reviewPlan?.intervalMonths || 3))
      setReviewItems((saved?.reviewPlan?.items || []).join('、'))
      setReviewAnchorDate(saved?.reviewPlan?.anchorDate || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10))
      setReviewDepartment(saved?.reviewPlan?.department || '')
    }}>{saved ? '✓ 已纳入管理' : '＋ 纳入管理'}</button>
    {open && <div className="modal-overlay" onClick={event => event.stopPropagation()}><div className="modal" style={{ maxWidth: 520 }}>
      <div className="modal-header"><div className="modal-title">纳入年度管理</div><button className="modal-close" onClick={() => setOpen(false)}>×</button></div>
      <div className="modal-body">
        <div style={{ fontSize: 13, color: '#65776F', marginBottom: 10 }}>来源：{sourceLabel || '已审核专项筛查'}。请选择对应现有方案的管理方向。</div>
        <label className="form-label">具体问题</label><input autoFocus className="form-input" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：肺结节" />
        <label className="form-label" style={{ marginTop: 12 }}>管理方向</label>
        <select className="form-input" value={direction} onChange={e => { setDirection(e.target.value); if (!['ongoing_management', 'abnormal_followup'].includes(e.target.value)) setReviewKind('none') }}><option value="">请选择</option>{DIRECTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="form-label" style={{ marginTop: 12 }}>顾问补充说明（可选）</label>
        <textarea className="form-input" rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="如已确认的复查时限、就医意向或待核实事项" />
        {['ongoing_management', 'abnormal_followup'].includes(direction) && <><label className="form-label" style={{ marginTop: 12 }}>是否需要定期复查</label>
        <select className="form-input" value={reviewKind} onChange={e => setReviewKind(e.target.value)}>
          <option value="none">不单独安排复查</option><option value="recheck">安排一次复查</option>
        </select>
        {reviewKind === 'recheck' && <div style={{ marginTop: 10, padding: 10, background: '#F4F8F5', borderRadius: 6 }}>
          <label className="form-label">约几个月后复查</label>
          <input className="form-input" type="number" min="1" max="24" value={reviewMonths} onChange={e => setReviewMonths(e.target.value)} />
          <label className="form-label" style={{ marginTop: 8 }}>从哪一天起算</label>
          <DateField type="date" className="form-input" value={reviewAnchorDate} onChange={e => setReviewAnchorDate(e.target.value)} />
          <label className="form-label" style={{ marginTop: 8 }}>需复查项目（用顿号或换行分隔）</label>
          <textarea className="form-input" rows={2} value={reviewItems} onChange={e => setReviewItems(e.target.value)} placeholder="逐项填写具体检查名称，由顾问确认" />
          <label className="form-label" style={{ marginTop: 8 }}>先就诊的专科</label>
          <input className="form-input" maxLength={100} value={reviewDepartment} onChange={e => setReviewDepartment(e.target.value)} placeholder="例如：消化内科；不同专科请分别归属" />
          <div style={{ fontSize: 12, color: '#65776F' }}>同一月份、同一专科的项目归为一次就诊复查；先由专科医生评估并开单，再完成检查及结果回顾。</div>
        </div>}</>}
        {!saved && legacy && <label style={{ display: 'block', marginTop: 12, padding: 10, background: '#FFF9ED', borderRadius: 6, fontSize: 13 }}>
          <input type="checkbox" checked={adoptLegacy} onChange={e => {
            setAdoptLegacy(e.target.checked)
            if (e.target.checked) { setTitle(legacy.title || ''); setDirection(legacy.direction || ''); setNote(legacy.note || '') }
          }} /> 此报告有旧版整份报告纳入的“{legacy.title}”。确认它属于当前检查项目后，可勾选并重新归属；否则不要勾选。
        </label>}
        {error && <div role="alert" style={{ marginTop: 8, color: '#B42318' }}>{error}</div>}
        <div style={{ marginTop: 8, fontSize: 12, color: '#65776F' }}>团队专项研判可另行开展，不影响本项进入年度方案。</div>
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '确认纳入管理'}</button></div>
    </div></div>}
  </>
}
