import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export default function InventoryCustomerPicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    setSelected(null)
    if (value) staffAPI.inventoryUser(value).then(response => {
      if (active) setSelected(response.data)
    }).catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [value])

  const search = async () => {
    if (query.trim().length < 2) { setError('请输入至少两个字或数字'); return }
    setBusy(true); setError('')
    try { setMatches((await staffAPI.inventoryUsers(query.trim())).data || []) }
    catch (err) { setError(err.message); setMatches([]) }
    finally { setBusy(false) }
  }

  return <div>
    {selected && <div style={{ padding: 8, background: '#EAF5F0', marginBottom: 8 }}>
      已选：{selected.name} · {selected.phone || selected.patientNo || '未登记电话'}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onChange(''); setMatches([]) }}>重新选择</button>
    </div>}
    {!value && <><div style={{ display: 'flex', gap: 6 }}>
      <input className="form-input" aria-label="搜索使用客户" placeholder="姓名或手机号" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search() } }} />
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={search}>{busy ? '查询中…' : '查找'}</button>
    </div>
    {matches.map(customer => <button type="button" className="btn btn-secondary" key={customer._id} style={{ display: 'block', marginTop: 6, textAlign: 'left' }} onClick={() => onChange(customer._id)}>{customer.name} · {customer.phone || customer.patientNo || '未登记电话'}</button>)}</>}
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
  </div>
}
