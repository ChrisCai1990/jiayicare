import React, { useState } from 'react'
import { staffAPI } from '../api'

const labels = { pending_review: '待健康顾问审核', approved_pending_apply: '已审核，待系统安全应用（尚未生效）', rejected: '已退回规划师', withdrawn: '已撤回' }
const kinds = { task: '客户任务', followup: '随访任务', supply: '周期补给' }
const actions = { submitted: '规划师提交', approve: '顾问审核通过', reject: '顾问退回', impact_refreshed: '刷新影响清单', withdrawn: '规划师撤回' }
export default function AnnualServicePeriodCorrection({ planId, period, staff, reload }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [orders, setOrders] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const correction = period.correction
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
      <details><summary>排期影响清单（快照，共{correction.impact?.records?.length || 0}条任务）</summary>
        <p>日期变化可能影响相对排期。以下只供核对，不自动移动、取消或重开任务。</p>
        <ul>{(correction.impact?.planDates || []).map((row, i) => <li key={`p${i}`}>方案 {row.moduleKey} 第{row.index + 1}项 · {row.field}：{row.date}{row.outsidePeriod ? '（超出拟更正服务期）' : ''}</li>)}</ul>
        <ul>{(correction.impact?.records || []).map(row => <li key={`${row.kind}:${row.id}`}>{kinds[row.kind] || row.kind} · {row.id} · {row.date || '无日期'} · {row.status}{row.outsidePeriod ? ' · 越界' : ''}{row.preserve ? ' · 保留原执行/关联状态' : ''}</li>)}</ul>
      </details>
      {advisor && correction.status === 'pending_review' && <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
        <button className="btn" disabled={busy} onClick={() => run('refresh-impact')}>刷新排期影响清单</button>
        <textarea className="form-input" aria-label="更正审核意见" placeholder="审核意见（退回必填）" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} />
        <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> 已核对影响，保留已执行记录；本次只审核，尚不应用更正</label>
        <div><button className="btn btn-primary" disabled={busy || !ack} onClick={() => run('review', { decision: 'approve', note, impactAcknowledged: ack })}>审核通过，留待安全应用</button> <button className="btn" disabled={busy || !note.trim()} onClick={() => run('review', { decision: 'reject', note })}>退回规划师</button></div>
      </div>}
      {correction.status === 'approved_pending_apply' && <p style={{ color: '#B54708' }}>安全应用及任务更正承接尚未开放。当前仍按原生效服务期运行，无需重复点击审核；后续应用前仍需核验最新任务状态。</p>}
      {planner && ['pending_review', 'rejected'].includes(correction.status) && <button className="btn" disabled={busy} onClick={() => run('withdraw')}>撤回本次更正，保留原记录</button>}
    </>}
    {planner && !['pending_review', 'approved_pending_apply'].includes(correction?.status) && !editing && <button className="btn" disabled={busy} onClick={begin}>提交凭据更正</button>}
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
