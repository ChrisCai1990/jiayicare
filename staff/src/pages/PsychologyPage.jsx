import React, { useEffect, useState } from 'react'
import { psychologyAPI } from '../api'
import { useStaff } from '../App'

export default function PsychologyPage() {
  const { staff } = useStaff()
  const advisor = staff?.role === 'familyDoctor'
  const [rows, setRows] = useState([]), [care, setCare] = useState(null)
  const [options, setOptions] = useState({ patients: [], psychologists: [] })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ patientId: '', psychologistId: '', sharedBackground: '' })
  const [session, setSession] = useState({ date: '', content: '', nextDate: '' })
  const [background, setBackground] = useState('')
  const [handoff, setHandoff] = useState({ psychologistId: '', reason: '' })
  const load = async () => setRows((await psychologyAPI.get()).data)
  useEffect(() => { load().catch(e => setError(e.message)); if (advisor) psychologyAPI.get('/options').then(r => setOptions(r.data)).catch(e => setError(e.message)) }, [advisor])
  const open = async id => { const r = await psychologyAPI.get('/' + id); setCare(r.data); setBackground(r.data.sharedBackground); setSession({ date: '', content: '', nextDate: '' }) }
  const run = async fn => { setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const save = payload => run(async () => { await psychologyAPI.post('/' + care._id, { action: 'update', ...payload, version: care.__v }); await open(care._id); await load() })
  if (!['familyDoctor', 'psychologist'].includes(staff?.role)) return <div className="page">当前岗位无权查看心理咨询资料。</div>
  return <div className="page"><h1>心理咨询</h1>
    <p>长期咨询档案 · 正式记录仅向负责顾问与咨询师开放</p>
    {error && <div role="alert" style={{ color: '#b42318', whiteSpace: 'pre-wrap' }}>{error}</div>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      {!care ? <>
        <div className="card" style={{ padding: 20 }}>{rows.length ? rows.map(row => <p key={row._id}><button className="btn btn-secondary" onClick={() => run(() => open(row._id))}>{row.patientName} · {{ active: '进行中', paused: '暂停', ended: '已结束' }[row.status]}</button></p>) : <p>暂无心理咨询服务关系。</p>}</div>
        {advisor && <form className="card" style={{ padding: 20, marginTop: 20 }} onSubmit={e => { e.preventDefault(); run(async () => { const r = await psychologyAPI.post('', form); await load(); await open(r.data._id) }) }}>
          <h2>建立长期咨询服务</h2>
          <label>我的客户 <select required value={form.patientId} onChange={e => setForm({ ...form, patientId: e.target.value })}><option value="">请选择</option>{options.patients.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
          <label> 心理咨询师 <select required value={form.psychologistId} onChange={e => setForm({ ...form, psychologistId: e.target.value })}><option value="">请选择</option>{options.psychologists.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
          <label style={{ display: 'block', marginTop: 16 }}>咨询目标与共享背景<textarea required maxLength={20000} rows={6} style={{ width: '100%' }} value={form.sharedBackground} onChange={e => setForm({ ...form, sharedBackground: e.target.value })} /></label>
          <button className="btn btn-primary">建立服务关系</button>
          <button type="button" onClick={() => run(async () => { const reason = window.prompt('接管已有心理档案的原因（接管后可查看完整历史）'); if (!reason) return; const r = await psychologyAPI.post('/takeover', { patientId: form.patientId, reason }); await load(); await open(r.data._id) })}>接管已有档案</button>
        </form>}
      </> : <>
        <button className="btn btn-secondary" onClick={() => setCare(null)}>返回列表</button>
        <h2>{care.patient.name} · {{ active: '进行中', paused: '暂停', ended: '已结束' }[care.status]}</h2>
        <div className="card" style={{ padding: 20 }}><h3>顾问共享资料</h3>{advisor ? <><textarea rows={6} maxLength={20000} style={{ width: '100%' }} value={background} onChange={e => setBackground(e.target.value)} /><button onClick={() => save({ status: care.status, sharedBackground: background })}>保存共享资料</button><div style={{ marginTop: 16 }}>{['active', 'paused', 'ended'].filter(s => s !== care.status).map(status => <button key={status} onClick={() => save({ status })}>{{ active: '恢复服务', paused: '暂停服务', ended: '结束服务' }[status]}</button>)}</div></> : <p style={{ whiteSpace: 'pre-wrap' }}>{care.sharedBackground}</p>}</div>
        {advisor && care.status !== 'ended' && <div className="card" style={{ padding: 20, marginTop: 16 }}><h3>咨询师交接</h3><p>交接后原咨询师立即失去访问权限，新咨询师可查看完整历史。</p><select value={handoff.psychologistId} onChange={e => setHandoff({ ...handoff, psychologistId: e.target.value })}><option value="">请选择新咨询师</option>{options.psychologists.filter(p => p._id !== care.psychologistId).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select><input maxLength={1000} placeholder="交接原因" value={handoff.reason} onChange={e => setHandoff({ ...handoff, reason: e.target.value })} /><button onClick={() => save({ action: 'transfer', ...handoff })}>确认交接</button></div>}
        <h3>历次正式咨询记录</h3>
        {[...care.sessions].reverse().map(s => <article className="card" key={s._id} style={{ padding: 20, marginBottom: 12 }}><strong>{new Date(s.date).toLocaleString('zh-CN')}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{s.content}</p>{s.nextDate && <p>下次咨询：{new Date(s.nextDate).toLocaleString('zh-CN')}</p>}</article>)}
        {!care.sessions.length && <p>尚未提交咨询记录。</p>}
        {!advisor && care.status === 'active' && <form onSubmit={e => { e.preventDefault(); save({ action: 'session', ...session, date: session.date ? new Date(session.date).toISOString() : '', nextDate: session.nextDate ? new Date(session.nextDate).toISOString() : '' }) }}><h3>新增会谈记录</h3><label>会谈时间 <input required type="datetime-local" value={session.date} onChange={e => setSession({ ...session, date: e.target.value })} /></label><textarea required maxLength={30000} rows={10} style={{ width: '100%', marginTop: 12 }} value={session.content} onChange={e => setSession({ ...session, content: e.target.value })} placeholder="评估、咨询过程、进展、风险及后续建议；提交后负责顾问可完整查看" /><label>下次咨询 <input type="datetime-local" value={session.nextDate} onChange={e => setSession({ ...session, nextDate: e.target.value })} /></label><button className="btn btn-primary">提交正式记录</button></form>}
      </>}
    </fieldset>
  </div>
}
