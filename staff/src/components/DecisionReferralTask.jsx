import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DateField from '../../../shared/DateField.jsx'
import { staffAPI } from '../api'
import { filterReferralReports, referralDateTime } from '../utils/decisionReferralForm.mjs'

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
  const [coordinators, setCoordinators] = useState([])
  const [reports, setReports] = useState([])
  const [reportQuery, setReportQuery] = useState('')
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    staffAPI.getDecisionReferralTask(task._id).then(result => { if (live) setData(result.data) }).catch(e => { if (live) setError(e.message) })
    if ((task.workflowKey || '') === 'decision_referral:advisor') {
      staffAPI.getMedicalResources().then(result => { if (live) setResources(result.data || { institutions: [], departments: [], experts: [] }) }).catch(e => { if (live) setError(e.message) })
      staffAPI.getDecisionReferralCoordinators().then(result => { if (live) setCoordinators(result.data || []) }).catch(e => { if (live) setError(e.message) })
      const patientId = task.patientId?._id || task.patientId
      staffAPI.getPatientReports(patientId).then(result => { if (live) setReports(result.data || []) }).catch(e => { if (live) setError(e.message) })
    }
    return () => { live = false }
  }, [task._id])
  const update = key => event => setForm(value => ({ ...value, [key]: event.target.value }))
  const workflow = data?.workflow || {}
  const plan = workflow.plan || {}
  const booking = workflow.booking || {}
  const intake = (workflow.history || []).find(item => item.stage === 'intake')
  const referrals = data?.referrals || (data?.referral ? [data.referral] : [])
  const referral = referrals[0]
  const consultationType = form.consultationType || 'single'
  const requestedSpecialties = form.specialties || [{}]
  const plannedSpecialties = plan.specialties?.length ? plan.specialties : plan.confirmedAt ? [plan] : []
  const bookingSpecialties = plan.consultationType === 'multidisciplinary' && (workflow.referralIds?.length || (workflow.referralId ? 1 : 0)) === 1
    ? plannedSpecialties.slice(0, 1) : plannedSpecialties
  const stage = data?.taskStage
  const active = data?.stage === stage && ['planned', 'in_progress', 'missed'].includes(data?.taskStatus)
  const updateSpecialty = (index, key) => event => setForm(value => ({ ...value,
    specialties: (value.specialties || [{}]).map((row, rowIndex) => rowIndex === index ? { ...row, [key]: event.target.value } : row) }))
  const updateBooking = (index, key) => event => setForm(value => ({ ...value,
    bookings: Array.from({ length: plannedSpecialties.length }, (_, rowIndex) => ({ ...(value.bookings?.[rowIndex] || {}),
      ...(rowIndex === index ? { [key]: event.target.value } : {}) })) }))
  const availableReports = filterReferralReports(reports, '')
  const visibleReports = filterReferralReports(reports, reportQuery)
  const submit = async event => {
    event.preventDefault()
    if (!active || busy) return
    setBusy(true); setError('')
    try {
      const payload = { ...form }
      if (stage === 'advisor') {
        const rows = consultationType === 'single' ? requestedSpecialties.slice(0, 1) : requestedSpecialties
        if (consultationType === 'multidisciplinary' && !form.coordinatorStaffId) throw new Error('请选择牵头科室的院方接收账号')
        if (!form.reason?.trim() || !form.questionList?.trim()) throw new Error('请填写转介原因和希望专科解答的问题')
        if (!(form.reportIds || []).length) throw new Error('请至少选择一份授权专科查看的报告')
        payload.consultationType = consultationType
        payload.specialties = rows.map((row, index) => {
          const expectedAt = referralDateTime(row.expectedDate, row.expectedTime)
          if (!row.medicalExpertId || !expectedAt || !row.method) throw new Error(`请补全第 ${index + 1} 位专家、日期、时间和解析方式`)
          return { medicalExpertId: row.medicalExpertId, campus: row.campus || '', expectedAt, method: row.method, focusQuestion: row.focusQuestion || '' }
        })
        if (new Set(rows.map(row => String(row.medicalExpertId))).size !== rows.length) throw new Error('同一位专家不能重复安排')
      }
      if (stage === 'booking') {
        if (!form.contactNote?.trim()) throw new Error('请填写客户沟通记录')
        payload.bookings = bookingSpecialties.map((_, index) => {
          const row = form.bookings?.[index] || {}
          const actualAt = referralDateTime(row.actualDate, row.actualTime)
          if (!actualAt || !row.appointmentNote?.trim()) throw new Error(`请填写第 ${index + 1} 位专家的实际预约日期、时间和结果`)
          return { actualAt, appointmentNote: row.appointmentNote }
        })
      }
      await staffAPI.advanceDecisionReferral(task._id, payload)
      onDone?.()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <section style={{ border: '1px solid #B9DDD0', borderRadius: 10, background: '#F6FBF8', padding: 16, display: 'grid', gap: 12 }}>
    <b>企业家健康决策计划 · {label[data?.stage] || '读取进度中'}</b>
    {!data && !error && <span>正在读取订单转介进度…</span>}
    {intake?.detail && <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}><b>健康规划师记录的客户需求</b><br />{intake.detail}</div>}
    {plan.confirmedAt && <div style={{ lineHeight: 1.7 }}>
      <b>健康顾问确认的{plan.consultationType === 'multidisciplinary' ? '多学科' : '单学科'}会诊安排</b><br />
      {plan.consultationType === 'multidisciplinary' && <>牵头：{plannedSpecialties[0]?.hospital} · {plannedSpecialties[0]?.campus} · {plannedSpecialties[0]?.department}；院方接收：{plan.coordinatorName || '待核对'}<br /></>}
      {plannedSpecialties.map((row, index) => <div key={index}>{index + 1}. {row.hospital}{row.campus && ` · ${row.campus}`} · {row.department} · {row.expert}<br />
        预计解析：{date(row.expectedAt)} · {methods[row.method] || row.method}{row.focusQuestion && <> · 重点问题：{row.focusQuestion}</>}</div>)}
      转介原因：{plan.reason}<br />待解答问题：{plan.questionList}
    </div>}
    {booking.confirmedAt && <div style={{ lineHeight: 1.7 }}>
      <b>健管预约及客户沟通</b><br />
      {(booking.slots?.length ? booking.slots : [booking]).map((row, index) => <div key={index}>{plannedSpecialties[index]?.expert || `专家 ${index + 1}`}：{date(row.actualAt)} · {row.appointmentNote}</div>)}
      客户沟通：{booking.contactNote}
    </div>}
    {referrals.map((row, index) => row && <div key={row._id || index} style={{ lineHeight: 1.7 }}>
      <b>专科转介 {index + 1} · {row.medicalExpertSnapshot?.name || plannedSpecialties[index]?.expert || ''} · {({ pending: '待接单', accepted: '解析中', completed: '已回复', rejected: '已退回' })[row.status] || row.status}</b>
      {row.consultationType === 'multidisciplinary' && <div>
        牵头：{row.medicalExpertSnapshot?.institutionName} · {row.medicalExpertSnapshot?.departmentName}；院方接收：{row.coordinatorSnapshot?.name || '待确认'}<br />
        实际会诊专家：{(row.consultationMembers || []).map(member => `${member.hospital}·${member.department}·${member.expert}`).join('、') || '待院方整理'}
      </div>}
      {row.respondedAt && <><br />回复时间：{date(row.respondedAt)}<br />
        {row.responseSubmittedBy?.name && <>信息录入人：{row.responseSubmittedBy.name}<br /></>}
        {row.responseAnalysis && <>问题分析：{row.responseAnalysis}<br /></>}
        {row.responseOpinion && <>专业意见：{row.responseOpinion}<br /></>}
        {row.response && <>回复：{row.response}</>}
      </>}
    </div>)}
    {referrals.some(row => row?.courseDraftStatus === 'pending_review') && <p style={{ color: '#9A5B13', margin: 0 }}>专科回复含待审核病程草稿；请先到“我发出的转介”核对并归档，再提交本服务审核。</p>}
    {referrals.filter(row => row?.feedbackRevisionRequest?.pending).map(row => <p key={row._id} style={{ color: '#9A5B13', margin: 0 }}>已请{row.medicalExpertSnapshot?.name || '专科'}补充：{row.feedbackRevisionRequest.note}</p>)}
    {workflow.archive?.reviewedAt && <div><b>健康顾问审核归档：</b>{workflow.archive.note}</div>}
    {workflow.acceptance?.confirmedAt && <div><b>健康规划师验收：</b>{workflow.acceptance.note}</div>}
    {active && stage !== 'specialist' && <form noValidate onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
      {stage === 'intake' && <label>客户需求与转交要点 *<textarea className="form-input" required rows={3} maxLength={1000} value={form.intakeNote || ''} onChange={update('intakeNote')} /></label>}
      {stage === 'advisor' && <>
        <label>会诊类型 *<select className="form-input" value={consultationType} onChange={event => setForm(value => ({ ...value,
          consultationType: event.target.value, specialties: value.specialties || [{}] }))}>
          <option value="single">单学科会诊</option><option value="multidisciplinary">多学科会诊</option>
        </select></label>
        {consultationType === 'multidisciplinary' && <>
          <small>先确定牵头医院、科室和专家即可发起一份转介。其他专家可由顾问预填，也可由牵头科室的助理／秘书接单后补全并统一回复。</small>
          <label>牵头科室的院方接收账号（助理／秘书／专科医生） *<select className="form-input" value={form.coordinatorStaffId || ''} onChange={update('coordinatorStaffId')}>
            <option value="">请选择实际接收并填写转介回复的账号</option>
            {coordinators.map(account => <option key={account._id} value={account._id}>{account.name} · {({ institutionStaff: '院方人员', medicalAssistant: '医助', specialist: '专科医生' })[account.role] || account.role}{account.department ? ` · ${account.department}` : ''}</option>)}
          </select></label>
          {!coordinators.length && <small>暂无可用的院方接收账号，请先为牵头科室配置账号。</small>}
        </>}
        {(consultationType === 'single' ? requestedSpecialties.slice(0, 1) : requestedSpecialties).map((row, index) => {
          const expert = resources.experts.find(item => String(item._id) === String(row.medicalExpertId))
          const institution = resources.institutions.find(item => String(item._id) === String(expert?.institutionId))
          const department = resources.departments.find(item => String(item._id) === String(expert?.departmentId))
          return <fieldset key={index} style={{ border: '1px solid #DCE9E2', borderRadius: 8, display: 'grid', gap: 8 }}>
            <legend>{consultationType === 'multidisciplinary' && index === 0 ? '牵头医院／科室及专家' : `会诊专家 ${index + 1}`}</legend>
            <label>医院 · 院区 · 科室 · 专家姓名 *<select className="form-input" value={row.medicalExpertId || ''} onChange={event => setForm(value => ({ ...value,
              specialties: (value.specialties || [{}]).map((entry, rowIndex) => rowIndex === index
                ? { ...entry, medicalExpertId: event.target.value, campus: '' } : entry) }))}>
              <option value="">选择专科专家</option>
              {resources.experts.filter(item => consultationType === 'multidisciplinary' || item.linkedStaffId).map(item => {
                const hospital = resources.institutions.find(entry => String(entry._id) === String(item.institutionId))
                const dept = resources.departments.find(entry => String(entry._id) === String(item.departmentId))
                return <option key={item._id} value={item._id}>{hospital?.name || '医院待核对'}{hospital?.level ? `（${hospital.level}）` : ''} · {item.campus || dept?.campus || '院区待核对'} · {dept?.name || '科室待核对'} · {item.name}</option>
              })}
            </select></label>
            {expert && <small>已选择：{institution?.name || '-'} · {expert.campus || department?.campus || '院区待完善'} · {department?.name || '-'} · {expert.name}</small>}
            <label>院区 *<input className="form-input" value={row.campus || expert?.campus || department?.campus || ''} onChange={updateSpecialty(index, 'campus')} placeholder="请输入院区名称" /></label>
            <label>预计报告解析日期 *<DateField className="form-input" type="date" value={row.expectedDate || ''} onChange={updateSpecialty(index, 'expectedDate')} /></label>
            <label>预计报告解析时间 *<input className="form-input" type="time" value={row.expectedTime || ''} onChange={updateSpecialty(index, 'expectedTime')} /></label>
            <label>解析方式 *<select className="form-input" value={row.method || ''} onChange={updateSpecialty(index, 'method')}><option value="">请选择</option><option value="remote">远程</option><option value="outpatient">医院门诊</option><option value="other">其他方式</option></select></label>
            {consultationType === 'multidisciplinary' && <><label>本专科重点问题<textarea className="form-input" rows={2} maxLength={2000} value={row.focusQuestion || ''} onChange={updateSpecialty(index, 'focusQuestion')} /></label>
              {index > 0 && <button type="button" className="btn btn-secondary" onClick={() => setForm(value => ({ ...value, specialties: value.specialties.filter((_, rowIndex) => rowIndex !== index) }))}>移除这位专家</button>}</>}
          </fieldset>
        })}
        {consultationType === 'multidisciplinary' && requestedSpecialties.length < 5 && <button type="button" className="btn btn-secondary" onClick={() => setForm(value => ({ ...value, specialties: [...(value.specialties || [{}]), {}] }))}>添加一位专科专家</button>}
        {!resources.experts.some(item => consultationType === 'multidisciplinary' || item.linkedStaffId) && <small>暂无可用专家，请先完善专家资源。</small>}
        <label>转介原因 *<textarea className="form-input" required rows={2} maxLength={1000} value={form.reason || ''} onChange={update('reason')} /></label>
        <label>希望专科解答的问题 *<textarea className="form-input" required rows={3} maxLength={5000} value={form.questionList || ''} onChange={update('questionList')} /></label>
        <fieldset style={{ border: '1px solid #DCE9E2', borderRadius: 8 }}>
          <legend>授权专科查看的本次报告 *</legend>
          {availableReports.length > 0 && <><input className="form-input" type="search" aria-label="搜索本次报告" placeholder="搜索报告名称或检查日期" value={reportQuery} onChange={event => setReportQuery(event.target.value)} />
            <small style={{ display: 'block', margin: '6px 0' }}>匹配 {visibleReports.length} 份 · 已选 {(form.reportIds || []).length} 份</small></>}
          {visibleReports.length ? visibleReports.map(report => <label key={report._id} style={{ display: 'block', margin: '6px 0' }}>
            <input type="checkbox" checked={(form.reportIds || []).includes(String(report._id))}
              onChange={event => setForm(value => ({ ...value, reportIds: event.target.checked
                ? [...(value.reportIds || []), String(report._id)]
                : (value.reportIds || []).filter(id => id !== String(report._id)) }))} />
            {' '}{report.title || '未命名报告'}{report.checkDate || report.date ? ` · ${String(report.checkDate || report.date).slice(0, 10)}` : ''}
          </label>) : <span>{availableReports.length ? '没有匹配的报告，请调整搜索词。' : '暂无可选报告，请先在客户档案上传并审核本次报告。'}</span>}
        </fieldset>
        <label>补充说明<textarea className="form-input" rows={2} maxLength={5000} value={form.content || ''} onChange={update('content')} /></label>
      </>}
      {stage === 'booking' && <>
        {plan.consultationType === 'multidisciplinary' && bookingSpecialties.length === 1 && <small>先确认牵头科室接入；其他会诊专家由院方接收账号在原转介中组织并填写。</small>}
        {bookingSpecialties.map((row, index) => <fieldset key={index} style={{ border: '1px solid #DCE9E2', borderRadius: 8, display: 'grid', gap: 8 }}>
          <legend>{row.hospital} · {row.campus} · {row.department} · {row.expert}</legend>
          <small>顾问预计：{date(row.expectedAt)} · {methods[row.method] || row.method}</small>
          <label>实际预约日期 *<DateField className="form-input" type="date" value={form.bookings?.[index]?.actualDate || ''} onChange={updateBooking(index, 'actualDate')} /></label>
          <label>实际预约时间 *<input className="form-input" type="time" value={form.bookings?.[index]?.actualTime || ''} onChange={updateBooking(index, 'actualTime')} /></label>
          <label>预约结果及接入／门诊安排 *<textarea className="form-input" rows={3} maxLength={2000} value={form.bookings?.[index]?.appointmentNote || ''} onChange={updateBooking(index, 'appointmentNote')} /></label>
        </fieldset>)}
        <label>客户沟通记录 *<textarea className="form-input" required rows={3} maxLength={2000} value={form.contactNote || ''} onChange={update('contactNote')} /></label>
      </>}
      {stage === 'advisor_review' && <>
        <label>顾问审核与归档结论 *<textarea className="form-input" rows={4} maxLength={3000} value={form.archiveNote || ''} onChange={update('archiveNote')} /></label>
        {!referrals.some(row => row?.feedbackRevisionRequest?.pending) && <div style={{ display: 'grid', gap: 8, padding: 10, background: '#FFF9ED', borderRadius: 8 }}>
          {referrals.length > 1 && <label>需要补充的专家<select className="form-input" value={form.revisionReferralId || ''} onChange={update('revisionReferralId')}>
            <option value="">请选择</option>{referrals.map((row, index) => <option key={row._id} value={row._id}>{row.medicalExpertSnapshot?.name || `专家 ${index + 1}`}</option>)}
          </select></label>}
          <label>需要专科补充的内容<textarea className="form-input" rows={2} maxLength={2000} value={form.revisionNote || ''} onChange={update('revisionNote')} /></label>
          <button type="button" className="btn btn-secondary" disabled={busy || !form.revisionNote?.trim() || (referrals.length > 1 && !form.revisionReferralId)} onClick={async () => {
            setBusy(true); setError('')
            try {
              await staffAPI.requestDecisionReferralRevision(task._id, form.revisionNote, form.revisionReferralId)
              const result = await staffAPI.getDecisionReferralTask(task._id)
              setData(result.data)
              setForm(value => ({ ...value, revisionNote: '' }))
            } catch (e) { setError(e.message) }
            finally { setBusy(false) }
          }}>退回专科补充反馈</button>
        </div>}
      </>}
      {stage === 'planner_final' && <label>规划师最终验收结论 *<textarea className="form-input" required rows={3} maxLength={2000} value={form.acceptanceNote || ''} onChange={update('acceptanceNote')} /></label>}
      <button className="btn btn-primary" disabled={busy || (stage === 'advisor_review' && referrals.some(row => row?.feedbackRevisionRequest?.pending || row?.courseDraftStatus === 'pending_review'))}>{busy ? '提交中…' : ({
        intake: '确认并转健康顾问', advisor: '确认方案、发起转介并转健管预约',
        booking: '提交预约及客户沟通', advisor_review: '审核归档并转规划师验收',
        planner_final: '确认服务结束并关闭工作台任务',
      })[stage] || '提交'}</button>
    </form>}
    {data?.stage === 'specialist' && <div>
      {workflow.plan?.consultationType === 'multidisciplinary' && referrals.length === 1
        ? `等待牵头科室接收账号${workflow.plan.coordinatorName ? `（${workflow.plan.coordinatorName}）` : ''}在同一份转介中提交会诊汇总回复；回复后转健康顾问审核。`
        : `等待专科在原转介中提交报告解析回复（已回复 ${referrals.filter(row => row?.status === 'completed').length}/${referrals.length}）；全部回复后转健康顾问审核。`}
      {(staff?.role === 'specialist' || (plan.coordinatorStaffId && String(staff?._id) === String(plan.coordinatorStaffId))) && <button type="button" className="btn btn-primary btn-sm" style={{ display: 'block', marginTop: 8 }}
        onClick={() => nav('/notifications', { state: { tab: 'referrals' } })}>打开收到的转介并回复</button>}
    </div>}
    {error && <p role="alert" style={{ color: '#B42318', margin: 0 }}>{error}</p>}
  </section>
}
