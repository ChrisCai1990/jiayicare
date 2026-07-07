import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const DISEASE_COLOR = { '高血压':'#e74c3c', '糖尿病':'#e67e22', '高血脂':'#f39c12', '冠心病':'#c0392b', '慢阻肺':'#8e44ad', '骨质疏松':'#27ae60', '高尿酸':'#3498db', '脂肪肝':'#16a085' }

// 订单类型（对应 Order.orderType，营收来自真实支付确认 paymentStatus:'paid'）
const ORDER_TYPE_META = {
  service: { label: '单项服务', icon: '🩺', color: '#1E6B50' },
  package: { label: '服务包',   icon: '📦', color: '#0077B6' },
  product: { label: '商城产品', icon: '🏪', color: '#8e44ad' },
}

const ROLE_LABELS = { referrer: '转介绍人', fulfiller: '服务人' }

const fmt = (yuan) => `¥${(yuan || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0 })}`

export default function OperationsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    staffAPI.getOperationsDashboard()
      .then(r => setData(r.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading">加载中...</div>
  if (error) return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: '#DC3545' }}>⚠️ {error}</div></div>

  const revByCategory = data?.revenueByCategory || []
  const totalRev = data?.revenue?.total || 0
  const monthRev = data?.revenue?.thisMonth || 0
  const commission = data?.commissionOverview || { pendingAmount: 0, pendingCount: 0, confirmedAmount: 0, confirmedCount: 0, paidAmount: 0, paidCount: 0 }
  const teamPerformance = data?.teamPerformance || []

  // 导出 CSV
  const handleExport = () => {
    const rows = [
      ['营收类别', '金额(元)', '订单数'],
      ...revByCategory.map(c => [ORDER_TYPE_META[c.orderType]?.label || c.orderType, c.total.toFixed(2), c.count]),
      ['合计', totalRev.toFixed(2), data?.revenue?.orderCount ?? 0],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `营收报表_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">运营数据看板</h1>
          <p className="page-subtitle">实时业务数据概览</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>📥 导出报表</button>
      </div>

      {/* 核心指标卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { icon: '👥', label: '会员总数',  value: data?.patients?.total ?? '-', color: '#1E6B50' },
          { icon: '➕', label: '今日新增',  value: data?.patients?.todayNew ?? '-', color: '#22A06B' },
          { icon: '📅', label: '本月新增',  value: data?.patients?.monthNew ?? '-', color: '#0077B6' },
          { icon: '💰', label: '本月营收',  value: fmt(monthRev), color: '#D97706' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: card.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{card.icon}</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 12, color: '#8AA89C' }}>{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 营收细分（基于真实支付确认，非订单流程状态） */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">营收细分</div>
        </div>
        <div className="card-body">
          {revByCategory.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${revByCategory.length}, 1fr)`, gap: 16, marginBottom: 20 }}>
              {revByCategory.map(cat => {
                const meta = ORDER_TYPE_META[cat.orderType] || { label: cat.orderType, icon: '📦', color: '#4A6558' }
                const pct = totalRev > 0 ? Math.round((cat.total / totalRev) * 100) : 0
                return (
                  <div key={cat.orderType} style={{ textAlign: 'center', padding: '16px 8px', background: '#f9f7f3', borderRadius: 12 }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{meta.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: meta.color }}>{fmt(cat.total)}</div>
                    <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 2 }}>{meta.label}（{cat.count}单）</div>
                    <div style={{ marginTop: 8, height: 4, background: '#E0D9CE', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: 2, minWidth: cat.total > 0 ? 4 : 0 }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{pct}%</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#aaa', padding: '20px 0' }}>暂无已支付订单数据</div>
          )}

          {/* 汇总行 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E0D9CE', paddingTop: 16 }}>
            {[
              { label: '累计总营收', value: fmt(totalRev), color: '#1E6B50', big: true },
              { label: '本月营收',   value: fmt(monthRev), color: '#D97706', big: true },
              { label: '总订单数',   value: data?.revenue?.orderCount ?? 0, color: '#4A6558', big: false },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: item.big ? 22 : 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 慢病分布 */}
      <div className="card">
        <div className="card-header"><div className="card-title">慢病会员分布</div></div>
        <div className="card-body">
          {data?.diseaseDistribution?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.diseaseDistribution.map(d => (
                <div key={d.disease} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ background: DISEASE_COLOR[d.disease] || '#1E6B50', color: '#fff', padding: '2px 12px', borderRadius: 99, fontSize: 12, minWidth: 72, textAlign: 'center' }}>{d.disease}</span>
                  <div style={{ flex: 1, height: 10, background: '#f0f0f0', borderRadius: 5 }}>
                    <div style={{ width: `${Math.min(100, (d.count / (data.patients?.total || 1)) * 100)}%`, height: '100%', background: DISEASE_COLOR[d.disease] || '#1E6B50', borderRadius: 5, minWidth: 4, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#4A6558', minWidth: 40, textAlign: 'right' }}>{d.count}人</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#aaa', padding: '20px 0' }}>暂无慢病数据</div>
          )}
        </div>
      </div>

      {/* 佣金结算概览 */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div className="card-title">佣金结算概览</div></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: '待审核', amount: commission.pendingAmount, count: commission.pendingCount, color: '#D97706' },
              { label: '待打款', amount: commission.confirmedAmount, count: commission.confirmedCount, color: '#0077B6' },
              { label: '已打款', amount: commission.paidAmount, count: commission.paidCount, color: '#22A06B' },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center', padding: '16px 8px', background: '#f9f7f3', borderRadius: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{fmt(item.amount)}</div>
                <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 4 }}>{item.label}（{item.count}条）</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 团队绩效排名 */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header"><div className="card-title">团队绩效排名</div></div>
        <div className="card-body">
          {teamPerformance.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teamPerformance.map((t, i) => (
                <div key={`${t.staffId}-${t.role}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 24, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#D97706' : '#8AA89C' }}>{i + 1}</span>
                  <span style={{ minWidth: 90, fontWeight: 600, color: '#1A2B24' }}>{t.staffName}</span>
                  <span style={{ fontSize: 11, color: '#fff', background: t.role === 'referrer' ? '#0077B6' : '#8e44ad', padding: '2px 8px', borderRadius: 99 }}>
                    {ROLE_LABELS[t.role] || t.role}
                  </span>
                  <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 4 }}>
                    <div style={{
                      width: `${teamPerformance[0]?.totalAmount ? Math.min(100, (t.totalAmount / teamPerformance[0].totalAmount) * 100) : 0}%`,
                      height: '100%', background: '#1E6B50', borderRadius: 4, minWidth: t.totalAmount > 0 ? 4 : 0,
                    }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1E6B50', minWidth: 80, textAlign: 'right' }}>{fmt(t.totalAmount)}</span>
                  <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 44, textAlign: 'right' }}>{t.orderCount}单</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#aaa', padding: '20px 0' }}>暂无绩效数据</div>
          )}
        </div>
      </div>
    </div>
  )
}
