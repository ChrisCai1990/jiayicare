import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

const PAGE_SIZE = 5

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
}

export default function FollowUpsPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)

  useEffect(() => {
    staffAPI.getFollowUps({ status: 'planned', limit: 200 })
      .then(r => {
        setItems(r.data?.followUps || [])
        setTotal(r.data?.total || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  const now = new Date()
  const overdueCount = items.filter(f => new Date(f.date) < now).length
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const curPage = Math.min(page, pageCount - 1)
  const pageItems = items.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="card" style={{ marginBottom: 20, border: overdueCount > 0 ? '1.5px solid #DC354540' : undefined }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="card-title">待随访任务</div>
          {items.length > 0 && (
            <span style={{
              background: overdueCount > 0 ? '#DC3545' : '#0077B6',
              color: '#fff', fontSize: 11, fontWeight: 700,
              borderRadius: 99, padding: '1px 8px', lineHeight: '18px',
            }}>{total}</span>
          )}
          {overdueCount > 0 && (
            <span style={{ fontSize: 12, color: '#DC3545', fontWeight: 500 }}>
              {overdueCount} 项已过期未随访
            </span>
          )}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => nav('/followups')}>查看全部</button>
      </div>
      <div className="card-body" style={{ padding: '4px 20px 12px' }}>
        {items.length === 0 && (
          <div style={{ color: '#8AA89C', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            暂无待随访任务
          </div>
        )}
        {pageItems.map((f, i) => {
          const overdue = new Date(f.date) < now
          return (
            <div
              key={f._id}
              onClick={() => nav(`/patients/${f.patientId?._id}?tab=followups`)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                borderBottom: i < pageItems.length - 1 ? '1px solid #f0ede8' : 'none',
                cursor: 'pointer',
                background: overdue ? '#FFF8F8' : 'transparent',
                margin: overdue ? '0 -20px' : undefined,
                padding: overdue ? '10px 20px' : '10px 0',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: '#0077B615', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 16,
              }}>
                📞
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0077B6' }}>{f.theme || '随访'}</span>
                  {overdue && (
                    <span style={{ fontSize: 11, color: '#DC3545', background: '#DC354515', padding: '1px 6px', borderRadius: 4 }}>
                      已过期
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#1A2B24', marginBottom: 2 }}>
                  <span style={{ fontWeight: 500 }}>{f.patientId?.name || '未知'}</span>
                  {f.patientId?.phone && (
                    <span style={{ color: '#8AA89C', marginLeft: 8 }}>{f.patientId.phone}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: overdue ? '#DC3545' : '#8AA89C' }}>{formatDate(f.date)}</span>
                <span style={{ fontSize: 14, color: '#C0B8AE' }}>›</span>
              </div>
            </div>
          )
        })}
        {items.length > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 10 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={curPage === 0}
              style={{ border: 'none', background: 'none', color: curPage === 0 ? '#C0B8AE' : '#1E6B50', cursor: curPage === 0 ? 'default' : 'pointer', fontSize: 13 }}
            >‹ 上一页</button>
            <span style={{ fontSize: 12, color: '#8AA89C' }}>{curPage + 1} / {pageCount}</span>
            <button
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={curPage === pageCount - 1}
              style={{ border: 'none', background: 'none', color: curPage === pageCount - 1 ? '#C0B8AE' : '#1E6B50', cursor: curPage === pageCount - 1 ? 'default' : 'pointer', fontSize: 13 }}
            >下一页 ›</button>
          </div>
        )}
      </div>
    </div>
  )
}
