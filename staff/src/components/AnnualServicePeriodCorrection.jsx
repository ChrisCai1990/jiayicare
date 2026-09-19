import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const labels = { pending_review: '待健康顾问审核', approved_pending_apply: '已审核，待系统安全应用（尚未生效）', applied: '更正已生效，冻结原方案与执行记录保留', rejected: '已退回规划师', withdrawn: '已撤回' }
const kinds = { task: '客户任务', followup: '随访任务', supply: '周期补给' }
const actions = { submitted: '规划师提交', approve: '顾问审核通过', reject: '顾问退回', impact_refreshed: '刷新影响清单', withdrawn: '规划师撤回', applied: '系统应用生效', apply_blocked: '应用受阻' }
export default function AnnualServicePeriodCorrection({ planId, period, staff, reload }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [orders, setOrders] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const [dateDrafts, setDateDrafts] = useState({})
  const correction = period.correction
  useEffect(() => { setDateDrafts({}); setAck(false) }, [correction?.id, period.correctionRevision])
  const dateKey = row => `${row.moduleKey}:${row.index}:${row.field}`
  const scheduleChanges = (correction?.impact?.planDates || []).filter(row => dateDrafts[dateKey(row)] && dateDrafts[dateKey(row)] !== row.date).map(row => ({ moduleKey: row.moduleKey, index: row.index, field: row.field, from: row.date, to: dateDrafts[dateKey(row)] }))
  const planner = ['healthPlanner', 'superadmin'].includes(staff?.role)
  const advisor = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const run = async (action, payload = {}) => {
    setBusy(true); setError('')
    try {
      await staffAPI.annualServicePeriodCorrection(planId, action, { ...payload, expectedRevision: period.correctionRevision || 0, correctionId: correction?.id })
      await reload(); setEditing(false); setAck(false); setNote('')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const begin = async () => {
    setBusy(true); setError('')
    try {
      const res = await staffAPI.getAnnualServicePeriod(planId)
      await reload()
      const source = ['rejected', 'withdrawn'].includes(res.data.period?.correction?.status) ? res.data.period.correction.proposed : res.data.period
      setOrders(res.data.orders || [])
      setForm({ sourceType: source.sourceType, sourceOrderId: source.sourceOrderId || '', contractReference: source.contractReference || '', startDate: source.startDate, endDate: source.endDate, verified: false, reason: '' })
      setEditing(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div style={{ borderTop: '1px solid #ddd', marginTop: 16, paddingTop: 12 }}>
    <strong>续约凭据更正记录</strong>
    <p>规划师提交，健康顾问核对排期影响。原凭据、冻结方案和已执行任务保留；审核不等于生效。</p>
    {error && <p style={{ color: '#B42318' }}>{error}</p>}
    {correction && <>
      <p>{labels[correction.status] || correction.status} · 原因：{correction.reason}</p>
      <p>原服务期：{correction.original.startDate} 至 {correction.original.endDate}；拟更正：{correction.proposed.startDate} 至 {correction.proposed.endDate}</p>
      <p>原凭据：{correction.original.contractReference || correction.original.evidenceSnapshot?.orderNo || correction.original.sourceOrderId}；拟更正：{correction.proposed.contractReference || correction.proposed.evidenceSnapshot?.orderNo || correction.proposed.sourceOrderId}</p>
      {correction.reviewNote && <p>审核意见：{correction.reviewNote}</p>}
      {!!correction.scheduleChanges?.length && <ul>{correction.scheduleChanges.map(row => <li key={dateKey(row)}>已审核日期修订：{row.moduleKey} 第{row.index + 1}项 · {row.from} → {row.to}</li>)}</ul>}
      <details><summary>排期影响清单（快照，共{correction.impact?.records?.length || 0}条任务）</summary>
        <p>日期变化可能影响相对排期。以下只供核对，不自动移动、取消或重开任务。</p>
        <ul>{(correction.impact?.planDates || []).map((row, i) => <li key={`p${i}`}>方案 {row.moduleKey} 第{row.index + 1}项 · {row.field}：{row.date}{row.outsidePeriod ? '（超出拟更正服务期）' : ''}</li>)}</ul>
        <ul>{(correction.impact?.records || []).map(row => <li key={`${row.kind}:${row.id}`}>{kinds[row.kind] || row.kind} · {row.id} · {row.date || '无日期'} · {row.status}{row.outsidePeriod ? ' · 越界' : ''}{row.preserve ? ' · 保留原执行/关联状态' : ''}</li>)}</ul>
      </details>
      {advisor && correction.status === 'pending_review' && <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
        <button className="btn" disabled={busy} onClick={() => run('refresh-impact')}>刷新排期影响清单</button>
        <details><summary>修订未派发的固定日期事项（可选）</summary>
          <p>只改尚未派发的固定日期；已有任务、相对周期和服务执行记录不能在这里改。修订原因请填在审核意见中。</p>
          {(correction.impact?.planDates || []).filter(row => row.amendable).map(row => <label key={dateKey(row)} style={{ display: 'block', marginBottom: 8 }}>{row.moduleKey} 第{row.index + 1}项 · 原日期 {row.date}
            <input className="form-input" type="date" min={correction.proposed.startDate} max={correction.proposed.endDate} value={dateDrafts[dateKey(row)] || ''} onChange={e => { const value = e.target.value; setDateDrafts(current => ({ ...current, [dateKey(row)]: value })); setAck(false) }} />
          </label>)}
        </details>
        <textarea className="form-input" aria-label="更正审核意见" placeholder="审核意见（退回必填）" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} />
        <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> 已核对影响及{scheduleChanges.length}项日期修订；仅在安全条件满足时生效，保留冻结原方案，不移动已派发任务</label>
        <div><button className="btn btn-primary" disabled={busy || !ack || (scheduleChanges.length > 0 && !note.trim())} onClick={() => run('review', { decision: 'approve', note, impactAcknowledged: ack, applicationPolicy: scheduleChanges.length ? 'revise_unissued_fixed' : 'retain_schedule', scheduleChanges })}>审核通过并尝试安全应用</button> <button className="btn" disabled={busy || !note.trim()} onClick={() => run('review', { decision: 'reject', note })}>退回规划师</button></div>
      </div>}
      {correction.status === 'approved_pending_apply' && <p style={{ color: '#B54708' }}>{correction.applyIssue?.message || '已进入每日自动重试，也可使用上方重新核对按钮重试。当前仍按原生效服务期运行，无需重复审核。'}</p>}
      {advisor && correction.status === 'approved_pending_apply' && correction.applyIssue && <button className="btn" disabled={busy} onClick={() => run('refresh-impact')}>刷新影响并重新核对</button>}
      {planner && (['pending_review', 'rejected'].includes(correction.status) || (correction.status === 'approved_pending_apply' && correction.applyIssue)) && <button className="btn" disabled={busy} onClick={() => run('withdraw')}>撤回本次更正，保留原记录</button>}
    </>}
    {planner && (!['pending_review', 'approved_pending_apply'].includes(correction?.status) || correction?.applyIssue) && !editing && <button className="btn" disabled={busy} onClick={begin}>提交凭据更正</button>}
    {editing && <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
      <label>拟更正凭据<select className="form-input" value={form.sourceType} onChange={e => update('sourceType', e.target.value)}><option value="paid_order">已支付年度订单</option><option value="offline_contract">线下合同</option></select></label>
      {form.sourceType === 'paid_order' ? <label>年度订单<select className="form-input" value={form.sourceOrderId} onChange={e => update('sourceOrderId', e.target.value)}><option value="">请选择</option>{orders.map(order => <option key={order._id} value={order._id}>{order.orderNo || order._id} · {order.serviceName}</option>)}</select></label> : <>
        <label>合同编号<input className="form-input" value={form.contractReference} maxLength={200} onChange={e => update('contractReference', e.target.value)} /></label>
        <label><input type="checkbox" checked={form.verified} onChange={e => update('verified', e.target.checked)} /> 已核验合同及拟更正服务期</label>
      </>}
      <label>拟开始日期<input className="form-input" type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} /></label>
      <label>拟结束日期<input className="form-input" type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} /></label>
      <label>更正原因<textarea className="form-input" value={form.reason} maxLength={2000} onChange={e => update('reason', e.target.value)} /></label>
      <div><button className="btn btn-primary" disabled={busy || !form.reason?.trim()} onClick={() => run('', form)}>提交健康顾问审核</button> <button className="btn" disabled={busy} onClick={() => setEditing(false)}>取消编辑</button></div>
    </div>}
    {!!period.correctionHistory?.length && <details><summary>历史留痕（{period.correctionHistory.length}条）</summary><ul>{period.correctionHistory.map((entry, i) => <li key={i}>{actions[entry.action] || entry.action} · {entry.proposedAt || entry.reviewedAt || entry.at} · 操作人：{entry.proposedBy || entry.reviewedBy || entry.by} · {entry.reason || entry.note || ''}</li>)}</ul></details>}
  </div>
}
