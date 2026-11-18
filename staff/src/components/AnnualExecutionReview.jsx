import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'

const statusName = { planned: '待执行', pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消', missed: '逾期' }
const dateText = value => {
  if (!value) return '日期待确认'
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
  const carryovers = data?.carryovers || []
  const carriedList = carryovers.length > 0 && <div style={{ margin: '10px 0', padding: '10px 12px', background: '#F5FAF7', borderRadius: 8, fontSize: 13 }}>
    <strong>沿用既往方案的未完成随访（{carryovers.length}）</strong>
    <p style={{ margin: '5px 0' }}>这些事项与本方案有相同的已确认问题来源。新增派发会沿用未完成的原随访；若日期变化，请在原任务中续办并核对后续时间，既有进度仍保留。</p>
    {carryovers.map(row => <div key={row._id} style={{ marginTop: 5 }}><a href={`/patients/${patientId}?tab=followups&followUpId=${row._id}`}>{row.theme || '原随访事项'}</a> · {statusName[row.status] || '待核对'} · {dateText(row.date)} · {row.assignedTo?.name || '未指定执行人'}{row.duplicateCurrent && <strong style={{ color: '#9A5B13' }}> · 当前方案也有同问题随访，请核对既有重复项</strong>}</div>)}
  </div>
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
  if (!data?.reviews?.length && !carryovers.length && !error) return null
  if (!pending.length && !error) return <details ref={section} id="annual-execution-review" className="card" style={{ marginBottom: 16, padding: 16 }} open={carryovers.length > 0}>
    <summary style={{ cursor: 'pointer', color: '#52675D' }}>{carryovers.length ? `既往随访沿用（${carryovers.length}）` : `已核对记录（${done.length}）`}</summary>
    {carriedList}
    {done.length > 0 && <><p style={{ color: '#62776A', fontSize: 13 }}>已完成的执行核对：</p>
    {done.map(r => <p key={r.id}>{dateText(r.reviewedAt)} · {r.reviewedByName || '健康顾问'} · {r.outcome === 'arranged' ? '已衔接原流程' : '无需调整'}<br />{r.note}</p>)}</>}
  </details>
  return <section ref={section} id="annual-execution-review" className="card" style={{ marginBottom: 16, padding: 16, border: pending.length ? '1px solid #E4BE75' : undefined }}>
    <h3 style={{ margin: '0 0 8px' }}>方案修订与原执行任务核对{pending.length ? ` · ${pending.length}次修订` : ''}</h3>
    {error && <div role="alert">{error} <button className="btn btn-secondary btn-sm" disabled={busy} onClick={reload}>刷新核对</button></div>}
    {message && <p role="status">{message}</p>}
    {pending.length > 0 && <>
      <p style={{ fontSize: 13, color: '#52675D' }}>方案已保存；这项待办只核对修订对原执行任务的影响，不代表方案未完成。记录下方核对结论后，这项待办会退出工作台。这里比对的是修订前的已发布方案与新方案，以及原随访和服务任务；不是与 AI 建议核对。同一问题若只是日期调整，请在<a href={`/patients/${patientId}?tab=followups`}>原执行流程</a>续办原事项并核对新日期，避免重复建一条随访。已完成记录保留为历史。</p>
      {carriedList}
      <details style={{ margin: '12px 0' }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>查看方案变更明细（{pending.reduce((count, review) => count + review.changes.length, 0)}项）</summary><div style={{ display: 'grid', gap: 8, margin: '12px 0' }}>{pending.flatMap(review => review.changes.map((change, index) =>
        <div key={`${review.id}:${index}`} style={{ padding: '9px 12px', border: '1px solid #E8E3D7', borderRadius: 8, background: '#FFFCF6', fontSize: 13 }}>
          <strong>{change.module} · {change.title} · {change.action}</strong>
          <div style={{ color: '#52675D', marginTop: 4 }}>原安排：{change.before ? `${change.before.title} · ${dateText(change.before.date)}` : '无'}</div>
          <div style={{ color: '#52675D' }}>新方案：{change.after ? `${change.after.title} · ${dateText(change.after.date)}` : '已移除'}</div>
          {change.deletionReason && <div style={{ color: '#8B5E28' }}>删除原因：{change.deletionReason}</div>}
        </div>))}</div></details>
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
      {canEdit ? <div style={{ display: 'grid', gap: 8 }}>
        <label>核对结论 <select className="form-input" value={outcome} disabled={busy} onChange={e => setOutcome(e.target.value)}>
          <option value="unchanged">已核对，原执行安排无需调整</option><option value="arranged">已在原流程调整或衔接</option>
        </select></label>
        <textarea className="form-input" aria-label="执行安排核对说明" maxLength={1000} placeholder="填写实际核对结果；如已调整，请说明事项、负责人及原流程记录。" value={note} disabled={busy} onChange={e => setNote(e.target.value)} />
        <div><button className="btn btn-primary btn-sm" disabled={busy || !!error || !note.trim()} onClick={submit}>{busy ? '保存中…' : '记录核对结果'}</button></div>
      </div> : <p>待健康顾问核对；执行岗位继续使用原事项入口。</p>}
    </>}
    {done.length > 0 && <details style={{ marginTop: 12 }}><summary>已核对记录（{done.length}）</summary>{done.map(r => <p key={r.id}>{dateText(r.reviewedAt)} · {r.reviewedByName || '健康顾问'} · {r.outcome === 'arranged' ? '已衔接原流程' : '无需调整'}<br />{r.note}</p>)}</details>}
  </section>
}
