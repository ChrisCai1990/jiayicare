import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const apiBase = import.meta.env.VITE_API_URL || '/api'
const blank = {
  name: '', phone: '', institutionName: '', departmentName: '', title: '', profession: '临床医师',
  registrationScope: '', experienceYears: '', expertise: '', unsuitableTopics: '',
  singleConsultation: false, mdt: false, mdtLead: false, singleExpectedFee: '', mdtExpectedFee: '',
  feeTaxBasis: 'undecided', feeIncludes: [], extraFeeRule: '', preparationMinutes: '', materialLimit: '', replyHours: '',
  weeklyAvailability: '', weeklyCapacity: '', minimumNoticeHours: 48, scheduleMaintenance: 'self',
  recordingPreference: 'discuss', cooperationNotes: '', privacyAcknowledged: false,
}
const inputStyle = { width: '100%', padding: '10px 11px', border: '1px solid #C9D8D2', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }
const section = { marginTop: 22, borderTop: '1px solid #E1EAE6', paddingTop: 14 }

export default function ExpertInvitationPage({ reusable = false }) {
  const { token } = useParams()
  const publicPath = reusable ? 'public-link' : 'public'
  const [state, setState] = useState('loading')
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const set = key => e => setForm(current => ({ ...current, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const copyQuestionnaireLink = async () => {
    const url = window.location.href
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setShareMessage('链接已复制，请在微信聊天中粘贴发送。')
    } catch {
      setShareMessage('复制失败，请选中下方链接手动复制。')
    }
  }
  useEffect(() => {
    fetch(`${apiBase}/expert-recruitment/${publicPath}/${encodeURIComponent(token)}`).then(async r => {
      const data = await r.json()
      if (!r.ok) throw new Error(data.message || '链接无法使用')
      setState(reusable || data.data.status === 'invited' ? 'ready' : 'completed')
    }).catch(e => { setError(e.message); setState('error') })
  }, [token, publicPath, reusable])
  const submit = async e => {
    e.preventDefault()
    setError(''); setState('saving')
    try {
      const payload = { ...form,
        singleExpectedFee: form.singleConsultation ? form.singleExpectedFee : '',
        mdtExpectedFee: form.mdt ? form.mdtExpectedFee : '',
        expertise: form.expertise.split(/[、,，;；\n]+/).map(s => s.trim()).filter(Boolean),
      }
      const res = await fetch(`${apiBase}/expert-recruitment/${publicPath}/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || '提交失败')
      setState('completed')
    } catch (e) { setError(e.message); setState('ready') }
  }
  return <main style={{ minHeight: '100vh', background: '#F5F8F6', padding: '28px 12px', color: '#203B32' }}>
    <div style={{ maxWidth: 720, margin: '0 auto', background: 'white', borderRadius: 14, padding: '26px 24px', boxShadow: '0 8px 32px #1b4b3520' }}>
      <h1 style={{ margin: '0 0 9px', fontSize: 25 }}>嘉医汇专家合作意向问卷</h1>
      <p style={{ lineHeight: 1.7, color: '#4C655B' }}>本问卷用于了解您的专业方向、合作意向、预期报酬和可安排时间。提交后，我们会进一步核验资质并商谈合作条件。</p>
      {reusable && ['ready', 'saving', 'completed'].includes(state) && <div style={{ background: '#EFF7F2', borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <p style={{ margin: '0 0 7px', fontSize: 13, color: '#4C655B' }}>同一链接可供多位专家分别填写。复制后在微信聊天中粘贴发送，显示网址是正常的。</p>
        <input aria-label="问卷链接" readOnly value={typeof window === 'undefined' ? '' : window.location.href} onFocus={e => e.target.select()} style={{ ...inputStyle, fontSize: 13, background: 'white' }}/>
        <button type="button" onClick={copyQuestionnaireLink} style={{ border: 0, borderRadius: 8, background: '#246B4D', color: 'white', fontSize: 15, padding: '10px 18px', marginTop: 8, cursor: 'pointer' }}>复制问卷链接</button>
        {shareMessage && <p role="status" style={{ margin: '8px 0 0', fontSize: 13 }}>{shareMessage}</p>}
      </div>}
      {state === 'loading' && <p>正在核对邀请链接…</p>}
      {state === 'completed' && <p role="status">问卷已提交。嘉医汇会通过专科合伙人或约定联系方式与您沟通。</p>}
      {state === 'error' && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
      {(state === 'ready' || state === 'saving') && <form onSubmit={submit}>
        <h2 style={section}>基本资料与专业范围</h2>
        <Field label="姓名 *"><input style={inputStyle} required value={form.name} onChange={set('name')} maxLength={80}/></Field>
        <Field label="手机号 *"><input style={inputStyle} required inputMode="tel" pattern="1[0-9]{10}" value={form.phone} onChange={set('phone')} maxLength={11}/></Field>
        <Field label="所在机构（医院请填写全称）"><input style={inputStyle} value={form.institutionName} onChange={set('institutionName')}/></Field>
        <Field label="实际科室或团队"><input style={inputStyle} value={form.departmentName} onChange={set('departmentName')}/></Field>
        <Field label="专业类别"><select style={inputStyle} value={form.profession} onChange={set('profession')}>{['临床医师','护理','营养','康复','心理','药学','其他'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="职称或专业等级"><input style={inputStyle} value={form.title} onChange={set('title')}/></Field>
        <Field label="执业或服务范围"><input style={inputStyle} value={form.registrationScope} onChange={set('registrationScope')}/></Field>
        <Field label="相关工作年限"><input style={inputStyle} type="number" min="0" max="80" value={form.experienceYears} onChange={set('experienceYears')}/></Field>
        <Field label="最擅长的咨询主题或人群  多项用顿号分隔"><textarea style={inputStyle} rows={2} value={form.expertise} onChange={set('expertise')}/></Field>
        <Field label="不适合承接的主题或专业边界"><textarea style={inputStyle} rows={2} value={form.unsuitableTopics} onChange={set('unsuitableTopics')}/></Field>
        <h2 style={section}>合作方式与交付</h2>
        <Check label="愿意参与单次专家咨询分析" checked={form.singleConsultation} onChange={set('singleConsultation')}/>
        <Check label="愿意参与多学科咨询分析 MDT" checked={form.mdt} onChange={set('mdt')}/>
        <Check label="愿意担任 MDT 牵头专家" checked={form.mdtLead} onChange={set('mdtLead')}/>
        <p style={{ fontSize: 13, color: '#60786D' }}>咨询分析以约 15–20 分钟的线上交流为基础，通常还包括会前阅读必要资料、会后书面回复。没有更合适的方案时，请如实说明依据和建议的下一步。</p>
        <h2 style={section}>您希望获得的每次服务报酬</h2>
        <p style={{ fontSize: 13, color: '#60786D' }}>请先填写预期金额，便于商谈；最终合作价格以双方确认的条件为准。勾选的服务类型须填写对应报价。</p>
        <Field label="单次专家咨询分析：每次预期报酬（元）"><input style={inputStyle} type="number" min="0" step="1" required={form.singleConsultation} value={form.singleExpectedFee} onChange={e => setForm(current => ({ ...current, singleExpectedFee: e.target.value, singleConsultation: current.singleConsultation || e.target.value !== '' }))} placeholder="例如 200；不参与可留空"/></Field>
        <Field label="MDT 多学科咨询分析：每次参与预期报酬（元）"><input style={inputStyle} type="number" min="0" step="1" required={form.mdt} value={form.mdtExpectedFee} onChange={e => setForm(current => ({ ...current, mdtExpectedFee: e.target.value, mdt: current.mdt || e.target.value !== '' }))} placeholder="例如 200；不参与可留空"/></Field>
        <Field label="报价口径"><select style={inputStyle} value={form.feeTaxBasis} onChange={set('feeTaxBasis')}><option value="undecided">待商谈</option><option value="pre_tax">税前</option><option value="after_tax">税后</option></select></Field>
        <Field label="如需额外收费，请说明情形和金额（选填）"><input style={inputStyle} value={form.extraFeeRule} onChange={set('extraFeeRule')} placeholder="例如超过约定时长时，每增加 10 分钟希望增加多少元"/></Field>
        <h2 style={section}>排班与接单</h2>
        <Field label="通常每周可安排的具体时段"><textarea style={inputStyle} rows={3} value={form.weeklyAvailability} onChange={set('weeklyAvailability')} placeholder="例如 周二 14:00 至 17:00；周六 9:00 至 12:00"/></Field>
        <Field label="每周最多承接单数"><input style={inputStyle} type="number" min="0" max="100" value={form.weeklyCapacity} onChange={set('weeklyCapacity')}/></Field>
        <Field label="最短提前派单时间  小时"><input style={inputStyle} type="number" min="0" max="720" value={form.minimumNoticeHours} onChange={set('minimumNoticeHours')}/></Field>
        <Field label="后续排班维护方式"><select style={inputStyle} value={form.scheduleMaintenance} onChange={set('scheduleMaintenance')}><option value="self">本人在系统维护</option><option value="assistant">由助理协助维护</option><option value="undecided">待商谈</option></select></Field>
        <h2 style={section}>资料使用与会议记录</h2>
        <Field label="在客户另行同意的前提下，对会议录制或转写的意向"><select style={inputStyle} value={form.recordingPreference} onChange={set('recordingPreference')}><option value="discuss">需商谈</option><option value="recording">可录制及转写</option><option value="transcript_only">仅同意转写</option><option value="neither">不愿录制或转写</option></select></Field>
        <Field label="其他合作条件或建议"><textarea style={inputStyle} rows={2} value={form.cooperationNotes} onChange={set('cooperationNotes')}/></Field>
        <Check label="我了解本问卷资料仅用于嘉医汇的合作评估与联系，提交后由授权人员查收；正式合作及客户资料使用需另行确认。 *" checked={form.privacyAcknowledged} onChange={set('privacyAcknowledged')}/>
        {error && <p role="alert" style={{ color:'#B42318' }}>{error}</p>}
        <button type="submit" disabled={state === 'saving'} style={{ marginTop:18, background:'#23745B', color:'white', border:0, borderRadius:8, padding:'12px 25px', fontSize:16, cursor:'pointer' }}>{state === 'saving' ? '提交中…' : '提交问卷'}</button>
      </form>}
    </div>
  </main>
}

function Field({ label, children }) { return <label style={{ display:'block', margin:'13px 0' }}><span style={{ display:'block', marginBottom:5, fontWeight:600 }}>{label}</span>{children}</label> }
function Check({ label, checked, onChange }) { return <label style={{ display:'flex', alignItems:'flex-start', gap:8, margin:'11px 0' }}><input type="checkbox" checked={checked} onChange={onChange} style={{ marginTop:4 }}/><span>{label}</span></label> }
