import React, { useRef, useState } from 'react'
import { adminAPI } from '../api'
import { BatchHealthRecordImport } from '../components/BatchHealthRecordImport'

export default function HealthDataImportPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState([])
  const [patient, setPatient] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const request = useRef(0)
  const search = async event => {
    event.preventDefault()
    const version = ++request.current
    setBusy(true); setMessage(''); setPatient(null); setPatients([])
    try {
      const result = await adminAPI.patients({ q: query.trim(), limit: 20 })
      if (version === request.current) {
        setPatients(result.data || [])
        if (!result.data?.length) setMessage('未找到客户，请核对姓名或手机号。')
      }
    } catch (error) { if (version === request.current) setMessage(error.message) }
    finally { if (version === request.current) setBusy(false) }
  }
  const select = async id => {
    const version = ++request.current
    setBusy(true); setMessage('')
    try {
      const result = await adminAPI.patientDetail(id)
      if (version === request.current) setPatient(result.data.user)
    } catch (error) { if (version === request.current) setMessage(error.message) }
    finally { if (version === request.current) setBusy(false) }
  }
  return <div>
    <h2>历史健康数据导入</h2>
    <p style={{ color: '#65776F', fontSize: 13 }}>选择客户 → 上传 CSV 并预检 → 确认导入。每次处理一位客户，以身份证和姓名核对归属。</p>
    {!patient ? <div className="card" style={{ padding: 20 }}>
      <form onSubmit={search} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input aria-label="客户姓名或手机号" className="form-input" placeholder="客户姓名或手机号" value={query} onChange={e => setQuery(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !query.trim()}>查找客户</button>
      </form>
      {patients.map(item => <div key={item._id} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #E5E7EB', alignItems: 'center' }}>
        <span>{item.name} · {item.phone || '未登记手机号'}</span>
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => select(item._id)}>选择</button>
      </div>)}
    </div> : <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><strong>当前客户：{patient.name}</strong><span>{patient.phone}</span>
        <button className="btn btn-outline btn-sm" onClick={() => { ++request.current; setPatient(null); setMessage('') }}>更换客户</button>
      </div>
      <BatchHealthRecordImport key={patient._id} patient={patient} onSaved={() => {}} toast={setMessage} />
    </>}
    {busy && <p role="status">加载中…</p>}
    {message && <p role="status" style={{ padding: 12, background: '#F3F6F4' }}>{message}</p>}
  </div>
}
