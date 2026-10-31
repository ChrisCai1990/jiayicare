import React, { useEffect, useMemo, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const statusText = { invited: '待填写', submitted: '待审核', approved: '已入库', rejected: '未通过', revoked: '已撤销' }
const verdictText = { pass: '通过', pending: '待核实', fail: '不通过' }
const emptyScreen = { qualificationVerified: false, professional: 'pending', communication: 'pending', ethics: 'pending', evidence: '' }
const emptyApproval = { institutionId: '', departmentId: '', linkedStaffId: '', singleFee: '', mdtFee: '', note: '' }
const id = item => String(item?._id || item || '')

export default function ExpertRecruitmentPage() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [resources, setResources] = useState({ institutions: [], departments: [] })
  const [staff, setStaff] = useState([])
  const [invite, setInvite] = useState({ partnerName: '', specialtyTeam: '', candidateName: '' })
  const [invitationUrl, setInvitationUrl] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [screening, setScreening] = useState(emptyScreen)
  const [approval, setApproval] = useState(emptyApproval)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = rows.find(row => id(row) === selectedId)
  const departments = useMemo(() => (resources.departments || []).filter(row => id(row.institutionId) === approval.institutionId), [resources, approval.institutionId])
  const expertStaff = staff.filter(row => ['specialist', 'familyDoctor', 'nutritionist', 'rehabSpecialist', 'psychologist', 'tcmDoctor'].includes(row.role) && row.staffStatus !== 'inactive')

  async function load() {
    const [recruitments, medical, employees] = await Promise.all([
      adminAPI.expertRecruitments(), adminAPI.medicalResources(), adminAPI.employees({ limit: 500 }),
    ])
    setRows(recruitments.data || [])
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
      institutionId: id(row.agreement?.institutionId), departmentId: id(row.agreement?.departmentId),
    })
    setError('')
  }
  async function run(action, success) {
    setBusy(true); setError('')
    try { await action(); await load(); toast(success) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function createInvite(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const response = await adminAPI.createExpertRecruitment(invite)
      setInvitationUrl(`${window.location.origin}/expert-invitation/${response.data.token}`)
      setInvite({ partnerName: '', specialtyTeam: '', candidateName: '' })
      await load(); toast('邀请已建立')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(invitationUrl); toast('链接已复制') }
    catch { setError('复制失败，请手动复制链接') }
  }
  const setScreen = key => e => setScreening(current => ({ ...current, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const setApprove = key => e => setApproval(current => ({ ...current, [key]: e.target.value, ...(key === 'institutionId' ? { departmentId: '' } : {}) }))
  return <div>
    <div className="page-header"><div><div className="page-title">专家招募与问卷</div><div className="page-subtitle">专科合伙人初筛意向；专家本人填写报价和空档；审核通过后进入可派单专家库。</div></div></div>
    {error && <div role="alert" style={{ color: '#B42318', marginBottom: 14 }}>{error}</div>}
    <div className="card" style={{ padding: 20, marginBottom: 18 }}>
      <h3 style={{ marginTop: 0 }}>发起线上邀请</h3>
      <form onSubmit={createInvite} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
        <Field label="专科合伙人 *"><input className="form-input" required value={invite.partnerName} onChange={e => setInvite({ ...invite, partnerName: e.target.value })}/></Field>
        <Field label="专科团队 *"><input className="form-input" required value={invite.specialtyTeam} onChange={e => setInvite({ ...invite, specialtyTeam: e.target.value })}/></Field>
        <Field label="拟邀专家姓名"><input className="form-input" value={invite.candidateName} onChange={e => setInvite({ ...invite, candidateName: e.target.value })}/></Field>
        <button className="btn btn-primary" disabled={busy}>生成邀请链接</button>
      </form>
      {invitationUrl && <div style={{ marginTop: 14, padding: 12, background: '#EFF8F3', borderRadius: 8 }}><div>链接仅显示一次，14 天内可填写一次。请通过已核实的联系方式发给专家本人。</div><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input className="form-input" readOnly value={invitationUrl} aria-label="邀请链接" style={{ flex: 1 }}/><button className="btn btn-secondary" onClick={copy}>复制</button></div></div>}
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
            <Info label="预期报酬" value={`单次 ${selected.response?.singleExpectedFee ?? '—'} 元；MDT ${selected.response?.mdtExpectedFee ?? '—'} 元；${selected.response?.feeTaxBasis || '待商谈'}`}/>
            <Info label="报价包含" value={selected.response?.feeIncludes?.join('、')}/><Info label="额外收费规则" value={selected.response?.extraFeeRule}/>
            <Info label="阅资料 / 书面回复" value={`${selected.response?.preparationMinutes ?? '—'} 分钟 / ${selected.response?.replyHours ?? '—'} 小时`}/>
            <Info label="可安排时间" value={selected.response?.weeklyAvailability}/><Info label="周容量 / 提前派单" value={`${selected.response?.weeklyCapacity ?? '—'} 单 / ${selected.response?.minimumNoticeHours ?? '—'} 小时`}/>
            <Info label="排班维护 / 录制意向" value={`${selected.response?.scheduleMaintenance || '—'} / ${selected.response?.recordingPreference || '—'}`}/>
            <Info label="其他条件" value={selected.response?.cooperationNotes}/>
            <h4>准入核验</h4>
            {selected.status === 'submitted' ? <>
              <label style={{ display: 'block', marginBottom: 10 }}><input type="checkbox" checked={screening.qualificationVerified} onChange={setScreen('qualificationVerified')}/> 已核验执业资格、机构与服务范围</label>
              {['professional', 'communication', 'ethics'].map((key, i) => <Field key={key} label={['专业能力', '沟通能力', '品德与边界'][i]}><select className="form-input" value={screening[key]} onChange={setScreen(key)}>{['pending', 'pass', 'fail'].map(value => <option value={value} key={value}>{verdictText[value]}</option>)}</select></Field>)}
              <Field label="核验依据与备注"><textarea className="form-input" rows={3} value={screening.evidence} onChange={setScreen('evidence')}/></Field>
              <button className="btn btn-secondary" disabled={busy} onClick={() => run(() => adminAPI.screenExpertRecruitment(selectedId, screening), '准入核验已保存')}>保存核验</button>
              <h4>合作条件与入库</h4>
              <p style={{ color: '#60786D' }}>须先保存并通过三项核验。入库时确认医院、科室、专家医护端账号和谈妥的每单报酬。</p>
              <Field label="医院"><select className="form-input" value={approval.institutionId} onChange={setApprove('institutionId')}><option value="">请选择</option>{(resources.institutions || []).filter(x => x.status === 'active').map(x => <option key={id(x)} value={id(x)}>{x.name}</option>)}</select></Field>
              <Field label="科室"><select className="form-input" value={approval.departmentId} onChange={setApprove('departmentId')}><option value="">请选择</option>{departments.filter(x => x.status === 'active').map(x => <option key={id(x)} value={id(x)}>{x.name}</option>)}</select></Field>
              <Field label="关联医护端专家账号"><select className="form-input" value={approval.linkedStaffId} onChange={setApprove('linkedStaffId')}><option value="">请选择</option>{expertStaff.map(x => <option key={id(x)} value={id(x)}>{x.name || x.realName || x.username} · {x.role}</option>)}</select></Field>
              <Field label="单次咨询每单报酬  元"><input className="form-input" type="number" min="0" value={approval.singleFee} onChange={setApprove('singleFee')}/></Field>
              <Field label="MDT 每单报酬  元"><input className="form-input" type="number" min="0" value={approval.mdtFee} onChange={setApprove('mdtFee')}/></Field>
              <Field label="谈妥条件备注"><textarea className="form-input" rows={2} value={approval.note} onChange={setApprove('note')}/></Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-primary" disabled={busy} onClick={() => run(() => adminAPI.approveExpertRecruitment(selectedId, approval), '专家已入库')}>确认入库</button><button className="btn btn-secondary" disabled={busy} onClick={() => { const reason = window.prompt('请填写未通过的原因'); if (reason?.trim()) run(() => adminAPI.rejectExpertRecruitment(selectedId, reason), '已记录未通过') }}>未通过</button></div>
            </> : <><Info label="资格核验" value={selected.screening?.qualificationVerified ? '已核验' : '未核验'}/>{['professional', 'communication', 'ethics'].map((key, i) => <Info key={key} label={['专业', '沟通', '品德'][i]} value={verdictText[selected.screening?.[key]] || '—'}/>)}<Info label="审核依据" value={selected.screening?.evidence}/>{selected.expertProfileId && <Info label="专家库编号" value={id(selected.expertProfileId)}/>}</>}
          </>}
        </>}
      </div>
    </div>
  </div>
}

function Field({ label, children }) { return <label style={{ display: 'block', minWidth: 180, margin: '8px 0' }}><span style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>{label}</span>{children}</label> }
function Info({ label, value }) { return <div style={{ display: 'grid', gridTemplateColumns: '145px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid #EEF2EF', overflowWrap: 'anywhere' }}><span style={{ color: '#60786D' }}>{label}</span><span>{value || '—'}</span></div> }
