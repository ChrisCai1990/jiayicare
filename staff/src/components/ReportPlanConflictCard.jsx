import React, { useState } from 'react'
import { staffAPI } from '../api'

export function relinkResultText(status) {
  if (status === 'completed') return '更正已保存，所选项目已按已审核报告完成回写。原项目未改动。'
  if (status === 'pending') return '更正已保存，项目回写待系统恢复；尚不能认定检查已完成，无需重复提交。'
  if (status === 'conflict') return '更正已保存，但目标项目发生冲突，未确认完成；请关闭后重新打开核对。'
  return '更正已保存，回写结果尚未确认；请刷新核对，不要重复提交。'
}

// Explicit exception decisions only; saving an association is not completion evidence.
export default function ReportPlanConflictCard({ report, plans = [], role }) {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [action, setAction] = useState('keep_existing')
  const [targetItemId, setTargetItemId] = useState('')
  const proof = report.planItemSync
  if (report.legacyReviewWrite?.status === 'running') return <section aria-label="报告复查派单状态" role="status" style={{ padding: 14, marginBottom: 16, background: '#FFFAEF' }}>
    <strong>报告复查派单处理中</strong>
    <p>当前报告修改与删除暂时受保护。处理结果尚未全部确认，请勿重复审核或重复派单。</p>
    <p>若超过5分钟仍未恢复，请联系管理员核查。不能仅凭超时强制解除占用；已有记录会保留，不代表复查任务已全部生成。</p>
  </section>
  if (proof?.status === 'running') return <section aria-label="报告项目关联核对" role="status" style={{ padding: 14, marginBottom: 16, background: '#FFFAEF' }}>
    <strong>报告项目正在回写</strong>
    <p>为防止旧数据覆盖，当前报告修改与删除暂时受保护。请稍后刷新，不要重复审核或改关联。</p>
    <p>若超过5分钟仍未恢复，请联系管理员核查运行进程；不能仅凭超时强制解除占用。</p>
  </section>
  const latest = report.planItemConflictResolutions?.slice(-1)[0]
  const corrected = latest?.action === 'retarget_item' && String(latest.targetItemId) === String(report.planItemId)
  if (report.audit_status !== 'audited' || !proof || (!corrected && !['conflict', 'resolved'].includes(proof.status))) return null
  const plan = plans.find(p => String(p._id) === String(report.planId))
  const item = plan?.items?.find(i => String(i._id) === String(report.planItemId))
  const resolved = !!saved || proof.status === 'resolved' || (corrected && proof.status !== 'conflict')
  const canResolve = ['healthManager', 'superadmin'].includes(role)
  const canRetarget = plan && !['completed', 'cancelled'].includes(plan.status) && String(item?.reportId?._id || item?.reportId || '') !== String(report._id)
  const candidates = canRetarget ? (plan.items || []).filter(i => String(i._id) !== String(report.planItemId) && i.status === 'pending' && !i.reportId) : []
  async function submit() {
    if (busy || !confirmed || !reason.trim() || reason.trim().length > 1000 || (action === 'retarget_item' && !targetItemId)) return
    setBusy(true); setError('')
    try {
      const response = await staffAPI.resolveReportPlanConflict(report._id, { token: proof.token, action, reason: reason.trim(), ...(action === 'retarget_item' ? { targetItemId } : {}) })
      setSaved({ action, status: response.data?.syncStatus, targetName: candidates.find(i => String(i._id) === targetItemId)?.name })
    } catch (e) { setError(e.message || '保存失败，请稍后重试') }
    finally { setBusy(false) }
  }
  return <section aria-label="报告项目关联核对" style={{ padding: 14, marginBottom: 16, border: '1px solid #E5C78A', borderRadius: 8, background: '#FFFAEF' }}>
    <strong>{resolved ? '已记录关联核对结论' : '报告与检查项目关联待核对'}</strong>
    <p>报告已审核，但不能据此自动完成原检查项目。无需重新上传或解析。</p>
    <div>关联方案：{plan?.title || '当前客户可见方案中未找到，请先核对归属'}</div>
    <div>关联项目：{item?.name || '未找到匹配项目'}</div>
    {item && <div>当前关联项目状态：{{ pending: '待完成', skipped: '已跳过', completed: '已完成' }[item.status] || item.status}</div>}
    <p>确认保留现状仅结束本条关联冲突提醒，不会完成检查、改动原报告或解除关联。若关联有误，不要提交此结论。</p>
    {resolved ? <div role="status">核对理由：{saved ? reason.trim() : corrected ? latest.reason : proof.resolution?.reason}<br />
      {(saved?.action === 'retarget_item' || (!saved && corrected)) ? <>{saved?.targetName && <div>更正目标：{saved.targetName}</div>}{relinkResultText(saved ? saved.status : proof.status)}</> : '原项目状态保持不变。'}
    </div> : canResolve ? <>
      <label>处理方式<select aria-label="关联冲突处理方式" value={action} disabled={busy} onChange={e => { setAction(e.target.value); setConfirmed(false); setTargetItemId('') }}>
        <option value="keep_existing">核对后保留现状</option>
        <option value="retarget_item" disabled={!candidates.length}>更正到同方案其他项目</option>
      </select></label>
      {action === 'retarget_item' && <>
        <p>只允许同方案未绑定报告的待完成项目。更正后系统将用本份已审核报告尝试完成目标项目；原项目和服务来源不变。</p>
        <label>正确项目<select aria-label="更正目标项目" value={targetItemId} disabled={busy} onChange={e => { setTargetItemId(e.target.value); setConfirmed(false) }}>
          <option value="">请选择已核对的正确项目</option>{candidates.map(i => <option key={i._id} value={i._id}>{i.name}</option>)}
        </select></label>
      </>}
      <label>核对理由<textarea aria-label="关联核对理由" value={reason} maxLength={1000} disabled={busy} onChange={e => setReason(e.target.value)} style={{ width: '100%', minHeight: 72 }} /></label>
      <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} /> {action === 'retarget_item' ? '已核对本报告对应所选项目，同意更正并尝试回写该项目' : '已核对，确认保留原检查项目状态，不以本报告自动完成该项'}</label>
      {error && <div role="alert" style={{ color: '#DC3545', marginBottom: 8 }}>{error}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || !confirmed || !reason.trim() || (action === 'retarget_item' && !targetItemId)} onClick={submit}>{busy ? '保存中…' : action === 'retarget_item' ? '确认更正项目并记录理由' : '确认保留现状并记录理由'}</button>
    </> : <p>由所属健管专员在工作台核对处理。</p>}
  </section>
}
