import React, { useEffect, useState } from 'react'
import { staffAPI, careFlowAPI } from '../api'
import { BookingSummary } from './AnnualBookingCard'
import OnsiteBookingCard from './OnsiteBookingCard'
import tools from '../../../shared/annualDispatch.cjs'
import bookingTools from '../../../shared/annualBookingPlan.cjs'
import consultationTools from '../../../shared/annualConsultationBrief.cjs'
import CareFlowCard from './CareFlowCard'

export default function AnnualDispatchCard({ task, staff, onLinked }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [assigneeId, setAssignee] = useState(''), [note, setNote] = useState(''), [result, setResult] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [fullFlow,setFullFlow] = useState(false)
  const [flowData,setFlowData] = useState(null)
  const openReturn = async () => {
    setBusy(true); setError('')
    try { const r = await careFlowAPI.start(task._id); setFlowData(r.data); setFullFlow(true) }
    catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  const load = () => staffAPI.getAnnualDispatch(task._id).then(r => { setData(r.data); return r.data })
  useEffect(() => { if(task.careFlowId) return; let active = true; staffAPI.getAnnualDispatch(task._id).then(r => { if (active) setData(r.data) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [task._id,task.careFlowId])
  const act = async (fn, payload) => {
    setBusy(true); setError('')
    try { const r = await fn(task._id, payload); setData(r.data); onLinked?.(tools.isExecution(task) ? r.data.child : r.data.task) }
    catch (e) { setError(e.message); await load().catch(() => {}) } finally { setBusy(false) }
  }
  if (task.careFlowId || fullFlow) return <CareFlowCard task={task} staff={staff} initialData={flowData} />
  if (!data) return <p role={error ? 'alert' : undefined}>{error || '正在加载派单事项…'}</p>
  const { parent, child } = data, request = data.task, d = request.annualDispatch
  const item = d?.itemSnapshot || request.formData?.serviceRequest?.itemSnapshot || {}
  const execution = tools.isExecution(task), mode = request.formData?.serviceRequest?.mode
  const locked = request.serviceTracking?.linkId || parent?.serviceTracking?.linkId
  const active = !['completed', 'cancelled'].includes(request.status)
  const brief = consultationTools.consultationBrief(request, parent)
  return <section style={{ display: 'grid', gap: 16, fontSize: 14, lineHeight: 1.6 }}>
    {mode==='single' && !locked && active && <button className="btn btn-primary" onClick={()=>setFullFlow(true)}>进入完整就医流程（含定向回退与资料审核）</button>}
    {mode==='single' && !locked && active && <button className="btn btn-secondary" disabled={busy} onClick={openReturn}>退回修订（选择责任环节）</button>}
    <div style={{ background: '#F6FBF8', borderRadius: 12, padding: 16 }}>
      <h3 style={{ margin: '0 0 8px' }}>办理事项</h3>
      <b>{item.items || item.name || item.purpose || '顾问指定事项'}</b>
      <div>服务：{mode === 'managed' ? '全托管服务' : tools.labels[request.deliveryType || request.formData?.serviceRequest?.serviceType] || '就医协助'}</div>
      {(item.precautions || item.notes) && <div>注意事项：{item.precautions || item.notes}</div>}
    </div>
    <section aria-label="专家沟通交接" style={{ border: '1px solid #CDE3D8', borderRadius: 12, padding: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>就医目的与专家沟通</h3>
      <div style={{ marginBottom: 12 }}><b>为什么就医 / 申请检查</b><div style={{ whiteSpace: 'pre-wrap' }}>{brief.reason || (brief.basis ? '请向专家说明下方顾问记录的依据，由专家评估本次检查安排。' : '原计划未明确就医原因或检查依据，请健康顾问补充后再向专家转述。')}</div></div>
      {brief.basis && <div style={{ marginBottom: 12 }}><b>顾问记录的相关依据（原文）</b><div style={{ whiteSpace: 'pre-wrap' }}>{brief.basis}</div></div>}
      <b>与专家沟通什么</b>
      {brief.communication && <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{brief.communication}</div>}
      {!brief.missingReason && <ol style={{ paddingLeft: 22, margin: '8px 0' }}>
        <li>说明上述就医目的和已有检查记录；有原报告时一并提供，不把顾问记录转述为专家已确认的结论。</li>
        <li>{brief.items ? <>请专家评估本次拟安排的“{brief.items}”是否适合、是否需要开单，以及具体检查要求。</> : '请专家评估本次就医事项与后续安排；未明确的检查项目由健康顾问补充，不自行增加。'}</li>
        <li>询问并记录专家意见、实际开单项目、检查前准备要求，以及结果出来后如何复诊；与原计划不一致时反馈健康顾问。</li>
      </ol>}
      <small style={{ color: '#65776F' }}>以上为原计划转述与沟通提示，不新增诊断或检查建议；是否开单由接诊专家决定。</small>
    </section>
    {!execution && <div><h3 style={{ margin: '0 0 8px' }}>预约与交接</h3><BookingSummary booking={parent?.annualBooking || d?.bookingSnapshot} /></div>}
    {execution && <OnsiteBookingCard task={child || task} staff={staff} />}
    <details><summary>查看完整顾问依据与原计划</summary><div style={{ whiteSpace: 'pre-wrap', padding: 12, color: '#65776F' }}>{d?.advisorPlanText || parent?.plannedContent || parent?.content || item.basisSummary || '暂无详细依据'}</div></details>
    {data.warning && <p role="alert">{data.warning}</p>}
    {locked && !d ? <p>本事项已由现有服务承接，请在原服务任务中查看办理人员和进度；不重复派单。</p> : !d && !execution && <>
      <h3 style={{ margin: 0 }}>安排就医专员</h3>
      {mode === 'managed' ? <p>全托管事项沿用一站式服务流程，不能直接改为单项代办。</p> : <>
        {!bookingTools.bookingReady(parent?.annualBooking) && <p>等待健管专员完成预约安排，暂不可派单。</p>}
        <label>办理人员<select className="form-input" value={assigneeId} onChange={e => setAssignee(e.target.value)}><option value="">请选择就医专员</option>{data.assistants.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select></label>
        <label>派单备注（选填）<textarea className="form-input" rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || !active || !assigneeId || !bookingTools.bookingReady(parent?.annualBooking)} onClick={() => act(staffAPI.annualDispatch, { assigneeId, note })}>确认派单</button>
        {!locked && active && <button className="btn btn-secondary" disabled={busy} onClick={openReturn}>退回修订（顾问 / 健管专员）</button>}
      </>}
    </>}
    {d && <>
      <div style={{ background: '#F6FBF8', borderRadius: 12, padding: 16 }}><b>办理进度</b><div>就医专员：{d.assigneeName}</div><div>状态：{{ active: '已派单，待办理', pending_review: '已提交结果，待规划师验收', completed: '代办已验收' }[d.status]}</div>{d.note && <div>派单备注：{d.note}</div>}{d.result && <div style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>办理结果：{d.result.text}</div>}</div>
      {!child && !execution && <button className="btn btn-primary" disabled={busy} onClick={() => act(staffAPI.annualDispatch, { assigneeId: String(d.assigneeId), note: d.note })}>恢复本次派单（不会重复创建）</button>}
      {execution && d.status === 'active' && <>
        <label>专家沟通与办理结果<textarea className="form-input" rows={4} maxLength={5000} placeholder="记录专家意见、实际开单项目、预约结果及需反馈健康顾问的问题；未完成事项请如实说明。" value={result} onChange={e => setResult(e.target.value)} /></label>
        <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 已逐项核对顾问要求与本次交接，并如实记录办理结果</label>
        <button className="btn btn-primary" disabled={busy || !confirmed || !result.trim()} onClick={() => act(staffAPI.annualDispatchResult, { result, confirmed })}>提交办理结果，交规划师验收</button>
      </>}
      {!execution && d.status === 'pending_review' && <button className="btn btn-primary" disabled={busy} onClick={() => act(staffAPI.annualDispatchReview, { confirmed: true })}>确认代办结果并验收</button>}
      {!execution && d.status === 'completed' && child?.status !== 'completed' && <button className="btn btn-primary" disabled={busy} onClick={() => act(staffAPI.annualDispatchReview, { confirmed: true })}>同步已验收的执行状态</button>}
      <small>代办验收不代替健康顾问的医疗结果审核，原健管随访继续保留。</small>
    </>}
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
  </section>
}
