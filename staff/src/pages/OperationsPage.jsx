import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const DISEASE_COLOR = { '高血压':'#e74c3c', '糖尿病':'#e67e22', '高血脂':'#f39c12', '冠心病':'#c0392b', '慢阻肺':'#8e44ad', '骨质疏松':'#27ae60', '高尿酸':'#3498db', '脂肪肝':'#16a085' }

// 营收分类
const REV_CATEGORIES = [
  { key: 'familyDoctor', label: '家庭医生服务', icon: '🩺', color: '#1E6B50' },
  { key: 'nutrition',    label: '营养服务',     icon: '🥗', color: '#27ae60' },
  { key: 'medical',      label: '就医协助服务', icon: '🏥', color: '#0077B6' },
  { key: 'checkup',      label: '检测收费',     icon: '🔬', color: '#8e44ad' },
  { key: 'supplement',   label: '营养素补充',   icon: '💊', color: '#e67e22' },
]

const TIME_FILTERS = [
  { key: 'today', label: '今日' },
  { key: 'week',  label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all',   label: '全部' },
]

const fmt = (cents) => cents > 0 ? `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0 })}` : '¥0'

export default function OperationsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeFilter, setTimeFilter] = useState('month')

  useEffect(() => {
    setLoading(true)
    staffAPI.getOperationsDashboard()
      .then(r => setData(r.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading">加载中...</div>
  if (error) return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: '#DC3545' }}>⚠️ {error}</div></div>

  // 营收数据（后端暂未分类时显示模拟结构）
  const revByCategory = data?.revenueByCategory || {}
  const totalRev = data?.revenue?.total || 0
  const monthRev = data?.revenue?.thisMonth || 0

  // 导出 CSV
  const handleExport = () => {
    const rows = [
      ['营收类别', '金额(元)'],
      ...REV_CATEGORIES.map(c => [c.label, ((revByCategory[c.key] || 0) / 100).toFixed(2)]),
      ['合计', (totalRev / 100).toFixed(2)],
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

      {/* 营收细分 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">营收细分</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TIME_FILTERS.map(f => (
              <button key={f.key}
                className={`btn btn-sm ${timeFilter === f.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTimeFilter(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
            {REV_CATEGORIES.map(cat => {
              const amt = revByCategory[cat.key] || 0
              const pct = totalRev > 0 ? Math.round((amt / totalRev) * 100) : 0
              return (
                <div key={cat.key} style={{ textAlign: 'center', padding: '16px 8px', background: '#f9f7f3', borderRadius: 12 }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{cat.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: cat.color }}>{fmt(amt)}</div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 2 }}>{cat.label}</div>
                  <div style={{ marginTop: 8, height: 4, background: '#E0D9CE', borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: cat.color, borderRadius: 2, minWidth: amt > 0 ? 4 : 0 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{pct}%</div>
                </div>
              )
            })}
          </div>

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
    </div>
  )
}
