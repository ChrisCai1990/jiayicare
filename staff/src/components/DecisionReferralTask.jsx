import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DateField from '../../../shared/DateField.jsx'
import { staffAPI } from '../api'

export const isDecisionReferralTask = task => String(task?.workflowKey || '').startsWith('decision_referral:')
  || (task?.sourceType === 'order' && (task?.sourceOrderId?.serviceName === '企业家健康决策计划'
    || /^订单服务：企业家健康决策计划$/.test(task?.theme || '')))

const label = { intake: '规划师受理', advisor: '顾问方案与转介', booking: '健管预约与沟通', specialist: '等待专科解析回复',
  advisor_review: '顾问审核归档', planner_final: '规划师最终验收', completed: '服务已完成' }
const date = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '待确认'
const methods = { remote: '远程', outpatient: '医院门诊', other: '其他方式' }

export default function DecisionReferralTask({ task, staff, onDone }) {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [resources, setResources] = useState({ institutions: [], departments: [], experts: [] })
  const [reports, setReports] = useState([])
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    staffAPI.getDecisionReferralTask(task._id).then(result => { if (live) setData(result.data) }).catch(e => { if (live) setError(e.message) })
    if ((task.workflowKey || '') === 'decision_referral:advisor') {
      staffAPI.getMedicalResources().then(result => { if (live) setResources(result.data || { institutions: [], departments: [], experts: [] }) }).catch(e => { if (live) setError(e.message) })
      const patientId = task.patientId?._id || task.patientId
      staffAPI.getPatientReports(patientId).then(result => { if (live) setReports(result.data || []) }).catch(e => { if (live) setError(e.message) })
    }
    return () => { live = false }
  }, [task._id])
  const update = key => event => setForm(value => ({ ...value, [key]: event.target.value }))
  const workflow = data?.workflow || {}
  const plan = workflow.plan || {}
  const booking = workflow.booking || {}
  const referral = data?.referral
  const stage = data?.taskStage
  const active = data?.stage === stage && ['planned', 'in_progress', 'missed'].includes(data?.taskStatus)
  const selected = resources.experts.find(item => String(item._id) === String(form.medicalExpertId))
  const institution = resources.institutions.find(item => String(item._id) === String(selected?.institutionId))
  const department = resources.departments.find(item => String(item._id) === String(selected?.departmentId))
  const submit = async event => {
    event.preventDefault()
    if (!active || busy) return
    setBusy(true); setError('')
    try {
      await staffAPI.advanceDecisionReferral(task._id, form)
      onDone?.()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <section style={{ border: '1px solid #B9DDD0', borderRadius: 10, background: '#F6FBF8', padding: 16, display: 'grid', gap: 12 }}>
    <b>企业家健康决策计划 · {label[data?.stage] || '读取进度中'}</b>
    {!data && !error && <span>正在读取订单转介进度…</span>}
    {plan.confirmedAt && <div style={{ lineHeight: 1.7 }}>
      <b>健康顾问确认的安排</b><br />
      {plan.hospital}{plan.campus && ` · ${plan.campus}`} · {plan.department} · {plan.expert}<br />
      预计解析：{date(plan.expectedAt)} · {methods[plan.method] || plan.method}<br />
      转介原因：{plan.reason}<br />待解答问题：{plan.questionList}
    </div>}
    {booking.confirmedAt && <div style={{ lineHeight: 1.7 }}>
      <b>健管预约及客户沟通</b><br />
      实际预约：{date(booking.actualAt)}<br />
      预约结果：{booking.appointmentNote}<br />
      客户沟通：{booking.contactNote}
    </div>}
    {referral && <div style={{ lineHeight: 1.7 }}>
      <b>专科转介 · {({ pending: '待接单', accepted: '解析中', completed: '已回复', rejected: '已退回' })[referral.status] || referral.status}</b>
      {referral.respondedAt && <><br />回复时间：{date(referral.respondedAt)}<br />
        {referral.responseAnalysis && <>问题分析：{referral.responseAnalysis}<br /></>}
        {referral.responseOpinion && <>专业意见：{referral.responseOpinion}<br /></>}
        {referral.response && <>回复：{referral.response}</>}
      </>}
    </div>}
    {referral?.courseDraftStatus === 'pending_review' && <p style={{ color: '#9A5B13', margin: 0 }}>专科回复含待审核病程草稿；请先到“我发出的转介”核对并归档，再提交本服务审核。</p>}
    {referral?.feedbackRevisionRequest?.pending && <p style={{ color: '#9A5B13', margin: 0 }}>已请专科补充：{referral.feedbackRevisionRequest.note}</p>}
    {workflow.archive?.reviewedAt && <div><b>健康顾问审核归档：</b>{workflow.archive.note}</div>}
    {workflow.acceptance?.confirmedAt && <div><b>健康规划师验收：</b>{workflow.acceptance.note}</div>}
    {active && stage !== 'specialist' && <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
      {stage === 'intake' && <label>客户需求与转交要点 *<textarea className="form-input" required rows={3} maxLength={1000} value={form.intakeNote || ''} onChange={update('intakeNote')} /></label>}
      {stage === 'advisor' && <>
        <label>医院 · 科室 · 专家 *<select className="form-input" required value={form.medicalExpertId || ''} onChange={update('medicalExpertId')}>
          <option value="">选择已关联医护账号的专科专家</option>
          {resources.experts.filter(item => item.linkedStaffId).map(item => {
            const hospital = resources.institutions.find(row => String(row._id) === String(item.institutionId))
            const dept = resources.departments.find(row => String(row._id) === String(item.departmentId))
            return <option key={item._id} value={item._id}>{hospital?.name || '医院待核对'} · {dept?.name || '科室待核对'} · {item.name}</option>
          })}
        </select></label>
        {selected && <small>已选择：{institution?.name || '-'} · {department?.name || '-'} · {selected.name}</small>}
        <label>预计报告解析时间 *<DateField className="form-input" type="datetime-local" required value={form.expectedAt || ''} onChange={update('expectedAt')} /></label>
        <label>解析方式 *<select className="form-input" required value={form.method || ''} onChange={update('method')}><option value="">请选择</option><option value="remote">远程</option><option value="outpatient">医院门诊</option><option value="other">其他方式</option></select></label>
        <label>转介原因 *<textarea className="form-input" required rows={2} maxLength={1000} value={form.reason || ''} onChange={update('reason')} /></label>
        <label>希望专科解答的问题 *<textarea className="form-input" required rows={3} maxLength={5000} value={form.questionList || ''} onChange={update('questionList')} /></label>
        <fieldset style={{ border: '1px solid #DCE9E2', borderRadius: 8 }}>
          <legend>授权专科查看的本次报告 *</legend>
          {reports.filter(report => report.fileUrl || report.fileUrls?.length).length ? reports.filter(report => report.fileUrl || report.fileUrls?.length).map(report => <label key={report._id} style={{ display: 'block', margin: '6px 0' }}>
            <input type="checkbox" checked={(form.reportIds || []).includes(String(report._id))}
              onChange={event => setForm(value => ({ ...value, reportIds: event.target.checked
                ? [...(value.reportIds || []), String(report._id)]
                : (value.reportIds || []).filter(id => id !== String(report._id)) }))} />
            {' '}{report.title || '未命名报告'}{report.checkDate ? ` · ${String(report.checkDate).slice(0, 10)}` : ''}
          </label>) : <span>暂无可选报告，请先在客户档案上传并审核本次报告。</span>}
        </fieldset>
        <label>补充说明<textarea className="form-input" rows={2} maxLength={5000} value={form.content || ''} onChange={update('content')} /></label>
      </>}
      {stage === 'booking' && <>
        <label>实际预约时间 *<DateField className="form-input" type="datetime-local" required value={form.actualAt || ''} onChange={update('actualAt')} /></label>
        <label>预约结果及接入／门诊安排 *<textarea className="form-input" required rows={3} maxLength={2000} value={form.appointmentNote || ''} onChange={update('appointmentNote')} /></label>
        <label>客户沟通记录 *<textarea className="form-input" required rows={3} maxLength={2000} value={form.contactNote || ''} onChange={update('contactNote')} /></label>
      </>}
      {stage === 'advisor_review' && <>
        <label>顾问审核与归档结论 *<textarea className="form-input" rows={4} maxLength={3000} value={form.archiveNote || ''} onChange={update('archiveNote')} /></label>
        {!referral?.feedbackRevisionRequest?.pending && <div style={{ display: 'grid', gap: 8, padding: 10, background: '#FFF9ED', borderRadius: 8 }}>
          <label>需要专科补充的内容<textarea className="form-input" rows={2} maxLength={2000} value={form.revisionNote || ''} onChange={update('revisionNote')} /></label>
          <button type="button" className="btn btn-secondary" disabled={busy || !form.revisionNote?.trim()} onClick={async () => {
            setBusy(true); setError('')
            try {
              await staffAPI.requestDecisionReferralRevision(task._id, form.revisionNote)
              const result = await staffAPI.getDecisionReferralTask(task._id)
              setData(result.data)
              setForm(value => ({ ...value, revisionNote: '' }))
            } catch (e) { setError(e.message) }
            finally { setBusy(false) }
          }}>退回专科补充反馈</button>
        </div>}
      </>}
      {stage === 'planner_final' && <label>规划师最终验收结论 *<textarea className="form-input" required rows={3} maxLength={2000} value={form.acceptanceNote || ''} onChange={update('acceptanceNote')} /></label>}
      <button className="btn btn-primary" disabled={busy || (stage === 'advisor' && (!selected || !(form.reportIds || []).length)) || (stage === 'advisor_review' && (!form.archiveNote?.trim() || referral?.feedbackRevisionRequest?.pending || referral?.courseDraftStatus === 'pending_review'))}>{busy ? '提交中…' : ({
        intake: '确认并转健康顾问', advisor: '确认方案、发起转介并转健管预约',
        booking: '提交预约及客户沟通', advisor_review: '审核归档并转规划师验收',
        planner_final: '确认服务结束并关闭工作台任务',
      })[stage] || '提交'}</button>
    </form>}
    {data?.stage === 'specialist' && <div>
      等待专科医生在原转介中提交报告解析回复；回复后转健康顾问审核。
      {staff?.role === 'specialist' && <button type="button" className="btn btn-primary btn-sm" style={{ display: 'block', marginTop: 8 }}
        onClick={() => nav('/notifications', { state: { tab: 'referrals' } })}>打开收到的转介并回复</button>}
    </div>}
    {error && <p role="alert" style={{ color: '#B42318', margin: 0 }}>{error}</p>}
  </section>
}
