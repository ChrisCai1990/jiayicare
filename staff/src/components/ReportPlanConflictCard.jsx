import React, { useState } from 'react'
import { staffAPI } from '../api'

// Only an explicit exception decision; this never marks an examination complete.
export default function ReportPlanConflictCard({ report, plans = [], role }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const proof = report.planItemSync
  if (report.audit_status !== 'audited' || !['conflict', 'resolved'].includes(proof?.status)) return null
  const plan = plans.find(p => String(p._id) === String(report.planId))
  const item = plan?.items?.find(i => String(i._id) === String(report.planItemId))
  const resolved = saved || proof.status === 'resolved'
  const canResolve = ['healthManager', 'superadmin'].includes(role)
  async function submit() {
    if (busy || !confirmed || !reason.trim() || reason.trim().length > 1000) return
    setBusy(true); setError('')
    try {
      await staffAPI.resolveReportPlanConflict(report._id, { token: proof.token, action: 'keep_existing', reason: reason.trim() })
      setSaved(true)
    } catch (e) { setError(e.message || '保存失败，请稍后重试') }
    finally { setBusy(false) }
  }
  return <section aria-label="报告项目关联核对" style={{ padding: 14, marginBottom: 16, border: '1px solid #E5C78A', borderRadius: 8, background: '#FFFAEF' }}>
    <strong>{resolved ? '已记录关联核对结论' : '报告与检查项目关联待核对'}</strong>
    <p>报告已审核，但不能据此自动完成原检查项目。无需重新上传或解析。</p>
    <div>关联方案：{plan?.title || '当前客户可见方案中未找到，请先核对归属'}</div>
    <div>关联项目：{item?.name || '未找到匹配项目'}</div>
    {item && <div>原项目状态：{{ pending: '待完成', skipped: '已跳过', completed: '已完成' }[item.status] || item.status}</div>}
    <p>确认保留现状仅结束本条关联冲突提醒，不会完成检查、改动原报告或解除关联。若关联有误，不要提交此结论。</p>
    {resolved ? <div role="status">核对理由：{saved ? reason.trim() : proof.resolution?.reason}<br />原项目状态保持不变。</div> : canResolve ? <>
      <label>核对理由<textarea aria-label="关联核对理由" value={reason} maxLength={1000} disabled={busy} onChange={e => setReason(e.target.value)} style={{ width: '100%', minHeight: 72 }} /></label>
      <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> 已核对，确认保留原检查项目状态，不以本报告自动完成该项</label>
      {error && <div role="alert" style={{ color: '#DC3545', marginBottom: 8 }}>{error}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || !confirmed || !reason.trim()} onClick={submit}>{busy ? '保存中…' : '确认保留现状并记录理由'}</button>
    </> : <p>由所属健管专员在工作台核对处理。</p>}
  </section>
}
