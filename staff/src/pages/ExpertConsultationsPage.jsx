import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import PatientPicker from '../components/PatientPicker'

const id = value => String(value?._id || value || '')
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '待安排'
const stages = { team_assignment: '分配服务团队', intake: '健管收集资料', advisor: '顾问关联转介信', planner: '规划师确认专家', expert: '专家咨询及书面回复', reconcile: '顾问协调意见', followup: '健管拟随访计划', final_review: '顾问审核随访', completed: '已完成', cancelled: '已取消' }
const input = { width: '100%', boxSizing: 'border-box' }
const textField = (label, value, onChange, rows = 3) => <label style={{ display: 'block', margin: '10px 0' }}><b>{label}</b><textarea className="form-input" style={input} rows={rows} value={value} onChange={e => onChange(e.target.value)}/></label>

export default function ExpertConsultationsPage({ embedded = false }) {
  const { staff } = useStaff()
  const self = id(staff)
  const [rows, setRows] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [experts, setExperts] = useState([])
  const [reports, setReports] = useState([])
  const [referrals, setReferrals] = useState([])
  const [slots, setSlots] = useState([])
  const [team, setTeam] = useState([])
  const [form, setForm] = useState({})
  const [members, setMembers] = useState([{ expertId: '', slotId: '' }])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ patientId: '', type: 'single', expertCount: 2, request: '' })
  const [filter, setFilter] = useState('')
  async function create(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await staffAPI.createExpertConsultation(draft); setCreating(false); setDraft({ patientId: '', type: 'single', expertCount: 2, request: '' }); await load() }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const selected = rows.find(row => id(row) === selectedId)
  const planner = selected && (id(selected.plannerId) === self || staff?.role === 'superadmin'
    || (selected.status === 'team_assignment' && !selected.plannerId && staff?.role === 'healthPlanner'))
  const advisor = selected && (id(selected.advisorId) === self || staff?.role === 'superadmin')
  const manager = selected && (id(selected.managerId) === self || staff?.role === 'superadmin')
  const assignedExpert = selected?.members?.some(member => id(member.staffId) === self)

  async function load() {
    const result = await staffAPI.expertConsultationCases()
    setRows(result.data || [])
    return result.data || []
  }
  useEffect(() => {
    load().then(items => {
      const requestedId = new URLSearchParams(window.location.search).get('caseId')
      const requested = items.find(item => id(item) === requestedId)
      if (requested) choose(requested)
    }).catch(e => setError(e.message))
  }, [])
  async function choose(row) {
    setSelectedId(id(row)); setError(''); setForm(row.status === 'team_assignment' && !row.plannerId ? { plannerId: self } : {})
    setReferrals([])
    try { const result = await staffAPI.expertConsultationMaterials(id(row)); setReports(result.data || []) }
    catch (e) { setError(e.message); setReports([]) }
    setMembers(Array.from({ length: row.type === 'mdt' ? Number(/^([2-8])位专家/.exec(row.specificationLabel || '')?.[1] || 2) : 1 }, () => ({ expertId: '', slotId: '' })))
    if (row.status === 'team_assignment') {
      try { const now = new Date(); const result = await staffAPI.teamAvailability({ start: now.toISOString(), end: new Date(+now + 7 * 86400000).toISOString() }); setTeam(result.data?.staff || []) }
      catch (e) { setError(e.message) }
      return
    }
    if (row.status === 'advisor' && (id(row.advisorId) === self || staff?.role === 'superadmin')) {
      try { const result = await staffAPI.expertConsultationReferrals(id(row)); setReferrals(result.data || []) }
      catch (e) { setError(e.message) }
    }
    if (row.status !== 'planner') return
    try {
      const first = new Date()
      const [expertResult, slotsResult] = await Promise.all([
        staffAPI.expertConsultationExperts(),
        staffAPI.teamAvailability({ start: first.toISOString(), end: new Date(+first + 30 * 86400000).toISOString() }),
      ])
      setExperts(expertResult.data || [])
      setSlots((slotsResult.data?.slots || []).filter(slot => slot.status === 'available'))
    } catch (e) { setError(e.message) }
  }
  async function action(name, payload) {
    setBusy(true); setError('')
    try { await staffAPI.expertConsultationAction(selectedId, name, payload); await load(); setForm({}) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const set = key => value => setForm(current => ({ ...current, [key]: value }))
  const updateMember = (index, key, value) => setMembers(current => current.map((member, i) => i === index ? { ...member, [key]: value, ...(key === 'expertId' ? { slotId: '' } : {}) } : member))
  const slotOptions = staffId => slots.filter(slot => id(slot.staffId) === id(staffId) && (+new Date(slot.endAt) - +new Date(slot.startAt)) >= 15 * 60000 && (+new Date(slot.endAt) - +new Date(slot.startAt)) <= 30 * 60000)
  return <div className="page-container" style={{ maxWidth: 1100 }}>
    {!embedded && <h1>专家咨询与 MDT</h1>}
    <p>健管收集资料 → 顾问关联客户已有转介 → 规划师按专家库和空档派发 → 专家书面回复 → 顾问协调 → 随访审核。</p>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <select className="form-input" aria-label="咨询类型" value={filter} onChange={e => setFilter(e.target.value)}><option value="">全部咨询</option><option value="single">专家咨询</option><option value="mdt">MDT</option></select>
      {['healthManager', 'familyDoctor', 'healthPlanner', 'superadmin'].includes(staff?.role) && <button className="btn btn-primary" onClick={() => setCreating(!creating)}>＋ 医护端发起</button>}
    </div>
    {creating && <form className="card" style={{ padding: 20, marginBottom: 20 }} onSubmit={create}>
      <h3>发起专家咨询 / MDT</h3><PatientPicker value={draft.patientId} onChange={patientId => setDraft({ ...draft, patientId })} />
      <label>咨询类型<select className="form-input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="single">单次专家咨询</option><option value="mdt">MDT 多学科咨询</option></select></label>
      {draft.type === 'mdt' && <label>专家人数<select className="form-input" value={draft.expertCount} onChange={e => setDraft({ ...draft, expertCount: Number(e.target.value) })}><option value={2}>2 位</option><option value={3}>3 位</option></select></label>}
      {textField('本次咨询问题', draft.request, request => setDraft({ ...draft, request }))}
      <p>医护端发起会登记为独立服务事项，不自动产生收费订单。</p>
      <button className="btn btn-primary" disabled={busy || !draft.patientId || !draft.request.trim()}>提交发起</button>
    </form>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px,1fr) minmax(420px,2fr)', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}><h3>咨询事项</h3>
        {rows.length === 0 && <p>暂无待处理咨询</p>}
        {rows.filter(row => !filter || row.type === filter).map(row => <button key={id(row)} onClick={() => choose(row)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 10, marginBottom: 8, background: id(row) === selectedId ? '#EFF7F2' : 'white', border: '1px solid #DDE8E1', borderRadius: 8, cursor: 'pointer' }}>
          <b>{row.patientId?.name || '客户'} · {row.type === 'mdt' ? 'MDT 多学科' : '单次专家'}咨询</b> · {stages[row.status]}<br/><small>{row.initiationSource === 'staff' ? '医护端发起' : `线上订单 ${id(row.orderId).slice(-8)}`}</small>
        </button>)}
      </div>
      <div className="card" style={{ padding: 18 }}>
        {!selected ? <p>选择一笔服务查看进度。</p> : <>
          <h3>{selected.type === 'mdt' ? 'MDT 多学科' : '单次专家'}咨询 · {stages[selected.status]}</h3>
          <p>客户需求：{selected.clientRequest}</p>
          <p><a href={`/patients/${id(selected.patientId)}`}>查看客户档案与已上传报告</a></p>
          {selected.desiredExpertId && <p>客户指定专家编号：{id(selected.desiredExpertId)}</p>}
          {selected.materialSummary && <p>资料摘要：{selected.materialSummary}</p>}
          {selected.referralId ? <div style={{ background: '#F5F8F6', padding: 12, borderRadius: 8 }}><b>关联的转介信</b><p>原因：{selected.referralId.reason}</p><p>目的：{selected.referralId.referralPurpose || '未单独填写'}</p><p>问题：{selected.referralId.questionList || '见转介说明'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{selected.referralId.content}</p><a href={`/patients/${id(selected.patientId)}?tab=referrals`}>查看原转介记录</a></div> : selected.referralPurpose && <div style={{ background: '#F5F8F6', padding: 12, borderRadius: 8 }}><b>历史咨询转介内容</b><p>目的：{selected.referralPurpose}</p><p>问题：{selected.referralQuestions}</p><p>背景：{selected.referralContext}</p></div>}
          {selected.members?.map((member, index) => <div key={index} style={{ borderTop: '1px solid #E1EAE6', marginTop: 12, paddingTop: 8 }}>
            <b>专家 {index + 1}</b> · {time(member.startAt)} 至 {time(member.endAt)} · {member.repliedAt ? '已回复' : '待回复'}
            {member.opinion && <p>分析：{member.opinion}<br/>下一步：{member.nextStep}{member.noBetterOption && '（暂无更好方案）'}</p>}
          </div>)}
          {selected.meetingUrl && <p>会议链接：<a href={selected.meetingUrl} target="_blank" rel="noreferrer">进入会议</a></p>}
          {['expert', 'reconcile'].includes(selected.status) && planner && <div style={{ margin: '12px 0' }}><label>会议链接（人工创建后填写）<input className="form-input" style={input} value={form.meetingUrl ?? selected.meetingUrl ?? ''} onChange={e => set('meetingUrl')(e.target.value)}/></label><button className="btn btn-secondary" disabled={busy} onClick={() => action('meeting', { meetingUrl: form.meetingUrl ?? selected.meetingUrl })}>保存会议链接</button></div>}
          {selected.reconciliation && <p>顾问协调结论：{selected.reconciliation}</p>}
          {selected.followupPlan && <p>随访计划：{selected.followupPlan}</p>}

          {selected.status === 'team_assignment' && planner && <div><h4>分配服务团队</h4>{[['managerId', 'healthManager', '健管专员'], ['advisorId', 'familyDoctor', '健康顾问'], ['plannerId', 'healthPlanner', '健康规划师']].map(([field, role, label]) => <label key={field} style={{ display: 'block', margin: '10px 0' }}>{label}<select className="form-input" value={form[field] || id(selected[field])} onChange={e => set(field)(e.target.value)}><option value="">请选择</option>{team.filter(person => person.role === role).map(person => <option key={id(person)} value={id(person)}>{person.name}</option>)}</select></label>)}<button className="btn btn-primary" disabled={busy} onClick={() => action('team', form)}>确认团队并开始收集资料</button></div>}

          {selected.status === 'intake' && manager && <div><h4>收集资料</h4>{textField('已核实资料及待补事项', form.summary || '', set('summary'))}<b>关联客户已有报告</b>{reports.map(report => <label key={id(report)} style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={(form.reportIds || []).includes(id(report))} onChange={e => set('reportIds')(e.target.checked ? [...(form.reportIds || []), id(report)] : (form.reportIds || []).filter(value => value !== id(report)))} /> {report.title || '未命名报告'} {report.checkDate ? time(report.checkDate) : ''}</label>)}<button className="btn btn-primary" disabled={busy} onClick={() => action('intake', { summary: form.summary, reportIds: form.reportIds || [] })}>提交给健康顾问</button></div>}
          {!!selected.materialReportIds?.length && <p>本次关联报告：{reports.filter(report => selected.materialReportIds.some(value => id(value) === id(report))).map(report => report.title || '未命名报告').join('、')}</p>}
          {selected.status === 'advisor' && advisor && <div><h4>关联已有转介信</h4><p>请在客户档案的“转介”入口撰写正式转介信。这里直接引用原记录，不再另写一份。转介所选专家须已开通本咨询类型、有效医护账号和报价。</p><p><a href={`/patients/${id(selected.patientId)}?tab=referrals`}>打开客户转介记录并发起转介</a></p><label>选择本次转介<select className="form-input" value={form.referralId || ''} onChange={e => set('referralId')(e.target.value)}><option value="">请选择可履约的外部医疗转介</option>{referrals.map(referral => <option key={id(referral)} value={id(referral)}>{referral.reason} · {referral.medicalExpertSnapshot?.name || '专家'} · {new Date(referral.createdAt).toLocaleDateString('zh-CN')}</option>)}</select></label>{!referrals.length && <p>暂无可关联的转介。创建后返回这里，重新打开本咨询事项即可刷新列表。</p>}{form.referralId && (() => { const referral = referrals.find(item => id(item) === form.referralId); return referral && <div style={{ padding: 10, background: '#F5F8F6', whiteSpace: 'pre-wrap' }}>目的：{referral.referralPurpose || '未单独填写'}<br/>问题：{referral.questionList || '见转介说明'}<br/>{referral.content}</div> })()}<button className="btn btn-primary" disabled={busy || !form.referralId} onClick={() => action('referral', { referralId: form.referralId })}>关联转介并提交规划师</button></div>}
          {selected.status === 'planner' && planner && <div><h4>根据专家库与排班确认人员</h4><p>每位专家本次占用约 15–20 分钟；单次咨询须安排健管专员，MDT 须安排健康顾问覆盖会诊时段。没有空档请先到“我的排班”维护。</p>
            {members.map((member, index) => { const expert = experts.find(x => id(x) === member.expertId); return <div key={index} style={{ padding: 10, border: '1px solid #E1EAE6', borderRadius: 8, marginBottom: 8 }}>
              <label>专家 {index + 1} <select className="form-input" value={member.expertId} onChange={e => updateMember(index, 'expertId', e.target.value)}><option value="">请选择专家库人员</option>{experts.filter(x => { const fee = x[selected.type === 'mdt' ? 'mdtFee' : 'singleConsultationFee']; return x.serviceModes?.includes(selected.type === 'mdt' ? 'mdt' : 'single_consultation') && fee != null && Number(fee) <= 200 }).map(x => <option key={id(x)} value={id(x)}>{x.name} · {x.title}</option>)}</select></label>
              <label>空档 <select className="form-input" value={member.slotId} onChange={e => updateMember(index, 'slotId', e.target.value)}><option value="">请选择</option>{slotOptions(expert?.linkedStaffId).map(slot => <option key={id(slot)} value={id(slot)}>{time(slot.startAt)} 至 {time(slot.endAt)}</option>)}</select></label>
            </div> })}
            {selected.type === 'mdt' && <label style={{ display: 'block', margin: '10px 0' }}>健康顾问空档 <select className="form-input" value={form.advisorSlotId || ''} onChange={e => set('advisorSlotId')(e.target.value)}><option value="">请选择覆盖全程的空档</option>{slots.filter(slot => id(slot.staffId) === id(selected.advisorId)).map(slot => <option key={id(slot)} value={id(slot)}>{time(slot.startAt)} 至 {time(slot.endAt)}</option>)}</select></label>}
            {selected.type === 'single' && <label style={{ display: 'block', margin: '10px 0' }}>健管专员空档 <select className="form-input" value={form.managerSlotId || ''} onChange={e => set('managerSlotId')(e.target.value)}><option value="">请选择覆盖专家时段的空档</option>{slots.filter(slot => id(slot.staffId) === id(selected.managerId)).map(slot => <option key={id(slot)} value={id(slot)}>{time(slot.startAt)} 至 {time(slot.endAt)}</option>)}</select></label>}
            <label style={{ display: 'block', margin: '10px 0' }}>会议链接（可稍后接入腾讯会议）<input className="form-input" style={input} value={form.meetingUrl || ''} onChange={e => set('meetingUrl')(e.target.value)}/></label>
            <button className="btn btn-primary" disabled={busy} onClick={() => action('assign', { ...form, members })}>确认并推送转介信</button>
          </div>}
          {selected.status === 'expert' && assignedExpert && <div><h4>回复转介信</h4>{textField('分析依据与专业意见', form.opinion || '', set('opinion'))}{textField('明确的下一步或无更好方案的说明', form.nextStep || '', set('nextStep'))}<label><input type="checkbox" checked={!!form.noBetterOption} onChange={e => set('noBetterOption')(e.target.checked)}/> 暂无更合适方案</label><br/><button className="btn btn-primary" disabled={busy} onClick={() => action('reply', form)}>提交书面回复</button></div>}
          {selected.status === 'reconcile' && advisor && <div><h4>协调多专科意见</h4>{textField('一致点、矛盾和明确管理路径', form.note || '', set('note'))}<button className="btn btn-secondary" disabled={busy} onClick={() => action('reconcile', { note: form.note, requestChanges: true })}>存在矛盾，退回专家补充</button> <button className="btn btn-primary" disabled={busy} onClick={() => action('reconcile', { note: form.note })}>确认协调结论</button></div>}
          {selected.status === 'followup' && manager && <div><h4>拟定随访计划</h4>{textField('管理路径和随访安排', form.plan || '', set('plan'))}<label><input type="checkbox" checked={!!form.selfManaged} onChange={e => set('selfManaged')(e.target.checked)}/> 客户自行管理</label><br/><button className="btn btn-primary" disabled={busy} onClick={() => action('followup', form)}>提交健康顾问审核</button></div>}
          {selected.status === 'final_review' && advisor && <button className="btn btn-primary" disabled={busy} onClick={() => action('complete', {})}>审核随访计划并结束服务</button>}
        </>}
      </div>
    </div>
  </div>
}
