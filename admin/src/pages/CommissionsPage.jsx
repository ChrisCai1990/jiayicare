import React, { useEffect, useState, useCallback } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const STATUS_META = {
  pending:   { label: '待审核', badge: 'badge-yellow' },
  confirmed: { label: '待打款', badge: 'badge-blue' },
  paid:      { label: '已打款', badge: 'badge-green' },
  cancelled: { label: '已驳回', badge: 'badge-gray' },
}
const ROLE_LABELS = { referrer: '转介绍人', fulfiller: '服务人' }

export default function CommissionsPage() {
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [selected, setSelected] = useState([])

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = { page: p, limit: 20 }
      if (statusFilter) params.status = statusFilter
      const res = await adminAPI.commissions(params)
      setRecords(res.data)
      setTotal(res.total)
      setSelected([])
    } catch (e) { toast('❌ ' + (e.message || '加载失败')) }
    finally { setLoading(false) }
  }, [statusFilter, page])

  useEffect(() => { setPage(1); load(1) }, [statusFilter])
  useEffect(() => { load(page) }, [page])

  const doAction = async (id, fn, successMsg) => {
    setUpdating(id)
    try {
      await fn(id)
      toast('✅ ' + successMsg)
      await load(page)
    } catch (e) { toast('❌ ' + (e.message || '操作失败')) }
    finally { setUpdating(null) }
  }

  const confirm = (id) => doAction(id, adminAPI.confirmCommission, '已审核通过')
  const reject = (id) => {
    const reason = window.prompt('驳回原因（可选）：') || ''
    doAction(id, () => adminAPI.rejectCommission(id, reason), '已驳回')
  }
  const pay = (id) => doAction(id, adminAPI.payCommission, '已确认打款')

  const batchPay = async () => {
    if (!selected.length) return
    if (!window.confirm(`确认批量打款 ${selected.length} 条记录？`)) return
    try {
      const res = await adminAPI.batchPayCommissions(selected)
      toast('✅ ' + res.message)
      await load(page)
    } catch (e) { toast('❌ ' + (e.message || '批量打款失败')) }
  }

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleSelectAll = () => {
    const confirmedIds = records.filter(r => r.status === 'confirmed').map(r => r._id)
    setSelected(s => s.length === confirmedIds.length ? [] : confirmedIds)
  }

  const totalPages = Math.ceil(total / 20)
  const fmtTime = (d) => d ? new Date(d).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">💰 佣金审核打款</div>
          <div className="page-sub">共 {total} 条记录</div>
        </div>
        {statusFilter === 'confirmed' && selected.length > 0 && (
          <button className="btn btn-primary" onClick={batchPay}>批量打款（已选{selected.length}条）</button>
        )}
      </div>

      <div className="card">
        <div className="search-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['pending', '待审核'], ['confirmed', '待打款'], ['paid', '已打款'], ['cancelled', '已驳回'], ['', '全部']].map(([val, label]) => (
            <button
              key={val}
              className={`btn ${statusFilter === val ? 'btn-primary' : 'btn-ghost'}`}
              style={{ border: '1.5px solid', borderColor: statusFilter === val ? 'var(--primary)' : 'var(--border)' }}
              onClick={() => setStatusFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /> 加载中...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {statusFilter === 'confirmed' && (
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={selected.length > 0 && selected.length === records.filter(r => r.status === 'confirmed').length}
                        onChange={toggleSelectAll} />
                    </th>
                  )}
                  <th>员工</th>
                  <th>角色</th>
                  <th>客户</th>
                  <th>产品/服务</th>
                  <th>订单金额</th>
                  <th>佣金</th>
                  <th>状态</th>
                  <th>生成时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r._id}>
                    {statusFilter === 'confirmed' && (
                      <td>
                        <input type="checkbox" checked={selected.includes(r._id)} onChange={() => toggleSelect(r._id)} />
                      </td>
                    )}
                    <td>{r.staffId?.name || '未知'}</td>
                    <td>{ROLE_LABELS[r.role] || r.role}</td>
                    <td>
                      {r.patientId?.name || '--'}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.patientId?.phone}</div>
                    </td>
                    <td>{r.productName || r.orderId?.serviceName || '--'}</td>
                    <td>¥{r.orderAmount}</td>
                    <td style={{ color: 'var(--primary)', fontWeight: 700 }}>¥{r.commissionAmount}</td>
                    <td><span className={`badge ${(STATUS_META[r.status] || STATUS_META.pending).badge}`}>{(STATUS_META[r.status] || STATUS_META.pending).label}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtTime(r.createdAt)}</td>
                    <td>
                      <div className="status-actions">
                        {r.status === 'pending' && (
                          <>
                            <button className="btn btn-sm status-btn" style={{ borderColor: '#10B981', color: '#10B981', background: '#10B98112' }}
                              disabled={updating === r._id} onClick={() => confirm(r._id)}>审核通过</button>
                            <button className="btn btn-sm status-btn" style={{ borderColor: '#EF4444', color: '#EF4444', background: '#EF444412' }}
                              disabled={updating === r._id} onClick={() => reject(r._id)}>驳回</button>
                          </>
                        )}
                        {r.status === 'confirmed' && (
                          <button className="btn btn-sm status-btn" style={{ borderColor: '#3B82F6', color: '#3B82F6', background: '#3B82F612' }}
                            disabled={updating === r._id} onClick={() => pay(r._id)}>确认打款</button>
                        )}
                        {(r.status === 'paid' || r.status === 'cancelled') && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>无可操作</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={statusFilter === 'confirmed' ? 10 : 9}>
                    <div className="empty-state">
                      <div className="empty-state-icon">💰</div>
                      <div className="empty-state-text">暂无{statusFilter ? STATUS_META[statusFilter]?.label : ''}记录</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">第 {(page-1)*20+1}–{Math.min(page*20, total)} 条，共 {total} 条</div>
            <div className="pagination-btns">
              <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i
                if (p < 1 || p > totalPages) return null
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
