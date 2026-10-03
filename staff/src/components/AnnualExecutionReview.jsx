import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'

const statusName = { planned: '待执行', pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消', missed: '逾期' }
const dateText = value => {
  if (!value) return '日期未定'
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : String(value)
}
export default function AnnualExecutionReview({ patientId, planId, planVersion, canEdit, onDataChange }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [note, setNote] = useState(''), [outcome, setOutcome] = useState('unchanged'), [message, setMessage] = useState('')
  const seq = useRef(0), section = useRef(null)
  const reload = async () => {
    const version = ++seq.current
    try {
      const response = await staffAPI.getAnnualExecutionReview(patientId, planId)
      if (version === seq.current) { setData(response.data); onDataChange?.(response.data); setError('') }
    } catch (e) { if (version === seq.current) { setData(null); onDataChange?.(null); setError(e.message || '加载执行核对失败') } }
  }
  useEffect(() => {
    setData(null); onDataChange?.(null); setNote(''); setMessage('')
    return () => { seq.current++ }
  }, [patientId, planId])
  useEffect(() => { reload(); return () => { seq.current++ } }, [patientId, planId, planVersion])
  const pending = (data?.reviews || []).filter(r => r.status === 'pending')
  const done = (data?.reviews || []).filter(r => r.status === 'reviewed')
  useEffect(() => {
    if (data && window.location.hash === '#annual-execution-review') section.current?.scrollIntoView?.({ block: 'start' })
  }, [data])
  const submit = async () => {
    if (busy || !note.trim() || error) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await staffAPI.completeAnnualExecutionReview(patientId, planId, { outcome, note: note.trim(), baseUpdatedAt: data.baseUpdatedAt, taskVersion: data.taskVersion })
      setMessage(result.message); setNote(''); await reload()
    } catch (e) { setError(e.message || '保存失败，请重试') }
    finally { setBusy(false) }
  }
  if (!data && !error) return null
  if (!data?.reviews?.length && !error) return null
  return <section ref={section} id="annual-execution-review" className="card" style={{ marginBottom: 16, padding: 16, border: pending.length ? '1px solid #E4BE75' : undefined }}>
    <h3 style={{ margin: '0 0 8px' }}>方案修订后的执行核对{pending.length ? ` · ${pending.length}次待核对` : ''}</h3>
    {error && <div role="alert">{error} <button className="btn btn-secondary btn-sm" disabled={busy} onClick={reload}>刷新核对</button></div>}
    {message && <p role="status">{message}</p>}
    {pending.length > 0 && <>
      <p>有 {pending.reduce((count, review) => count + review.changes.length, 0)} 项方案变更待核对。变更已标在对应方案事项中；请先核对原服务流程中的执行安排，再记录结果。</p>
      <p><a href="#annual-plan-content">查看对应方案事项</a></p>
      <details style={{ margin: '12px 0' }}>
        <summary>本方案直接关联的执行安排：{data.totals.followUps}条医护事项、{data.totals.tasks}条会员任务</summary>
        <p>以下为核对时的参考。就医、订单等其他关联服务请在会员原流程核对。</p>
        {data.followUps.map(row => <div key={row._id} style={{ margin: '8px 0' }}>
          <a href={`/patients/${patientId}?tab=followups&followUpId=${row._id}`}>{row.theme || '随访事项'}</a> · {statusName[row.status] || '待核对状态'} · {dateText(row.date)} · {row.assignedTo?.name || '未指定执行人'}
        </div>)}
        {data.tasks.map(row => <div key={row._id} style={{ margin: '8px 0' }}>{row.title} · {statusName[row.status] || '待核对状态'} · {dateText(row.dueDate)}（会员任务）</div>)}
        {(data.totals.followUps > data.followUps.length || data.totals.tasks > data.tasks.length) && <p>每类最多展示100条，请到原流程核对其余事项。</p>}
        {!data.totals.followUps && !data.totals.tasks && <p>没有直接关联记录，不代表其他服务流程中没有安排。</p>}
      </details>
      <p><a href={`/patients/${patientId}?tab=followups`}>打开会员执行事项</a></p>
      {canEdit ? <div style={{ display: 'grid', gap: 8 }}>
        <label>核对结论 <select className="form-input" value={outcome} disabled={busy} onChange={e => setOutcome(e.target.value)}>
          <option value="unchanged">现有执行安排无需调整</option><option value="arranged">已在原流程完成调整或衔接</option>
        </select></label>
        <textarea className="form-input" aria-label="执行安排核对说明" maxLength={1000} placeholder="填写实际核对结果；如已调整，请说明事项、负责人及原流程记录。" value={note} disabled={busy} onChange={e => setNote(e.target.value)} />
        <div><button className="btn btn-primary btn-sm" disabled={busy || !!error || !note.trim()} onClick={submit}>{busy ? '保存中…' : '记录核对结果'}</button></div>
      </div> : <p>待健康顾问核对；执行岗位继续使用原事项入口。</p>}
    </>}
    {done.length > 0 && <details style={{ marginTop: 12 }}><summary>已核对记录（{done.length}）</summary>{done.map(r => <p key={r.id}>{dateText(r.reviewedAt)} · {r.reviewedByName || '健康顾问'} · {r.outcome === 'arranged' ? '已衔接原流程' : '无需调整'}<br />{r.note}</p>)}</details>}
  </section>
}
