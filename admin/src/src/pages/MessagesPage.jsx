import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'

export default function MessagesPage() {
  const nav = useNavigate()
  const [messages, setMessages] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const res = await adminAPI.messages({ page: p, limit: 30 })
      setMessages(res.data)
      setTotal(res.total)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load(page) }, [page])

  const fmtTime = (d) => d ? new Date(d).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'
  const totalPages = Math.ceil(total / 30)

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">💬 消息中心</div>
          <div className="page-sub">共 {total} 条患者留言</div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /> 加载中...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>患者</th>
                  <th>留言标题</th>
                  <th>内容摘要</th>
                  <th>发送时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(m => (
                  <tr key={m._id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{m.user?.name || '未知'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.user?.phone}</div>
                    </td>
                    <td style={{ maxWidth: 160 }}>
                      <strong>{m.title || '无标题'}</strong>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 300 }}>
                      {m.content?.slice(0, 60)}{m.content?.length > 60 ? '...' : ''}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {fmtTime(m.createdAt)}
                    </td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => m.user?._id && nav(`/patients/${m.user._id}?tab=messages`)}
                      >
                        回复 →
                      </button>
                    </td>
                  </tr>
                ))}
                {messages.length === 0 && (
                  <tr><td colSpan={5}>
                    <div className="empty-state">
                      <div className="empty-state-icon">💬</div>
                      <div className="empty-state-text">暂无患者留言</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">共 {total} 条</div>
            <div className="pagination-btns">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + 1
                return <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              })}
              <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
