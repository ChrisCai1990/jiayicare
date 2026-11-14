import React, { useEffect, useState } from 'react'
import { getToken } from '../api'

const base = `${import.meta.env.VITE_API_URL || '/api'}/admin/cooperation-agreements`
const kinds = { staff: '员工／外部专业人员', marketPartner: '市场合伙人', professionalTeam: '外部专业团队' }
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const field = { padding: '9px 12px', border: '1px solid #C9D8D2', borderRadius: 7, width: '100%', boxSizing: 'border-box' }

export default function CooperationAgreementsPage() {
  const [type, setType] = useState('staff')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [agreements, setAgreements] = useState([])
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [team, setTeam] = useState({ name: '', creditCode: '', leaderStaffId: '', authorizedRepresentativeStaffId: '', representativeConfirmed: false, memberStaffIds: [], status: 'active' })
  const [staffQuery, setStaffQuery] = useState('')
  const [staffChoices, setStaffChoices] = useState([])

  async function call(path, options = {}) {
    const response = await fetch(`${base}${path}`, { ...options, cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${getToken()}`, ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) } })
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || '操作失败')
    return response
  }
  async function search(kind = type, q = query) {
    setError('')
    try { setRows((await (await call(`/subjects?type=${kind}&q=${encodeURIComponent(q)}`)).json()).data) }
    catch (e) { setError(e.message) }
  }
  async function searchStaff() {
    try { setStaffChoices((await (await call(`/subjects?type=staff&q=${encodeURIComponent(staffQuery)}`)).json()).data) }
    catch (e) { setError(e.message) }
  }
  useEffect(() => { search('staff', '') }, [])
  async function choose(row) {
    setSelected(row); setError(''); setNotice('')
    try {
      setAgreements((await (await call(`/${type}/${row.id}`)).json()).data)
      if (type === 'professionalTeam') {
        const result = (await (await call(`/teams/${row.id}`)).json()).data
        setTeam({ name: result.name, creditCode: result.creditCode || '', leaderStaffId: result.leaderStaffId,
          authorizedRepresentativeStaffId: result.authorizedRepresentativeStaffId || '', representativeConfirmed: false,
          memberStaffIds: result.memberStaffIds || [], status: result.status || 'active' })
      }
    } catch (e) { setError(e.message) }
  }
  async function download(path, filename) {
    setBusy(true); setError('')
    try {
      const response = await call(path)
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function archive(event) {
    event.preventDefault()
    if (!selected || !file || file.size > 10 * 1024 * 1024) return setError('请选择单个不超过10MB的已签文件')
    setBusy(true); setError(''); setNotice('')
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries({ title, signedDate, effectiveAt, expiresAt, confirmed: String(confirmed) })) body.append(key, value)
      body.append('file', file)
      await call(`/${type}/${selected.id}`, { method: 'POST', body })
      setAgreements((await (await call(`/${type}/${selected.id}`)).json()).data)
      setFile(null); setTitle(''); setSignedDate(''); setEffectiveAt(''); setExpiresAt(''); setConfirmed(false)
      event.target.reset()
      setNotice('已签协议已归档，签约主体可在本人工作台查看')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function saveTeam(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const editing = type === 'professionalTeam' && selected
      const result = (await (await call(editing ? `/teams/${selected.id}` : '/teams', {
        method: editing ? 'PATCH' : 'POST', body: JSON.stringify(team),
      })).json()).data
      setNotice(editing ? '团队成员已更新' : '专业团队已建立')
      await search('professionalTeam', '')
      if (!editing) { setSelected(null); setTeam({ name: '', creditCode: '', leaderStaffId: '', authorizedRepresentativeStaffId: '', representativeConfirmed: false, memberStaffIds: [], status: 'active' }) }
      else setSelected({ ...selected, name: result.name })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return <div className="page">
    <div className="page-header"><div><h1 className="page-title">合作关系与协议</h1><p className="page-subtitle">为员工、外部专业人员、专业团队和市场合伙人归档双方手签文件。历史版本保留，仅签约主体及授权代表可查看。</p></div></div>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#246B4D' }}>{notice}</p>}
    <div className="card" style={{ padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select aria-label="签约主体类型" className="form-input" value={type} onChange={e => { setType(e.target.value); setSelected(null); setAgreements([]); setRows([]); setQuery(''); search(e.target.value, '') }} style={{ maxWidth: 220 }}>{Object.entries(kinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <input className="form-input" aria-label="搜索签约主体" value={query} onChange={e => setQuery(e.target.value)} placeholder="按姓名或团队名称查找" style={{ maxWidth: 240 }}/>
        <button className="btn" onClick={() => search()}>查询</button>
        {type === 'professionalTeam' && <button className="btn" onClick={() => { setSelected(null); setAgreements([]); setTeam({ name: '', creditCode: '', leaderStaffId: '', authorizedRepresentativeStaffId: '', representativeConfirmed: false, memberStaffIds: [], status: 'active' }) }}>新建团队</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>{rows.map(row => <button key={row.id} type="button" className="btn" aria-pressed={selected?.id === row.id} onClick={() => choose(row)}>{row.name}{row.detail ? ` · ${row.detail}` : ''}</button>)}</div>
      {!rows.length && <p>没有匹配的主体。市场合伙人需先在“市场合伙人”中登记。</p>}
    </div>
    {type === 'professionalTeam' && <form className="card" style={{ padding: 20, marginBottom: 18, display: 'grid', gap: 10 }} onSubmit={saveTeam}>
      <h3>{selected ? '维护专业团队' : '建立专业团队'}</h3>
      <label>团队名称<input required style={field} value={team.name} onChange={e => setTeam(v => ({ ...v, name: e.target.value }))}/></label>
      <label>统一社会信用代码（如适用）<input style={field} value={team.creditCode} onChange={e => setTeam(v => ({ ...v, creditCode: e.target.value }))}/></label>
      <p style={{ margin: 0, color: '#667085' }}>无独立法人主体的团队可用于成员协作；协议请归档到实际签约的负责人个人名下。</p>
      {selected && <label>团队状态<select style={field} value={team.status} onChange={e => setTeam(v => ({ ...v, status: e.target.value }))}><option value="active">合作中</option><option value="inactive">已停止合作</option></select></label>}
      <div style={{ display: 'flex', gap: 8 }}><input style={field} value={staffQuery} onChange={e => setStaffQuery(e.target.value)} placeholder="查找已开通医护端账号"/><button type="button" className="btn" onClick={searchStaff}>查找人员</button></div>
      <label>负责人<select required style={field} value={team.leaderStaffId} onChange={e => setTeam(v => ({ ...v, leaderStaffId: e.target.value }))}><option value="">请选择</option>{staffChoices.map(row => <option value={row.id} key={row.id}>{row.name} · {row.detail}</option>)}{team.leaderStaffId && !staffChoices.some(row => row.id === team.leaderStaffId) && <option value={team.leaderStaffId}>当前负责人</option>}</select></label>
      <label>团队协议授权代表（登记法人主体时选填）<select style={field} value={team.authorizedRepresentativeStaffId} onChange={e => setTeam(v => ({ ...v, authorizedRepresentativeStaffId: e.target.value, representativeConfirmed: false }))}><option value="">尚未核验授权代表</option>{staffChoices.map(row => <option value={row.id} key={row.id}>{row.name} · {row.detail}</option>)}{team.authorizedRepresentativeStaffId && !staffChoices.some(row => row.id === team.authorizedRepresentativeStaffId) && <option value={team.authorizedRepresentativeStaffId}>当前授权代表</option>}</select></label>
      {team.authorizedRepresentativeStaffId && <label><input type="checkbox" checked={team.representativeConfirmed} onChange={e => setTeam(v => ({ ...v, representativeConfirmed: e.target.checked }))}/> 如本次设置或变更代表，我已核验其代表该主体查看协议的授权</label>}
      <strong>成员（可多选）</strong>
      {staffChoices.map(row => <label key={row.id}><input type="checkbox" checked={team.memberStaffIds.includes(row.id)} onChange={e => setTeam(v => ({ ...v, memberStaffIds: e.target.checked ? [...v.memberStaffIds, row.id] : v.memberStaffIds.filter(id => id !== row.id) }))}/> {row.name} · {row.detail}</label>)}
      {team.memberStaffIds.length > 0 && <p>当前已选 {team.memberStaffIds.length} 人；搜索其他人员后，已选成员仍会保留。</p>}
      <button className="btn btn-primary" disabled={busy || !team.name || !team.leaderStaffId}>{selected ? '保存团队' : '建立团队'}</button>
    </form>}
    {selected && <div className="card" style={{ padding: 20 }}>
      <h3>{selected.name} · 合作协议</h3>
      {agreements.length ? agreements.map(row => <div key={row.id} style={{ padding: '10px 0', borderTop: '1px solid #E5EDE9' }}><strong>{row.title}</strong> · 签署于 {row.signedDate}<div>{row.name}</div><button type="button" className="btn" onClick={() => download(`/${type}/${selected.id}/${row.id}`, row.name)} disabled={busy}>下载已签文件</button></div>) : <p>尚未归档协议。</p>}
      <form onSubmit={archive} style={{ display: 'grid', gap: 10, maxWidth: 620, marginTop: 18 }}>
        <h4>归档新的手签协议</h4>
        <label>协议名称<input required style={field} value={title} onChange={e => setTitle(e.target.value)} maxLength={160}/></label>
        <label>实际签署日期<input required type="date" max={today()} style={field} value={signedDate} onChange={e => setSignedDate(e.target.value)}/></label>
        <label>生效日期（选填）<input type="date" style={field} value={effectiveAt} onChange={e => setEffectiveAt(e.target.value)}/></label>
        <label>截止日期（选填）<input type="date" style={field} value={expiresAt} onChange={e => setExpiresAt(e.target.value)}/></label>
        <label>双方手签或盖章完整扫描件<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setFile(e.target.files?.[0] || null)}/></label>
        <label><input required type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> 已核对签约主体、双方签字或盖章及全部页</label>
        <button className="btn btn-primary" disabled={busy || !file || !confirmed}>归档并开放给签约主体</button>
      </form>
    </div>}
  </div>
}
