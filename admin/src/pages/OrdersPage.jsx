import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useToast } from '../App'

const STATUS_META = {
  pending:   { label: '待联系', badge: 'badge-yellow', next: ['scheduled', 'cancelled'] },
  scheduled: { label: '已安排', badge: 'badge-blue',   next: ['completed', 'cancelled'] },
  completed: { label: '已完成', badge: 'badge-green',  next: [] },
  cancelled: { label: '已取消', badge: 'badge-gray',   next: [] },
}
const STATUS_LABELS = { scheduled: '标记已安排', completed: '标记完成', cancelled: '取消订单' }
const STATUS_COLORS = { scheduled: '#3B82F6', completed: '#10B981', cancelled: '#EF4444' }
const PAYMENT_METHOD_LABELS = { wechat: '微信支付', alipay: '支付宝', onsite: '到店支付', healthFund: '健康基金抵扣' }
const PAY_STATUS_META = { unpaid: { label: '未支付', badge: 'badge-gray' }, paid: { label: '已支付', badge: 'badge-green' }, refunded: { label: '已退款', badge: 'badge-yellow' } }

export default function OrdersPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null) // orderId being updated
  const [payModalOrder, setPayModalOrder] = useState(null)
  const [payMethod, setPayMethod] = useState('wechat')
  const [verifyModalOrder, setVerifyModalOrder] = useState(null)
  const [verifyInput, setVerifyInput] = useState('')
  const [attrModalOrder, setAttrModalOrder] = useState(null)
  const [attrForm, setAttrForm] = useState({ referrerId: '', fulfillerId: '' })
  const [staffOptions, setStaffOptions] = useState([])

  useEffect(() => {
    adminAPI.staffList({ limit: 200 }).then(r => setStaffOptions(r.data || [])).catch(() => {})
  }, [])

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = { page: p, limit: pageSize }
      if (statusFilter) params.status = statusFilter
      if (search) params.search = search
      const res = await adminAPI.orders(params)
      setOrders(res.data)
      setTotal(res.total)
    } catch {}
    finally { setLoading(false) }
  }, [statusFilter, page, pageSize, search])

  useEffect(() => { setPage(1); load(1) }, [statusFilter, pageSize, search])

  const updateStatus = async (orderId, status) => {
    setUpdating(orderId)
    try {
      await adminAPI.updateOrderStatus(orderId, status)
      toast(`✅ 订单已更新为：${STATUS_META[status]?.label || status}`)
      await load(page)
    } catch (err) {
      toast('❌ ' + (err.message || '更新失败'))
    } finally { setUpdating(null) }
  }

  const confirmPay = async () => {
    if (!payModalOrder) return
    setUpdating(payModalOrder._id)
    try {
      const res = await adminAPI.payOrder(payModalOrder._id, payMethod, payModalOrder.servicePrice)
      toast('✅ ' + res.message)
      setPayModalOrder(null)
      await load(page)
    } catch (err) {
      toast('❌ ' + (err.message || '标记支付失败'))
    } finally { setUpdating(null) }
  }

  const confirmVerify = async () => {
    if (!verifyModalOrder) return
    setUpdating(verifyModalOrder._id)
    try {
      const res = await adminAPI.verifyOrder(verifyModalOrder._id, verifyInput)
      toast('✅ ' + res.message)
      setVerifyModalOrder(null); setVerifyInput('')
      await load(page)
    } catch (err) {
      toast('❌ ' + (err.message || '核销失败'))
    } finally { setUpdating(null) }
  }

  const confirmAttribution = async () => {
    if (!attrModalOrder) return
    setUpdating(attrModalOrder._id)
    try {
      await adminAPI.setOrderAttribution(attrModalOrder._id, attrForm.referrerId || null, attrForm.fulfillerId || null)
      toast('✅ 绩效归属已设置')
      setAttrModalOrder(null)
      await load(page)
    } catch (err) {
      toast('❌ ' + (err.message || '设置失败'))
    } finally { setUpdating(null) }
  }

  const totalPages = Math.ceil(total / pageSize)
  const fmtTime = (d) => d ? new Date(d).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📋 订单管理</div>
          <div className="page-sub">共 {total} 条订单</div>
        </div>
      </div>

      <div className="card">
        {/* 状态筛选 */}
        <div className="search-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['', '全部'], ['pending', '待联系'], ['scheduled', '已安排'], ['completed', '已完成'], ['cancelled', '已取消']].map(([val, label]) => (
            <button
              key={val}
              className={`btn ${statusFilter === val ? 'btn-primary' : 'btn-ghost'}`}
              style={{ border: '1.5px solid', borderColor: statusFilter === val ? 'var(--primary)' : 'var(--border)' }}
              onClick={() => setStatusFilter(val)}
            >
              {label}
            </button>
          ))}
          <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }}
              placeholder="搜索患者姓名/手机/服务名称..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1) } }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => { setSearch(searchInput); setPage(1) }}>搜索</button>
            {search && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}>清除</button>}
          </div>
          <select
            style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }}
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={30}>30条/页</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /> 加载中...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>患者</th>
                  <th>服务项目</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>支付</th>
                  <th>备注</th>
                  <th>下单时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const sm = STATUS_META[o.status] || STATUS_META.pending
                  const nextActions = sm.next
                  return (
                    <tr key={o._id}>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 0, color: 'var(--primary)', fontWeight: 700 }}
                          onClick={() => nav(`/patients/${o.user?._id}`)}
                        >
                          {o.user?.name || '未知患者'}
                        </button>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.user?.phone}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 18 }}>{o.serviceIcon || '🏥'}</span>
                          <strong>{o.serviceName}</strong>
                        </div>
                      </td>
                      <td style={{ color: 'var(--primary)', fontWeight: 700 }}>¥{o.servicePrice}</td>
                      <td><span className={`badge ${sm.badge}`}>{sm.label}</span></td>
                      <td>
                        <span className={`badge ${(PAY_STATUS_META[o.paymentStatus] || PAY_STATUS_META.unpaid).badge}`}>
                          {(PAY_STATUS_META[o.paymentStatus] || PAY_STATUS_META.unpaid).label}
                        </span>
                        {o.paymentStatus === 'paid' && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {PAYMENT_METHOD_LABELS[o.paymentMethod] || o.paymentMethod}
                            {!o.verifiedAt && o.verifyCode && <div>核销码：{o.verifyCode}</div>}
                            {o.verifiedAt && <div style={{ color: 'var(--primary)' }}>已核销</div>}
                          </div>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12, maxWidth: 160 }}>
                        {o.note ? <span title={o.note}>{o.note.slice(0, 30)}{o.note.length > 30 ? '...' : ''}</span> : '--'}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtTime(o.createdAt)}</td>
                      <td>
                        <div className="status-actions">
                          {o.paymentStatus === 'unpaid' && (
                            <button className="btn btn-sm status-btn" style={{ borderColor: '#10B981', color: '#10B981', background: '#10B98112' }}
                              disabled={updating === o._id} onClick={() => { setPayModalOrder(o); setPayMethod('wechat') }}>
                              标记已支付
                            </button>
                          )}
                          {!o.verifiedAt && (
                            <button className="btn btn-sm status-btn" style={{ borderColor: '#8B5CF6', color: '#8B5CF6', background: '#8B5CF612' }}
                              disabled={updating === o._id}
                              onClick={() => { setAttrModalOrder(o); setAttrForm({ referrerId: o.referrerId?._id || o.referrerId || '', fulfillerId: o.fulfillerId?._id || o.fulfillerId || '' }) }}>
                              绩效归属
                            </button>
                          )}
                          {o.paymentStatus === 'paid' && !o.verifiedAt && (
                            <button className="btn btn-sm status-btn" style={{ borderColor: '#3B82F6', color: '#3B82F6', background: '#3B82F612' }}
                              disabled={updating === o._id} onClick={() => { setVerifyModalOrder(o); setVerifyInput('') }}>
                              核销
                            </button>
                          )}
                          {nextActions.map(s => (
                            <button
                              key={s}
                              className="btn btn-sm status-btn"
                              style={{ borderColor: STATUS_COLORS[s], color: STATUS_COLORS[s], background: STATUS_COLORS[s] + '12' }}
                              disabled={updating === o._id}
                              onClick={() => updateStatus(o._id, s)}
                            >
                              {updating === o._id ? '...' : STATUS_LABELS[s]}
                            </button>
                          ))}
                          {nextActions.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>无可操作</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {orders.length === 0 && (
                  <tr><td colSpan={8}>
                    <div className="empty-state">
                      <div className="empty-state-icon">📋</div>
                      <div className="empty-state-text">暂无{statusFilter ? STATUS_META[statusFilter]?.label : ''}订单</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <div className="pagination-info">第 {(page-1)*pageSize+1}–{Math.min(page*pageSize, total)} 条，共 {total} 条</div>
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

      {payModalOrder && (
        <div className="modal-overlay" onClick={() => setPayModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">标记已支付</h3>
              <button className="modal-close" onClick={() => setPayModalOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {payModalOrder.serviceName} · ¥{payModalOrder.servicePrice}
              </div>
              <div className="form-group">
                <label className="form-label">支付方式</label>
                <select className="form-input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                暂未接入真实支付网关，此操作为人工确认已收到款项，确认后将生成核销码
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPayModalOrder(null)}>取消</button>
              <button className="btn btn-primary" onClick={confirmPay} disabled={updating === payModalOrder._id}>
                {updating === payModalOrder._id ? '处理中...' : '确认已支付'}
              </button>
            </div>
          </div>
        </div>
      )}

      {attrModalOrder && (
        <div className="modal-overlay" onClick={() => setAttrModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">设置绩效归属</h3>
              <button className="modal-close" onClick={() => setAttrModalOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {attrModalOrder.serviceName}
              </div>
              <div className="form-group">
                <label className="form-label">转介绍人（引流下单的人）</label>
                <select className="form-input" value={attrForm.referrerId} onChange={e => setAttrForm(f => ({ ...f, referrerId: e.target.value }))}>
                  <option value="">无</option>
                  {staffOptions.map(s => <option key={s._id} value={s._id}>{s.name}（{s.role}）</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">服务人（实际提供服务的医护）</label>
                <select className="form-input" value={attrForm.fulfillerId} onChange={e => setAttrForm(f => ({ ...f, fulfillerId: e.target.value }))}>
                  <option value="">无</option>
                  {staffOptions.map(s => <option key={s._id} value={s._id}>{s.name}（{s.role}）</option>)}
                </select>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                核销后系统会按该产品/服务预设的绩效规则，自动为归属人生成待结算佣金；
                <span style={{ color: '#D97706', fontWeight: 600 }}>转介绍人/服务人都不填则不会生成任何绩效记录</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setAttrModalOrder(null)}>取消</button>
              <button className="btn btn-primary" onClick={confirmAttribution} disabled={updating === attrModalOrder._id}>
                {updating === attrModalOrder._id ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {verifyModalOrder && (
        <div className="modal-overlay" onClick={() => setVerifyModalOrder(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">到店核销</h3>
              <button className="modal-close" onClick={() => setVerifyModalOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {verifyModalOrder.serviceName} · 核销码：{verifyModalOrder.verifyCode}
              </div>
              <div className="form-group">
                <label className="form-label">请输入客户出示的核销码</label>
                <input className="form-input" value={verifyInput} onChange={e => setVerifyInput(e.target.value.toUpperCase())}
                  placeholder="8位核销码" style={{ fontFamily: 'monospace', letterSpacing: 1 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setVerifyModalOrder(null)}>取消</button>
              <button className="btn btn-primary" onClick={confirmVerify} disabled={updating === verifyModalOrder._id}>
                {updating === verifyModalOrder._id ? '核销中...' : '确认核销'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
