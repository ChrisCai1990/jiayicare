import React, { useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import { requiresOutcomeReview } from '../utils/followUpContinuity'

export default function FollowUpOutcomeReview({ item, onSaved }) {
  const { staff } = useStaff()
  const [reports, setReports] = useState([]), [drafts, setDrafts] = useState([])
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [ids, setIds] = useState([]), [decision, setDecision] = useState(''), [draftId, setDraftId] = useState('')
  const [note, setNote] = useState(''), [checked, setChecked] = useState(false), [saved, setSaved] = useState(null)
  if (!requiresOutcomeReview(item)) return null
  const proof = saved?.outcomeReview || item.outcomeReview
  if (proof) return <div>结果处置已确认：{proof.note}；后续计划{proof.nextFollowUpIds?.length || 0}条</div>
  if (['completed', 'cancelled'].includes(item.status)) return null
  if (!['familyDoctor', 'superadmin'].includes(staff?.role)) return <p>本计划保留至报告审核和健康顾问结果处置完成；沟通、服务核销不直接结束计划。</p>
  const load = async () => {
    setBusy(true); setMessage('')
    try {
      const patientId = item.patientId?._id || item.patientId
      const [r, d, c] = await Promise.all([staffAPI.getPatientReports(patientId), staffAPI.getReportFollowUpDrafts(patientId), staffAPI.getFollowUpOutcomeCandidates(item._id)])
      setReports((r.data || []).filter(x => x.audit_status === 'audited'))
      setDrafts((d.data || []).filter(x => x.status === 'approved' && x.followUpPublication?.status === 'published' && x.followUpDrafts?.length))
      setIds((c.data?.reportIds || []).filter(id => (r.data || []).some(x => x._id === id && x.audit_status === 'audited')))
      if (c.data?.draftIds?.length === 1 && (d.data || []).some(x => x._id === c.data.draftIds[0])) {
        setDraftId(c.data.draftIds[0]); setDecision('new_plan')
      }
      setLoaded(true)
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  const submit = async () => {
    setBusy(true); setMessage('')
    try {
      const r = await staffAPI.reviewFollowUpOutcome(item._id, { updatedAt: item.updatedAt, reportIds: ids, decision, note, checksComplete: checked, reportDraftId: draftId || undefined })
      setSaved(r.data); onSaved?.(r.data)
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  return <section style={{ border: '1px solid #D7E4DD', padding: 12, borderRadius: 8 }}>
    <b>健康顾问 · 本次结果处置</b>
    {!loaded ? <button onClick={load} disabled={busy}>核对报告与后续安排</button> : <>
      <p>已按明确关联的服务预选报告（如有），请核对是否为本次完整资料；不会按名称或日期猜测，也不会自动确认无需继续。</p>
      {reports.map(r => <label key={r._id} style={{ display: 'block' }}><input type="checkbox" checked={ids.includes(r._id)} onChange={e => setIds(a => e.target.checked ? [...a, r._id] : a.filter(id => id !== r._id))} />{r.title}（{r.date || r.checkDate || '未填日期'}）</label>)}
      <select aria-label="结果处置" value={decision} onChange={e => setDecision(e.target.value)}><option value="">请选择后续安排</option><option value="new_plan">需要继续，核对已发布的新计划</option><option value="no_further">本次已完成，无需后续计划</option></select>
      {decision === 'new_plan' && <select aria-label="已发布后续计划" value={draftId} onChange={e => setDraftId(e.target.value)}><option value="">选择本次报告对应的已发布随访</option>{drafts.filter(d => ids.includes(d.reportId)).map(d => <option key={d._id} value={d._id}>{d.title} · {d.followUpDrafts.length}条</option>)}</select>}
      <textarea aria-label="结果处置结论" placeholder="结果处置结论及无需继续/后续跟进依据" value={note} onChange={e => setNote(e.target.value)} />
      <label><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />本次检查已完成，所选报告为本次完整资料，已核对后续安排</label>
      <button disabled={busy || !checked || !note.trim() || !ids.length || !decision || (decision === 'new_plan' && !draftId)} onClick={submit}>确认处置并完成原计划</button>
    </>}
    {message && <p role="alert">{message}</p>}
  </section>
}
