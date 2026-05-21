import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const DISEASE_COLOR = { '高血压':'#e74c3c', '糖尿病':'#e67e22', '高血脂':'#f39c12', '冠心病':'#c0392b', '慢阻肺':'#8e44ad', '骨质疏松':'#27ae60', '高尿酸':'#3498db', '脂肪肝':'#16a085' }

export default function OperationsPage() {
  const { staff } = useStaff()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    staffAPI.getOperationsDashboard()
      .then(r => setData(r.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page-loading">加载中...</div>
  if (error) return <div className="page"><div style={{ padding: 40, textAlign: 'center', color: '#DC3545' }}>⚠️ {error}</div></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">运营数据看板</h1>
          <p className="page-subtitle">实时业务数据概览</p>
        </div>
      </div>

      {/* 核心指标 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { icon: '👥', label: '患者总数', value: data?.patients?.total ?? '-', color: '#1E6B50' },
          { icon: '➕', label: '今日新增', value: data?.patients?.todayNew ?? '-', color: '#22A06B' },
          { icon: '📅', label: '本月新增', value: data?.patients?.monthNew ?? '-', color: '#0077B6' },
          { icon: '💰', label: '本月营收', value: data?.revenue?.thisMonth ? `¥${(data.revenue.thisMonth / 100).toLocaleString()}` : '-', color: '#D97706' },
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 慢病分布 */}
        <div className="card">
          <div className="card-header"><div className="card-title">慢病患者分布</div></div>
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

        {/* 营收统计 */}
        <div className="card">
          <div className="card-header"><div className="card-title">营收统计</div></div>
          <div className="card-body">
            {[
              { label: '累计总营收', value: data?.revenue?.total ? `¥${(data.revenue.total / 100).toLocaleString()}` : '¥0', color: '#1E6B50', big: true },
              { label: '本月营收', value: data?.revenue?.thisMonth ? `¥${(data.revenue.thisMonth / 100).toLocaleString()}` : '¥0', color: '#D97706', big: true },
              { label: '总订单数', value: data?.revenue?.orderCount ?? 0, color: '#4A6558', big: false },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f5f2ec' }}>
                <span style={{ color: '#8AA89C', fontSize: 14 }}>{item.label}</span>
                <span style={{ fontWeight: 700, fontSize: item.big ? 20 : 16, color: item.color }}>{item.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: '10px 14px', background: '#f9f7f3', borderRadius: 8, fontSize: 12, color: '#8AA89C' }}>
              💡 营收数据实时统计，仅包含已支付订单。更多维度报表导出功能将在后续版本上线。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
