import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const statusText = { invited: '待填写', submitted: '待审核', approved: '已入库', rejected: '未通过', revoked: '已撤销' }
const verdictText = { pass: '通过', pending: '待核实', fail: '不通过' }
const emptyScreen = { qualificationVerified: false, professional: 'pending', communication: 'pending', ethics: 'pending', evidence: '' }
const emptyApproval = { institutionId: '', departmentId: '', linkedStaffId: '', singleFee: '', mdtFee: '', note: '' }
const id = item => String(item?._id || item || '')
const same = (left, right) => String(left || '').replace(/\s+/g, '') === String(right || '').replace(/\s+/g, '') && Boolean(String(left || '').trim())
function autoMatch(row, resources, staff) {
  const response = row.response || {}
  const institutions = (resources.institutions || []).filter(x => x.status === 'active' && [x.name, ...(x.aliases || [])].some(name => same(name, response.institutionName)))
  const institution = institutions.length === 1 ? institutions[0] : null
  const departments = (resources.departments || []).filter(x => x.status === 'active' && id(x.institutionId) === id(institution) && same(x.name, response.departmentName))
  const department = departments.length === 1 ? departments[0] : null
  const accounts = staff.filter(x => ['specialist', 'familyDoctor', 'nutritionist', 'rehabSpecialist', 'psychologist', 'tcmDoctor'].includes(x.role) && x.staffStatus !== 'inactive' && same(x.name, response.name) && x.phone === response.phone)
  const account = accounts.length === 1 ? accounts[0] : null
  return { institutionId: id(institution), departmentId: id(department), linkedStaffId: id(account) }
}

export default function ExpertRecruitmentPage() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [links, setLinks] = useState([])
  const [resources, setResources] = useState({ institutions: [], departments: [] })
  const [staff, setStaff] = useState([])
  const [invite, setInvite] = useState({ partnerName: '', specialtyTeam: '' })
  const [invitationUrl, setInvitationUrl] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [screening, setScreening] = useState(emptyScreen)
  const [approval, setApproval] = useState(emptyApproval)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = rows.find(row => id(row) === selectedId)
  const screeningSaved = Boolean(selected?.screening?.reviewedAt) && ['qualificationVerified', 'professional', 'communication', 'ethics', 'evidence'].every(key => String(selected.screening[key] ?? '').trim() === String(screening[key] ?? '').trim())
  const screeningPassed = screeningSaved && screening.qualificationVerified && ['professional', 'communication', 'ethics'].every(key => screening[key] === 'pass')
  const scopeMatches = !selected?.response?.registrationScope || same(selected.response.registrationScope, selected.response.departmentName)
  const matchingComplete = Boolean(approval.institutionId && approval.departmentId && approval.linkedStaffId && scopeMatches)

  async function load() {
    const [recruitments, activeLinks, medical, employees] = await Promise.all([
      adminAPI.expertRecruitments(), adminAPI.expertRecruitmentLinks(), adminAPI.medicalResources(), adminAPI.employees({ limit: 500 }),
    ])
    setRows(recruitments.data || [])
    setLinks(activeLinks.data || [])
    setResources(medical.data || { institutions: [], departments: [] })
    setStaff(employees.data || [])
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [])
  function choose(row) {
    setSelectedId(id(row))
    setScreening({ ...emptyScreen, ...(row.screening || {}) })
    setApproval({ ...emptyApproval,
      singleFee: row.agreement?.singleFee ?? row.response?.singleExpectedFee ?? '',
      mdtFee: row.agreement?.mdtFee ?? row.response?.mdtExpectedFee ?? '',
      ...autoMatch(row, resources, staff),
    })
    setError('')
  }
  async function run(action, success) {
    setBusy(true); setError('')
    try { await action(); await load(); toast(success) }
    catch (e) { setError(e.message); toast(e.message, 5000) }
    finally { setBusy(false) }
  }
  async function createInvite(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const response = await adminAPI.createExpertRecruitmentLink(invite)
      setInvitationUrl(`${window.location.origin}/expert-questionnaire/${response.data.token}`)
      setInvite({ partnerName: '', specialtyTeam: '' })
      await load(); toast('问卷链接已生成')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function copy(url) {
    try { await navigator.clipboard.writeText(url); toast('链接已复制，可转发给专家') }
    catch { setError('复制失败，请手动复制链接') }
  }
  const setScreen = key => e => { setError(''); setScreening(current => ({ ...current, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }
  const setApprove = key => e => { setError(''); setApproval(current => ({ ...current, [key]: e.target.value })) }
  return <div>
    <div className="page-header"><div><div className="page-title">专家招募与问卷</div><div className="page-subtitle">专科合伙人初筛意向；专家本人填写报价和空档；审核通过后进入可派单专家库。</div></div></div>
    {error && <div role="alert" style={{ color: '#B42318', marginBottom: 14 }}>{error}</div>}
    <div className="card" style={{ padding: 20, marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>生成问卷链接</h3>
      <p style={{ color: '#60786D' }}>按专科团队生成链接，合伙人复制后发给专家。每位专家分别填写，后台逐份查收；链接可随时复制或停用。</p>
      <form onSubmit={createInvite} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <Field label="专科合伙人 *"><input className="form-input" required value={invite.partnerName} onChange={e => setInvite({ ...invite, partnerName: e.target.value })}/></Field>
        <Field label="专科团队 *"><input className="form-input" required value={invite.specialtyTeam} onChange={e => setInvite({ ...invite, specialtyTeam: e.target.value })}/></Field>
        <button className="btn btn-primary" disabled={busy}>生成问卷链接</button>
      </form>
      {invitationUrl && <div style={{ marginTop: 14, padding: 12, background: '#EFF8F3', borderRadius: 8 }}><div>新链接已生成，复制后可发给同一专科团队的多位专家。</div><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input className="form-input" readOnly value={invitationUrl} aria-label="问卷链接" style={{ flex: 1 }}/><button className="btn btn-secondary" onClick={() => copy(invitationUrl)}>复制链接</button></div></div>}
      <h4>已生成的团队链接</h4>
      {links.length === 0 && <p>暂无团队链接</p>}
      {links.map(link => <div key={id(link)} style={{ borderTop: '1px solid #E6EEE9', padding: '10px 0' }}><strong>{link.specialtyTeam}</strong> · 合伙人 {link.partnerName} · {link.status === 'active' ? '可填写' : '已停用'}{link.status === 'active' && <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}><input className="form-input" style={{ flex: 1, minWidth: 260 }} readOnly value={`${window.location.origin}/expert-questionnaire/${link.token}`}/><button className="btn btn-secondary" onClick={() => copy(`${window.location.origin}/expert-questionnaire/${link.token}`)}>复制链接</button><button className="btn btn-secondary" disabled={busy} onClick={() => { if (window.confirm('停用后，已转发的链接将不能再提交。确定停用？')) run(() => adminAPI.revokeExpertRecruitmentLink(id(link)), '链接已停用') }}>停用</button></div>}</div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(420px, 2fr)', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ padding: 15 }}><h3 style={{ marginTop: 0 }}>邀请与提交记录</h3>
        {rows.length === 0 && <p>暂无邀请记录</p>}
        {rows.map(row => <button key={id(row)} onClick={() => choose(row)} style={{ width: '100%', textAlign: 'left', border: id(row) === selectedId ? '2px solid #23745B' : '1px solid #DDE7E2', borderRadius: 8, background: 'white', padding: 12, marginBottom: 8, cursor: 'pointer' }}>
          <strong>{row.response?.name || row.candidateName || '未填姓名'}</strong> <span style={{ float: 'right' }}>{statusText[row.status]}</span><div style={{ color: '#60786D', marginTop: 5 }}>{row.specialtyTeam} · 合伙人 {row.partnerName}</div>
        </button>)}
      </div>
      <div className="card" style={{ padding: 20 }}>
        {!selected ? <p>选择一份记录查看问卷与审核信息。</p> : <>
          <h3 style={{ marginTop: 0 }}>{selected.response?.name || selected.candidateName || '专家邀请'} · {statusText[selected.status]}</h3>
          {selected.status === 'invited' ? <p>等待专家本人填写。链接过期后需重新发起邀请。</p> : <>
            <h4>专家提交的信息</h4>
            <Info label="联系方式" value={selected.response?.phone}/><Info label="机构 / 科室" value={`${selected.response?.institutionName || '—'} / ${selected.response?.departmentName || '—'}`}/>
            <Info label="专业 / 职称 / 年限" value={`${selected.response?.profession || '—'} / ${selected.response?.title || '—'} / ${selected.response?.experienceYears ?? '—'} 年`}/>
            <Info label="执业范围" value={selected.response?.registrationScope}/><Info label="擅长" value={selected.response?.expertise?.join('、')}/><Info label="不适合承接" value={selected.response?.unsuitableTopics}/>
            <Info label="合作意向" value={[selected.response?.singleConsultation && '单次咨询', selected.response?.mdt && 'MDT', selected.response?.mdtLead && 'MDT 牵头'].filter(Boolean).join('、')}/>
            <Info label="单次咨询预期报酬" value={selected.response?.singleConsultation ? `${selected.response.singleExpectedFee} 元/次` : '不参与'}/>
            <Info label="MDT 预期报酬" value={selected.response?.mdt ? `${selected.response.mdtExpectedFee} 元/次` : '不参与'}/>
            <Info label="报价口径" value={{ pre_tax: '税前', after_tax: '税后', undecided: '待商谈' }[selected.response?.feeTaxBasis] || '待商谈'}/>
            <Info label="额外收费说明" value={selected.response?.extraFeeRule}/>
            <Info label="可安排时间" value={selected.response?.weeklyAvailability}/><Info label="周容量 / 提前派单" value={`${selected.response?.weeklyCapacity ?? '—'} 单 / ${selected.response?.minimumNoticeHours ?? '—'} 小时`}/>
            <Info label="排班维护 / 录制意向" value={`${selected.response?.scheduleMaintenance || '—'} / ${selected.response?.recordingPreference || '—'}`}/>
            <Info label="其他条件" value={selected.response?.cooperationNotes}/>
            <h4>准入核验</h4>
            {selected.status === 'submitted' ? <>
              <label style={{ display: 'block', marginBottom: 10 }}><input type="checkbox" checked={screening.qualificationVerified} onChange={setScreen('qualificationVerified')}/> 已核验执业资格、机构与服务范围</label>
              {['professional', 'communication', 'ethics'].map((key, i) => <Field key={key} label={['专业能力', '沟通能力', '品德与边界'][i]}><select className="form-input" value={screening[key]} onChange={setScreen(key)}>{['pending', 'pass', 'fail'].map(value => <option value={value} key={value}>{verdictText[value]}</option>)}</select></Field>)}
              <Field label="核验依据与备注"><textarea className="form-input" rows={3} maxLength={2000} value={screening.evidence} onChange={setScreen('evidence')}/></Field>
              <button className="btn btn-primary" disabled={busy || screeningSaved} onClick={() => run(() => adminAPI.screenExpertRecruitment(selectedId, screening), '准入核验已保存')}>{busy ? '处理中…' : screeningSaved ? '核验已保存' : '保存核验'}</button>
              <p role="status" style={{ color: screeningSaved ? '#246B4D' : '#9A6700', marginTop: 8 }}>{screeningSaved ? '核验已保存。' : '当前核验尚未保存，请先点击上方按钮。'}</p>
              <h4>合作条件与入库</h4>
              <p style={{ color: '#60786D' }}>医院、科室按问卷填写的名称与资源库匹配；医护端账号按姓名和手机号匹配。匹配成功后直接确认，无需逐项筛选。</p>
              <Info label="医院自动匹配" value={approval.institutionId ? (resources.institutions || []).find(x => id(x) === approval.institutionId)?.name : '未匹配，请核实问卷中的机构名称及医疗资源库'}/>
              <Info label="科室自动匹配" value={approval.departmentId ? (resources.departments || []).find(x => id(x) === approval.departmentId)?.name : '未匹配，请核实问卷中的科室及医院下的科室库'}/>
              <Info label="专家账号自动匹配" value={approval.linkedStaffId ? staff.find(x => id(x) === approval.linkedStaffId)?.name : '未匹配，请核实医护端账号的姓名和手机号'}/>
              {!scopeMatches && <p role="alert" style={{ color: '#B42318', marginTop: 8 }}>问卷的执业范围与填写科室不一致，请先核实，不能自动入库。</p>}
              {!matchingComplete && <p style={{ color: '#9A6700' }}>资料或资源不匹配时，请先核实原始问卷及基础设置中的机构、科室、人员资料，再刷新本页。系统不会代选其他医院或科室。</p>}
              <Field label="单次咨询每单报酬  元"><input className="form-input" type="number" min="0" value={approval.singleFee} onChange={setApprove('singleFee')}/></Field>
              <Field label="MDT 每单报酬  元"><input className="form-input" type="number" min="0" value={approval.mdtFee} onChange={setApprove('mdtFee')}/></Field>
              <Field label="谈妥条件备注"><textarea className="form-input" rows={2} value={approval.note} onChange={setApprove('note')}/></Field>
              {error && <p role="alert" style={{ color: '#B42318', marginTop: 10 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-primary" disabled={busy || !screeningPassed || !matchingComplete} onClick={() => run(() => adminAPI.approveExpertRecruitment(selectedId, approval), '专家已入库')}>确认入库</button><button className="btn btn-secondary" disabled={busy} onClick={() => { const reason = window.prompt('请填写未通过的原因'); if (reason?.trim()) run(() => adminAPI.rejectExpertRecruitment(selectedId, reason), '已记录未通过') }}>未通过</button></div>
            </> : <><Info label="资格核验" value={selected.screening?.qualificationVerified ? '已核验' : '未核验'}/>{['professional', 'communication', 'ethics'].map((key, i) => <Info key={key} label={['专业', '沟通', '品德'][i]} value={verdictText[selected.screening?.[key]] || '—'}/>)}<Info label="审核依据" value={selected.screening?.evidence}/>{selected.expertProfileId && <Info label="专家库编号" value={id(selected.expertProfileId)}/>}</>}
          </>}
        </>}
      </div>
    </div>
  </div>
}

function Field({ label, children }) { return <label style={{ display: 'block', minWidth: 180, margin: '8px 0' }}><span style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>{label}</span>{children}</label> }
function Info({ label, value }) { return <div style={{ display: 'grid', gridTemplateColumns: '145px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid #EEF2EF', overflowWrap: 'anywhere' }}><span style={{ color: '#60786D' }}>{label}</span><span>{value || '—'}</span></div> }
