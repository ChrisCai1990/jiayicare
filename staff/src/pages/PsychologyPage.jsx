import React, { useEffect, useState } from 'react'
import { psychologyAPI } from '../api'
import { useStaff } from '../App'
import ConsultationCreatePanel from '../components/ConsultationCreatePanel'
import './ConsultationHub.css'

const sessionSections = [
  ['review', '上次咨询回顾反馈', '填写上次咨询后的变化与反馈；首次咨询可注明“首次咨询，无上次记录”'],
  ['concerns', '本次咨询主诉问题', '记录客户本次希望讨论的问题及主要困扰'],
  ['assessment', '问题评估', '填写对本次问题的评估'],
  ['progress', '咨询过程与进展', '记录本次咨询过程、采用的方法及进展'],
  ['recommendations', '风险及后续建议', '记录风险评估情况、后续建议与跟进安排'],
]
const emptySession = () => ({ date: '', nextDate: '', ...Object.fromEntries(sessionSections.map(([key]) => [key, ''])) })
// Keep the existing protected content contract and historical records intact.
const sessionContent = session => sessionSections.map(([key, label]) => `【${label}】\n${session[key].trim()}`).join('\n\n')

export default function PsychologyPage({ embedded = false, patient = null }) {
  const { staff } = useStaff()
  const advisor = staff?.role === 'familyDoctor'
  const [rows, setRows] = useState([]), [care, setCare] = useState(null)
  const [options, setOptions] = useState({ patients: [], psychologists: [] })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [session, setSession] = useState(emptySession)
  const [background, setBackground] = useState('')
  const [handoff, setHandoff] = useState({ psychologistId: '', reason: '' })
  const [creating, setCreating] = useState(false), [loading, setLoading] = useState(true)
  const listPath = patient ? '?patientId=' + encodeURIComponent(patient._id) : ''
  const load = async () => { const data = (await psychologyAPI.get(listPath)).data; setRows(data); return data }
  useEffect(() => {
    let active = true
    setLoading(true); setCare(null); setRows([]); setError('')
    const initialize = async () => {
      const rows = (await psychologyAPI.get(listPath)).data
      if (!active) return
      setRows(rows)
      const careId = patient ? rows[0]?._id : new URLSearchParams(window.location.search).get('careId')
      if (careId) {
        const detail = (await psychologyAPI.get('/' + careId)).data
        if (!active) return
        setCare(detail); setBackground(detail.sharedBackground); setSession(emptySession())
      }
      if (advisor) { const r = await psychologyAPI.get('/options'); if (active) setOptions(r.data) }
    }
    initialize().catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [advisor, listPath])
  const open = async id => { const r = await psychologyAPI.get('/' + id); setCare(r.data); setBackground(r.data.sharedBackground); setSession(emptySession()) }
  const run = async fn => { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const save = payload => run(async () => { await psychologyAPI.post('/' + care._id, { action: 'update', ...payload, version: care.__v }); await open(care._id); await load() })
  if (!['familyDoctor', 'psychologist'].includes(staff?.role)) return <div className="page">当前岗位无权查看心理咨询资料。</div>
  return <div className="psychology-workspace">{!embedded && <h1>心理咨询</h1>}
    {!care && <div className="psychology-privacy">仅负责顾问与咨询师可查看正式咨询资料</div>}
    {error && <div role="alert" style={{ color: '#b42318', whiteSpace: 'pre-wrap' }}>{error}</div>}
    {patient && !care && <div className="hub-header"><div><h2>长期心理咨询</h2><p>该客户的咨询记录与持续跟进</p></div>{!loading && !care && !error && <button className="btn btn-primary" onClick={() => setCreating(true)}>发起长期心理咨询</button>}</div>}
    {creating && <ConsultationCreatePanel initialType="psychology" fixedPatient={patient} onClose={() => setCreating(false)} onCreated={async (_, record) => { setCreating(false); await run(async () => { await open(record._id || record.id); await load() }) }} />}
    {loading ? <p role="status">正在加载咨询档案…</p> : <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      {!care ? <>
        <div className="card" style={{ padding: 20 }}>{rows.length ? rows.map(row => <p key={row._id}><button className="btn btn-secondary" onClick={() => run(() => open(row._id))}>{row.patientName} · {{ active: '进行中', paused: '暂停', ended: '已结束' }[row.status]}</button></p>) : <div className="psychology-empty"><span className="empty-symbol">◎</span><h2>还没有长期心理咨询服务</h2><p>{advisor ? (patient ? '在这里发起服务，后续咨询记录将持续保存在本客户档案中。' : '点击右上角“发起服务”，或从客户页面发起转介。') : '健康顾问指派后，客户的咨询档案会显示在这里。'}</p></div>}</div>

      </> : <>
        {!patient && <button className="btn btn-secondary" onClick={() => setCare(null)}>返回列表</button>}
        <div className="psychology-record-header"><div><h2>咨询师记录</h2><span>{!patient && `${care.patient.name} · `}{{ active: '进行中', paused: '暂停', ended: '已结束' }[care.status]} · 共 {care.sessions.length} 次咨询</span></div><small>仅负责顾问与咨询师可见</small></div>
        {[...care.sessions].sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map((s, index) => <article className="card psychology-record" key={s._id}><details open={index === 0}><summary><strong>{index === 0 ? '最近一次咨询' : '咨询记录'}</strong><time>{new Date(s.date).toLocaleString('zh-CN')}</time><span className="psychology-record-toggle">展开 / 收起</span></summary><div className="psychology-record-body"><p style={{ whiteSpace: 'pre-wrap' }}>{s.content}</p>{s.originalContent && <details className="psychology-original-record"><summary>查看分类整理前的原始记录</summary><p style={{ whiteSpace: 'pre-wrap' }}>{s.originalContent}</p></details>}{s.nextDate && <p>下次咨询：{new Date(s.nextDate).toLocaleString('zh-CN')}</p>}</div></details></article>)}
        {!care.sessions.length && <p>尚未提交咨询记录。</p>}
        {!advisor && care.status === 'active' && <form className="card psychology-session-form" onSubmit={e => {
          e.preventDefault()
          if (sessionSections.some(([key]) => !session[key].trim())) { setError('请填写全部五项咨询记录；不适用的项目请注明原因。'); return }
          const content = sessionContent(session)
          if (content.length > 30000) { setError('咨询记录合计不能超过30000字，请精简后提交。'); return }
          save({ action: 'session', content, date: session.date ? new Date(session.date).toISOString() : '', nextDate: session.nextDate ? new Date(session.nextDate).toISOString() : '' })
        }}>
          <h3>新增会谈记录</h3>
          <p className="psychology-session-hint">请按以下五项填写，提交后负责顾问可完整查看。首次咨询或不适用的项目请注明情况。</p>
          <label className="psychology-field">会谈时间 <input className="form-input" required type="datetime-local" value={session.date} onChange={e => setSession({ ...session, date: e.target.value })} /></label>
          {sessionSections.map(([key, label, placeholder], index) => <label className="psychology-session-section" key={key}>
            <span><span className="psychology-section-number">{index + 1}</span>{label} <span aria-hidden="true">*</span></span>
            <textarea className="form-input" required maxLength={30000} rows={4} value={session[key]} onChange={e => setSession({ ...session, [key]: e.target.value })} placeholder={placeholder} />
          </label>)}
          <label className="psychology-field">下次咨询 <input className="form-input" type="datetime-local" value={session.nextDate} onChange={e => setSession({ ...session, nextDate: e.target.value })} /></label>
          {error && <div role="alert" className="consultation-form-error">{error}</div>}
          <button className="btn btn-primary">提交正式记录</button>
        </form>}
        <details className="psychology-management"><summary>{advisor ? '共享资料与服务管理' : '顾问共享资料'}</summary>
        <div className="card" style={{ padding: 20 }}><h3>顾问共享资料</h3>{advisor ? <><textarea className="form-input" rows={6} maxLength={20000} style={{ width: '100%' }} value={background} onChange={e => setBackground(e.target.value)} /><button className="btn btn-secondary" onClick={() => save({ status: care.status, sharedBackground: background })}>保存共享资料</button><div style={{ marginTop: 16 }}>{['active', 'paused', 'ended'].filter(s => s !== care.status).map(status => <button className="btn btn-secondary" key={status} onClick={() => save({ status })}>{{ active: '恢复服务', paused: '暂停服务', ended: '结束服务' }[status]}</button>)}</div></> : <p style={{ whiteSpace: 'pre-wrap' }}>{care.sharedBackground}</p>}</div>
        {advisor && care.status !== 'ended' && <div className="card" style={{ padding: 20, marginTop: 16 }}><h3>咨询师交接</h3><p>交接后原咨询师立即失去访问权限，新咨询师可查看完整历史。</p><select className="form-input" value={handoff.psychologistId} onChange={e => setHandoff({ ...handoff, psychologistId: e.target.value })}><option value="">请选择新咨询师</option>{options.psychologists.filter(p => p._id !== care.psychologistId).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select><input className="form-input" maxLength={1000} placeholder="交接原因" value={handoff.reason} onChange={e => setHandoff({ ...handoff, reason: e.target.value })} /><button className="btn btn-secondary" onClick={() => save({ action: 'transfer', ...handoff })}>确认交接</button></div>}
        </details>
      </>}
    </fieldset>}
  </div>
}
