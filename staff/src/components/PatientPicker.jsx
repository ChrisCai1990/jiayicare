import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'

// Query the permitted population on the server; never filter a truncated preload.
export function usePatientSearch(search = '') {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ patients: [], total: 0, query: null, page: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const previousQuery = useRef(search.trim())
  const query = search.trim()
  const effectivePage = previousQuery.current === query ? page : 1
  useEffect(() => {
    if (previousQuery.current !== query) { previousQuery.current = query; setPage(1) }
    let active = true
    setLoading(true); setError('')
    const timer = setTimeout(async () => {
      try {
        const response = await staffAPI.getPatients({ search: query, page: effectivePage, limit: 20 })
        if (active) setResult({ patients: response.data.patients || [], total: response.data.total || 0, query, page: effectivePage })
      } catch (err) {
        if (active) { setError(err.message || '会员加载失败'); setResult({ patients: [], total: 0, query, page: effectivePage }) }
      } finally { if (active) setLoading(false) }
    }, query ? 300 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [query, effectivePage, attempt])
  const current = result.query === query && result.page === effectivePage
  return { patients: current ? result.patients : [], total: current ? result.total : 0,
    page: effectivePage, setPage, loading: loading || !current, error,
    retry: () => setAttempt(value => value + 1) }
}

export function PatientSearchStatus({ search }) {
  return <div style={{ margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
    {search.error ? <span role="alert" style={{ color: '#B42318' }}>{search.error} <button type="button" className="btn btn-secondary btn-sm" onClick={search.retry}>重试</button></span>
      : <span role="status">{search.loading ? '会员搜索中…' : `共 ${search.total} 位匹配会员 · 第 ${search.page} 页`}</span>}
    <button type="button" className="btn btn-secondary btn-sm" disabled={search.loading || search.page <= 1} onClick={() => search.setPage(search.page - 1)}>上一页会员</button>
    <button type="button" className="btn btn-secondary btn-sm" disabled={search.loading || search.page * 20 >= search.total} onClick={() => search.setPage(search.page + 1)}>下一页会员</button>
  </div>
}

export default function PatientPicker({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const search = usePatientSearch(query)
  return <div>
    {value && selected && <div style={{ padding: 8, background: '#EAF5F0', marginBottom: 8 }}>
      已选：{selected.name} · {selected.phone || '未登记手机号'}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelected(null); onChange('') }}>重新选择会员</button>
    </div>}
    {!value && <>
      <input aria-label="搜索上传报告的会员" className="form-input" placeholder="输入姓名或手机号搜索全部可见会员" value={query} onChange={e => setQuery(e.target.value)} />
      <PatientSearchStatus search={search} />
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {search.patients.map(patient => <button type="button" className="btn btn-secondary" key={patient._id} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
          onClick={() => { setSelected(patient); onChange(patient._id) }}>{patient.name} · {patient.phone || '未登记手机号'}</button>)}
        {!search.loading && !search.error && !search.patients.length && <div>没有匹配的会员，请尝试姓名或手机号。</div>}
      </div>
    </>}
  </div>
}
