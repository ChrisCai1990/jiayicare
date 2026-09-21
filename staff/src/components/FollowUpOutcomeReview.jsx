import React, { useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import { requiresOutcomeReview } from '../utils/followUpContinuity'
import { submitMergedOutcome } from '../utils/mergedOutcomeReview.mjs'

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
      setDrafts((d.data || []).filter(x => x.status === 'approved' || (x.status === 'advisor_review' && x.followUpAutomation?.status === 'ready')))
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
      const r = await submitMergedOutcome({ api: staffAPI, item, reportIds: ids, decision, note, checked, draft: drafts.find(d => d._id === draftId) })
      setSaved(r.data); onSaved?.(r.data)
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  return <section style={{ border: '1px solid #D7E4DD', padding: 12, borderRadius: 8 }}>
    <b>健康顾问 · 本次结果处置</b>
    {!loaded ? <button onClick={load} disabled={busy}>核对报告与后续安排</button> : <>
      <p>已按明确关联的服务预选报告（如有），请核对是否为本次完整资料；不会按名称或日期猜测，也不会自动确认无需继续。</p>
      {reports.map(r => <label key={r._id} style={{ display: 'block' }}><input type="checkbox" checked={ids.includes(r._id)} onChange={e => setIds(a => e.target.checked ? [...a, r._id] : a.filter(id => id !== r._id))} />{r.title}（{r.date || r.checkDate || '未填日期'}）</label>)}
      <select aria-label="结果处置" value={decision} onChange={e => { setDecision(e.target.value); setDraftId('') }}><option value="">请选择后续安排</option><option value="new_plan">需要继续，审核并发布后续计划</option><option value="no_further">本次已完成，无需后续计划</option></select>
      <select aria-label="后续随访草稿" value={draftId} onChange={e => setDraftId(e.target.value)}><option value="">{decision === 'new_plan' ? '选择本次报告随访' : '可关联本次无后续行动草稿一并审核'}</option>{drafts.filter(d => ids.includes(String(d.reportId?._id || d.reportId))).map(d => <option key={d._id} value={d._id}>{d.title} · {d.followUpDrafts?.length || 0}条 · {d.status === 'approved' ? '已审核' : '待审核'}</option>)}</select>
      {drafts.filter(d => d._id === draftId).map(d => <div key={d._id}>
        <p>一次确认：审核并发布下列安排成功后，才结束原计划。已审核内容不可在此改写。</p>
        {(d.followUpDrafts || []).map((f, i) => {
          const change = patch => setDrafts(rows => rows.map(row => row._id === d._id ? { ...row, followUpDrafts: row.followUpDrafts.map((v, j) => i === j ? { ...v, ...patch } : v) } : row))
          return <fieldset key={i} disabled={busy || d.status === 'approved'}>
            <input aria-label="后续标题" value={f.title || ''} onChange={e => change({ title: e.target.value })} />
            <input aria-label="后续日期" type="date" value={f.date || ''} onChange={e => change({ date: e.target.value })} />
            <textarea aria-label="后续内容" value={f.content || ''} onChange={e => change({ content: e.target.value })} />
            <label><input type="checkbox" checked={f.requiresService === true} onChange={e => change({ requiresService: e.target.checked })} />需规划师安排服务</label>
            <button onClick={() => setDrafts(rows => rows.map(row => row._id === d._id ? { ...row, followUpDrafts: row.followUpDrafts.filter((_, j) => i !== j) } : row))}>移除不适用安排</button>
          </fieldset>
        })}
      </div>)}
      <textarea aria-label="结果处置结论" placeholder="结果处置结论及无需继续/后续跟进依据" value={note} onChange={e => setNote(e.target.value)} />
      <label><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />本次检查已完成，所选报告为本次完整资料，已核对后续安排</label>
      <button disabled={busy || !checked || !note.trim() || !ids.length || !decision || (decision === 'new_plan' && !draftId)} onClick={submit}>确认审核与后续安排，并完成原计划</button>
    </>}
    {message && <p role="alert">{message}</p>}
  </section>
}
