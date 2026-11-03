import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import PatientPicker from '../components/PatientPicker'

const id = value => String(value?._id || value || '')
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '待安排'
const stages = { team_assignment: '规划师首次派单', intake: '健管收集资料', advisor: '顾问审核并确认专家', planner: '健管专员安排预约', expert: '专家咨询及书面回复', reconcile: '顾问协调意见', followup: '健管拟随访计划', final_review: '顾问审核随访', completed: '已完成', cancelled: '已取消' }
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
  const [editingRequest, setEditingRequest] = useState(false)
  const [requestDraft, setRequestDraft] = useState('')
  const [activeStatusCard, setActiveStatusCard] = useState('')
  const [showReferralChange, setShowReferralChange] = useState(false)
  const [members, setMembers] = useState([{ expertId: '', slotId: '' }])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ patientId: '', type: 'single', expertCount: 2, request: '' })
  const [filter, setFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const needsMe = row => {
    if (staff?.role === 'superadmin') return !['completed', 'cancelled'].includes(row.status)
    if (row.status === 'team_assignment') return id(row.plannerId) === self || (!row.plannerId && staff?.role === 'healthPlanner')
    if (['intake', 'followup'].includes(row.status)) return id(row.managerId) === self
    if (row.status === 'planner') return row.expertsConfirmedAt ? id(row.managerId) === self : id(row.advisorId) === self
    if (['advisor', 'reconcile', 'final_review'].includes(row.status)) return id(row.advisorId) === self
    return row.status === 'expert' && row.members?.some(member => id(member.staffId) === self && !member.repliedAt)
  }
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
    setSelectedId(id(row)); setError(''); setEditingRequest(false); setRequestDraft(row.clientRequest || ''); setShowReferralChange(false); setActiveStatusCard('')
    setForm(row.status === 'team_assignment' && !row.plannerId ? { plannerId: self } : row.referralId ? { referralId: id(row.referralId) } : {})
    setReferrals([]); setExperts([]); setSlots([])
    try { const result = await staffAPI.expertConsultationMaterials(id(row)); setReports(result.data || []) }
    catch (e) { setError(e.message); setReports([]) }
    setMembers(Array.from({ length: row.type === 'mdt' ? Number(/^([2-8])位专家/.exec(row.specificationLabel || '')?.[1] || 2) : 1 }, (_, index) => ({ expertId: id(row.confirmedExpertIds?.[index]) || id(row.plannedExpertIds?.[index]) || (index === 0 ? id(row.referralId?.medicalExpertId) : ''), slotId: '' })))
    if (row.status === 'team_assignment') {
      try { const now = new Date(); const result = await staffAPI.teamAvailability({ start: now.toISOString(), end: new Date(+now + 7 * 86400000).toISOString() }); setTeam(result.data?.staff || []) }
      catch (e) { setError(e.message) }
      return
    }
    if (['advisor', 'planner'].includes(row.status) && (id(row.advisorId) === self || staff?.role === 'superadmin')) {
      try { const result = await staffAPI.expertConsultationReferrals(id(row)); setReferrals(result.data || []) }
      catch (e) { setError(e.message) }
    }
    if (!['advisor', 'planner'].includes(row.status) || !([id(row.managerId), id(row.advisorId)].includes(self) || staff?.role === 'superadmin')) return
    try {
      const first = new Date()
      const [expertResult, slotsResult] = await Promise.all([
        staffAPI.expertConsultationCaseExperts(id(row)),
        staffAPI.teamAvailability({ start: first.toISOString(), end: new Date(+first + 30 * 86400000).toISOString() }),
      ])
      setExperts(expertResult.data || [])
      setSlots((slotsResult.data?.slots || []).filter(slot => slot.status === 'available'))
    } catch (e) { setError(e.message) }
  }
  async function action(name, payload) {
    setBusy(true); setError('')
    try { await staffAPI.expertConsultationAction(selectedId, name, payload); const items = await load(); const updated = items.find(row => id(row) === selectedId); if (updated) await choose(updated) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const set = key => value => setForm(current => ({ ...current, [key]: value }))
  const updateMember = (index, key, value) => setMembers(current => current.map((member, i) => i === index ? { ...member, [key]: value, ...(key === 'expertId' ? { slotId: '' } : {}) } : member))
  const slotOptions = staffId => slots.filter(slot => id(slot.staffId) === id(staffId) && (+new Date(slot.endAt) - +new Date(slot.startAt)) >= 15 * 60000 && (+new Date(slot.endAt) - +new Date(slot.startAt)) <= 30 * 60000)
  const referralPicker = <div style={{ padding: 12, border: '1px solid #DDE8E1', borderRadius: 8, margin: '12px 0' }}>
    <p>在客户档案的“转介”入口维护原转介信，这里只关联记录。所选专家须已开通本咨询类型、有效医护账号和报价。</p>
    <p><a href={`/patients/${id(selected?.patientId)}?tab=referrals&compose=referral`}>填写转介信</a></p>
    <label>本次转介<select className="form-input" value={form.referralId || ''} onChange={e => set('referralId')(e.target.value)}><option value="">请选择可履约的外部医疗转介</option>{referrals.map(referral => <option key={id(referral)} value={id(referral)}>{referral.reason} · {referral.medicalExpertSnapshot?.name || '专家'} · {new Date(referral.createdAt).toLocaleDateString('zh-CN')}</option>)}</select></label>
    {!referrals.length && <p>暂无可关联的转介。创建后返回这里，重新打开本咨询事项即可刷新列表。</p>}
    {form.referralId && (() => { const referral = referrals.find(item => id(item) === form.referralId); return referral && <div style={{ padding: 10, background: '#F5F8F6', whiteSpace: 'pre-wrap' }}>原因：{referral.reason}<br/>问题：{referral.questionList || '见转介说明'}<br/>{referral.content}</div> })()}
    <button className="btn btn-primary" disabled={busy || !form.referralId || (selected?.status === 'planner' && form.referralId === id(selected.referralId))} onClick={() => action('referral', { referralId: form.referralId })}>{selected?.status === 'planner' ? '确认更换转介' : '保存转介关联'}</button>
  </div>
  return <div className="page-container" style={{ maxWidth: 1100 }}>
    {!embedded && <h1>专家咨询与 MDT</h1>}
    <p>健管专员收集资料 → 健康顾问审核转介并确认专家 → 健管专员协调预约及推送 → 专家回复 → 顾问协调 → 随访审核。健康规划师负责商城订单首次派单与全程督导。</p>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}><label><input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)}/> 只看待我处理</label>
      <select className="form-input" aria-label="咨询类型" value={filter} onChange={e => setFilter(e.target.value)}><option value="">全部咨询</option><option value="single">专家咨询</option><option value="mdt">MDT</option></select>
      {['healthManager', 'familyDoctor', 'healthPlanner', 'superadmin'].includes(staff?.role) && <button className="btn btn-primary" onClick={() => setCreating(!creating)}>＋ 医护端发起</button>}
    </div>
    {creating && <form className="card" style={{ padding: 20, marginBottom: 20 }} onSubmit={create}>
      <h3>发起专家咨询 / MDT</h3><PatientPicker value={draft.patientId} onChange={patientId => setDraft({ ...draft, patientId })} />
      <label>咨询类型<select className="form-input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}><option value="single">单次专家咨询</option><option value="mdt">MDT 多学科咨询</option></select></label>
      {draft.type === 'mdt' && <label>专家人数<select className="form-input" value={draft.expertCount} onChange={e => setDraft({ ...draft, expertCount: Number(e.target.value) })}><option value={2}>2 位</option><option value={3}>3 位</option></select></label>}
      {textField('本次咨询问题', draft.request, request => setDraft({ ...draft, request }))}
      <p>医护端发起直接由客户所属健管专员收集资料，不再经过首次派单；不自动产生收费订单。</p>
      <button className="btn btn-primary" disabled={busy || !draft.patientId || !draft.request.trim()}>提交发起</button>
    </form>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px,1fr) minmax(420px,2fr)', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}><h3>咨询事项</h3>
        {rows.length === 0 && <p>暂无待处理咨询</p>}
        {rows.filter(row => (!filter || row.type === filter) && (!mineOnly || needsMe(row))).map(row => <button key={id(row)} onClick={() => choose(row)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 10, marginBottom: 8, background: id(row) === selectedId ? '#EFF7F2' : 'white', border: '1px solid #DDE8E1', borderRadius: 8, cursor: 'pointer' }}>
          {needsMe(row) && <small style={{ color: '#176C50' }}>待我处理 · </small>}<b>{row.patientId?.name || '客户'} · {row.type === 'mdt' ? 'MDT 多学科' : '单次专家'}咨询</b> · {stages[row.status]}<br/><small>{row.initiationSource === 'staff' ? '医护端发起' : `线上订单 ${id(row.orderId).slice(-8)}`}</small>
        </button>)}
      </div>
      <div className="card" style={{ padding: 18 }}>
        {!selected ? <p>选择一笔服务查看进度。</p> : <>
          <h3>{selected.type === 'mdt' ? 'MDT 多学科' : '单次专家'}咨询 · {stages[selected.status]}</h3>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}><p style={{ flex: 1 }}>客户需求：{selected.clientRequest}</p>{(manager || advisor) && ['team_assignment', 'intake', 'advisor', 'planner'].includes(selected.status) && <button type="button" className="btn btn-secondary btn-sm" aria-expanded={editingRequest} aria-controls="consultation-request-editor" onClick={() => { setRequestDraft(selected.clientRequest || ''); setEditingRequest(value => !value) }}>{editingRequest ? '收起修改' : '修改需求'}</button>}</div>
          {editingRequest && <div id="consultation-request-editor" style={{ padding: 12, border: '1px solid #DDE8E1', borderRadius: 8, marginBottom: 12, background: '#F5F8F6' }}><b>修改本次咨询问题</b>{textField('本次咨询问题', requestDraft, setRequestDraft)}<button type="button" className="btn btn-primary btn-sm" disabled={busy || !requestDraft.trim()} onClick={async () => { setBusy(true); setError(''); try { await staffAPI.expertConsultationAction(selectedId, 'edit', { request: requestDraft }); setEditingRequest(false); const items = await load(); const updated = items.find(row => id(row) === selectedId); if (updated) await choose(updated) } catch (e) { setError(e.message) } finally { setBusy(false) } }}>保存修改</button></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, margin: '12px 0 16px' }}>
            <button type="button" aria-expanded={activeStatusCard === 'referral'} aria-controls="consultation-referral-status" onClick={() => setActiveStatusCard(current => current === 'referral' ? '' : 'referral')} style={{ display: 'block', width: '100%', padding: 12, textAlign: 'left', cursor: 'pointer', color: 'inherit', border: '1px solid #DDE8E1', borderRadius: 8, background: selected.referralId ? '#F0F8F4' : '#FAFBFA' }}><b>转介信关联　{activeStatusCard === 'referral' ? '收起 ↑' : '查看／办理 ↓'}</b><div style={{ fontSize: 13, color: '#60776C', marginTop: 5 }}>{selected.referralId ? `已关联：${selected.referralId.reason}` : selected.status === 'intake' ? '待健管专员提交资料后，由健康顾问关联' : selected.status === 'team_assignment' ? '待首次派单和资料核实后关联' : '待健康顾问关联原转介记录'}</div></button>
            <button type="button" aria-expanded={activeStatusCard === 'expert'} aria-controls="consultation-expert-status" onClick={() => setActiveStatusCard(current => current === 'expert' ? '' : 'expert')} style={{ display: 'block', width: '100%', padding: 12, textAlign: 'left', cursor: 'pointer', color: 'inherit', border: '1px solid #DDE8E1', borderRadius: 8, background: selected.members?.length ? '#F0F8F4' : '#FAFBFA' }}><b>专家关联与排班　{activeStatusCard === 'expert' ? '收起 ↑' : '查看／办理 ↓'}</b><div style={{ fontSize: 13, color: '#60776C', marginTop: 5 }}>{selected.members?.length ? selected.members.map(member => member.expertId?.name || '已安排专家').join('、') : selected.status === 'planner' ? '当前由健管专员协调已确认专家的时间' : '由健康顾问确认专家，再由健管专员安排空档'}</div></button>
          </div>
          {activeStatusCard === 'referral' && <div id="consultation-referral-status" style={{ padding: 12, marginBottom: 14, border: '1px solid #DDE8E1', borderRadius: 8, background: '#F5F8F6' }}>
            <b>{selected.referralId ? '本次已关联原转介信' : '本次尚未关联转介信'}</b>
            <p>{selected.status === 'team_assignment' ? '商城订单先由规划师派给健管专员，再由健管专员提交资料。' : selected.status === 'intake' ? '先由负责健管专员提交已核实资料，再由健康顾问关联客户已有转介信。' : selected.status === 'advisor' ? '由负责健康顾问在下方选择客户已有转介信。' : selected.status === 'planner' ? '已进入健管专员预约阶段；健康顾问更换转介后需要重新确认专家。' : '可查看本次关联的原转介记录。'}</p>
            <a href={`/patients/${id(selected.patientId)}?tab=referrals&compose=referral`}>填写转介信 →</a>
            {selected.status === 'team_assignment' && planner && <a href="#consultation-team-actions" style={{ marginLeft: 16 }}>首次派单 →</a>}
            {selected.status === 'intake' && manager && <a href="#consultation-intake-actions" style={{ marginLeft: 16 }}>提交资料 →</a>}
            {['advisor', 'planner'].includes(selected.status) && advisor && <a href="#consultation-referral-actions" style={{ marginLeft: 16 }}>办理关联 →</a>}
          </div>}
          {activeStatusCard === 'expert' && <div id="consultation-expert-status" style={{ padding: 12, marginBottom: 14, border: '1px solid #DDE8E1', borderRadius: 8, background: '#F5F8F6' }}>
            <b>{selected.members?.length ? '本次已安排专家' : '本次尚未安排专家'}</b>
            <p>{selected.status === 'team_assignment' ? '商城订单先由规划师派给健管专员。' : selected.status === 'intake' ? '先由负责健管专员提交资料，再由健康顾问关联转介信。' : selected.status === 'advisor' ? '健康顾问关联转介信并确认专家后，由健管专员协调时间。' : selected.status === 'planner' ? '由负责健管专员在下方安排已确认专家的空档。' : selected.members?.length ? '专家和咨询时间见本页下方。' : '当前阶段没有可安排的专家空档。'}</p>
            {selected.status === 'team_assignment' && planner && <a href="#consultation-team-actions">首次派单 →</a>}
            {selected.status === 'intake' && manager && <a href="#consultation-intake-actions">提交资料 →</a>}
            {selected.status === 'advisor' && advisor && <a href="#consultation-referral-actions">先关联转介信 →</a>}
            {selected.status === 'planner' && manager && <a href="#consultation-expert-actions">选择专家和空档 →</a>}
            {!!selected.members?.length && <a href="#consultation-assigned-experts" style={{ marginLeft: selected.status === 'planner' && manager ? 16 : 0 }}>查看已安排专家 →</a>}
          </div>}
          {selected.status === 'intake' && !manager && <p style={{ color: '#60776C', fontSize: 13 }}>当前由负责健管专员核实资料并提交；之后健康顾问可关联转介信。</p>}
          <p><a href={`/patients/${id(selected.patientId)}?tab=reports`}>查看客户已上传报告</a>　<a href={`/patients/${id(selected.patientId)}`}>查看客户档案</a></p>
          {selected.desiredExpertId && <p>客户指定专家编号：{id(selected.desiredExpertId)}</p>}
          {selected.materialSummary && <p>资料摘要：{selected.materialSummary}</p>}
          {selected.referralId ? <div style={{ background: '#F5F8F6', padding: 12, borderRadius: 8 }}><b>关联的转介信</b><p>原因：{selected.referralId.reason}</p><p>问题：{selected.referralId.questionList || '见转介说明'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{selected.referralId.content}</p><a href={`/patients/${id(selected.patientId)}?tab=referrals`}>查看原转介记录</a></div> : selected.referralPurpose && <div style={{ background: '#F5F8F6', padding: 12, borderRadius: 8 }}><b>历史咨询转介内容</b><p>目的：{selected.referralPurpose}</p><p>问题：{selected.referralQuestions}</p><p>背景：{selected.referralContext}</p></div>}
          {selected.members?.map((member, index) => <div key={index} id={index === 0 ? 'consultation-assigned-experts' : undefined} style={{ borderTop: '1px solid #E1EAE6', marginTop: 12, paddingTop: 8 }}>
            <b>专家 {index + 1}</b> · {time(member.startAt)} 至 {time(member.endAt)} · {member.repliedAt ? '已回复' : '待回复'}
            {member.opinion && <p>分析：{member.opinion}<br/>下一步：{member.nextStep}{member.noBetterOption && '（暂无更好方案）'}</p>}
          </div>)}
          {selected.meetingUrl && <p>会议链接：<a href={selected.meetingUrl} target="_blank" rel="noreferrer">进入会议</a></p>}
          {['expert', 'reconcile'].includes(selected.status) && manager && <div style={{ margin: '12px 0' }}><label>会议链接（人工创建后填写）<input className="form-input" style={input} value={form.meetingUrl ?? selected.meetingUrl ?? ''} onChange={e => set('meetingUrl')(e.target.value)}/></label><button className="btn btn-secondary" disabled={busy} onClick={() => action('meeting', { meetingUrl: form.meetingUrl ?? selected.meetingUrl })}>保存会议链接</button></div>}
          {selected.reconciliation && <p>顾问协调结论：{selected.reconciliation}</p>}
          {selected.followupPlan && <p>随访计划：{selected.followupPlan}</p>}

          {selected.status === 'team_assignment' && planner && <div id="consultation-team-actions"><h4>首次派单给健管专员</h4>{[['managerId', 'healthManager', '健管专员']].map(([field, role, label]) => <label key={field} style={{ display: 'block', margin: '10px 0' }}>{label}<select className="form-input" value={form[field] || id(selected[field])} onChange={e => set(field)(e.target.value)}><option value="">请选择</option>{team.filter(person => person.role === role).map(person => <option key={id(person)} value={id(person)}>{person.name}</option>)}</select></label>)}<button className="btn btn-primary" disabled={busy} onClick={() => action('team', form)}>确认派单，由专员开始收集资料</button></div>}

          {selected.status === 'intake' && manager && <div id="consultation-intake-actions"><h4>收集资料</h4>{textField('已核实资料及待补事项', form.summary || '', set('summary'))}<b>关联客户已有报告</b>{reports.map(report => <label key={id(report)} style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={(form.reportIds || []).includes(id(report))} onChange={e => set('reportIds')(e.target.checked ? [...(form.reportIds || []), id(report)] : (form.reportIds || []).filter(value => value !== id(report)))} /> {report.title || '未命名报告'} {report.checkDate ? time(report.checkDate) : ''}</label>)}<button className="btn btn-primary" disabled={busy} onClick={() => action('intake', { summary: form.summary, reportIds: form.reportIds || [] })}>提交给健康顾问</button></div>}
          {!!selected.materialReportIds?.length && <p>本次关联报告：{reports.filter(report => selected.materialReportIds.some(value => id(value) === id(report))).map(report => report.title || '未命名报告').join('、')}</p>}
          {selected.status === 'advisor' && advisor && <div id="consultation-referral-actions"><h4>关联已有转介信</h4>{referralPicker}</div>}
          {selected.status === 'planner' && advisor && <div id="consultation-referral-actions"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReferralChange(value => !value)}>{showReferralChange ? '收起' : '更换关联转介信'}</button>{showReferralChange && referralPicker}</div>}
          {selected.status === 'planner' && manager && selected.expertsConfirmedAt && <div id="consultation-expert-actions"><h4>安排已确认专家的时间</h4><p>每位专家本次占用约 15–20 分钟；单次咨询须安排健管专员，MDT 须安排健康顾问覆盖会诊时段。没有空档请先到“我的排班”维护。</p>
            {members.map((member, index) => { const expert = experts.find(x => id(x) === member.expertId); return <div key={index} style={{ padding: 10, border: '1px solid #E1EAE6', borderRadius: 8, marginBottom: 8 }}>
              <label>专家 {index + 1} <select className="form-input" value={member.expertId} onChange={e => updateMember(index, 'expertId', e.target.value)}><option value="">请选择专家库人员</option>{experts.filter(x => { if (!selected.confirmedExpertIds?.some(value => id(value) === id(x))) return false; const fee = x[selected.type === 'mdt' ? 'mdtFee' : 'singleConsultationFee']; return x.serviceModes?.includes(selected.type === 'mdt' ? 'mdt' : 'single_consultation') && fee != null && Number(fee) <= 200 }).map(x => <option key={id(x)} value={id(x)}>{x.name} · {x.title}</option>)}</select></label>
              <label>空档 <select className="form-input" value={member.slotId} onChange={e => updateMember(index, 'slotId', e.target.value)}><option value="">请选择</option>{slotOptions(expert?.linkedStaffId).map(slot => <option key={id(slot)} value={id(slot)}>{time(slot.startAt)} 至 {time(slot.endAt)}</option>)}</select></label>
            </div> })}
            {selected.type === 'mdt' && <label style={{ display: 'block', margin: '10px 0' }}>健康顾问空档 <select className="form-input" value={form.advisorSlotId || ''} onChange={e => set('advisorSlotId')(e.target.value)}><option value="">请选择覆盖全程的空档</option>{slots.filter(slot => id(slot.staffId) === id(selected.advisorId)).map(slot => <option key={id(slot)} value={id(slot)}>{time(slot.startAt)} 至 {time(slot.endAt)}</option>)}</select></label>}
            {selected.type === 'single' && <label style={{ display: 'block', margin: '10px 0' }}>健管专员空档 <select className="form-input" value={form.managerSlotId || ''} onChange={e => set('managerSlotId')(e.target.value)}><option value="">请选择覆盖专家时段的空档</option>{slots.filter(slot => id(slot.staffId) === id(selected.managerId)).map(slot => <option key={id(slot)} value={id(slot)}>{time(slot.startAt)} 至 {time(slot.endAt)}</option>)}</select></label>}
            <label style={{ display: 'block', margin: '10px 0' }}>会议链接（可稍后接入腾讯会议）<input className="form-input" style={input} value={form.meetingUrl || ''} onChange={e => set('meetingUrl')(e.target.value)}/></label>
            <button className="btn btn-primary" disabled={busy} onClick={() => action('assign', { ...form, members })}>确认预约并推送转介信</button>
          </div>}
          {selected.expertChangeReason && <p>预约调整反馈：{selected.expertChangeReason}</p>}
          {['advisor', 'planner'].includes(selected.status) && advisor && (selected.referralId || selected.referralPurpose) && <div style={{ borderTop: '1px solid #DDE8E1', paddingTop: 12 }}>
            <h4>审核资料并确认专家</h4><p>请确认转介内容及专家专业匹配。确认后，由健管专员协调时间；更换名单会重新交给专员预约。</p>
            {members.map((member, index) => <label key={index} style={{ display: 'block', marginBottom: 10 }}>专家 {index + 1}<select className="form-input" value={member.expertId} onChange={e => updateMember(index, 'expertId', e.target.value)}><option value="">请选择专家</option>{experts.filter(x => { const fee = x[selected.type === 'mdt' ? 'mdtFee' : 'singleConsultationFee']; return x.serviceModes?.includes(selected.type === 'mdt' ? 'mdt' : 'single_consultation') && fee != null && Number(fee) <= 200 }).map(x => <option key={id(x)} value={id(x)}>{x.name} · {x.title}</option>)}</select></label>)}
            <button className="btn btn-primary" disabled={busy || members.some(x => !x.expertId)} onClick={() => action('confirm-experts', { expertIds: members.map(x => x.expertId) })}>确认专家，交健管专员安排</button>
          </div>}
          {selected.status === 'planner' && manager && <div><h4>无法安排当前专家？</h4>{!selected.expertsConfirmedAt && <p>请先由健康顾问确认专家名单。</p>}{textField('调整原因及建议', form.changeReason || '', set('changeReason'))}<button className="btn btn-secondary" disabled={busy || !form.changeReason?.trim()} onClick={() => action('request-expert-change', { reason: form.changeReason })}>退回健康顾问重新确认</button></div>}
          {selected.status === 'expert' && assignedExpert && <div><h4>回复转介信</h4>{textField('分析依据与专业意见', form.opinion || '', set('opinion'))}{textField('明确的下一步或无更好方案的说明', form.nextStep || '', set('nextStep'))}<label><input type="checkbox" checked={!!form.noBetterOption} onChange={e => set('noBetterOption')(e.target.checked)}/> 暂无更合适方案</label><br/><button className="btn btn-primary" disabled={busy} onClick={() => action('reply', form)}>提交书面回复</button></div>}
          {selected.status === 'reconcile' && advisor && <div><h4>协调多专科意见</h4>{textField('一致点、矛盾和明确管理路径', form.note || '', set('note'))}<button className="btn btn-secondary" disabled={busy} onClick={() => action('reconcile', { note: form.note, requestChanges: true })}>存在矛盾，退回专家补充</button> <button className="btn btn-primary" disabled={busy} onClick={() => action('reconcile', { note: form.note })}>确认协调结论</button></div>}
          {selected.status === 'followup' && manager && <div><h4>拟定随访计划</h4>{textField('管理路径和随访安排', form.plan || '', set('plan'))}<label><input type="checkbox" checked={!!form.selfManaged} onChange={e => set('selfManaged')(e.target.checked)}/> 客户自行管理</label><br/><button className="btn btn-primary" disabled={busy} onClick={() => action('followup', form)}>提交健康顾问审核</button></div>}
          {selected.status === 'final_review' && advisor && <button className="btn btn-primary" disabled={busy} onClick={() => action('complete', {})}>审核随访计划并结束服务</button>}
        </>}
      </div>
    </div>
  </div>
}
