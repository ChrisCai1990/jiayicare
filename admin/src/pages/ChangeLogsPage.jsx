import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'

const FIELD_OPTIONS = [
  { value: '', label: '全部字段' },
  { value: 'contactPhone', label: '联系电话' },
  { value: 'deliveryAddress', label: '配送地址' },
]

function fmt(dt) {
  if (!dt) return '--'
  return new Date(dt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ChangeLogsPage() {
  const [logs, setLogs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [field, setField]     = useState('')

  const load = async (f = field) => {
    setLoading(true)
    try {
      const res = await adminAPI.changeLogs({ field: f, limit: 100 })
      setLogs(res.data.logs)
      setTotal(res.data.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleFieldChange = (v) => {
    setField(v)
    load(v)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">用户信息变更记录</h1>
          <p className="page-subtitle">记录用户修改联系电话或配送地址的操作，共 {total} 条</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={field}
            onChange={e => handleFieldChange(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e0d9ce', fontSize: 13 }}
          >
            {FIELD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="btn-secondary" onClick={() => load()}>刷新</button>
        </div>
      </div>

      {loading ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <div className="empty-title">暂无变更记录</div>
          <div className="empty-sub">当用户修改联系电话或配送地址时，记录会在此显示</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>变更时间</th>
                <th>用户姓名</th>
                <th>手机号</th>
                <th>变更字段</th>
                <th>修改前</th>
                <th>修改后</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log._id}>
                  <td style={{ color: '#8aa89c', fontSize: 13 }}>{fmt(log.createdAt)}</td>
                  <td><span style={{ fontWeight: 600 }}>{log.userName || '--'}</span></td>
                  <td>{log.userPhone || '--'}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: 99,
                      fontSize: 12,
                      fontWeight: 600,
                      background: log.field === 'contactPhone' ? '#EBF5FB' : '#E8F5EF',
                      color:      log.field === 'contactPhone' ? '#0077B6' : '#1E6B50',
                    }}>
                      {log.fieldLabel || log.field}
                    </span>
                  </td>
                  <td style={{ color: '#8aa89c', fontSize: 13, maxWidth: 200, wordBreak: 'break-all' }}>
                    {log.oldValue || <span style={{ color: '#ccc' }}>（空）</span>}
                  </td>
                  <td style={{ fontSize: 13, maxWidth: 200, wordBreak: 'break-all', color: '#1a2b24', fontWeight: 500 }}>
                    {log.newValue || <span style={{ color: '#ccc' }}>（空）</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
