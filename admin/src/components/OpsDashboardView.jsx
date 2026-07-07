import React from 'react'

// 运营看板展示内容——对内(admin后台)和对外(独立展示链接)共用同一份UI和数据结构，
// 只有数据获取方式不同（分别在父组件里调用 adminAPI.opsDashboardInternal() 或公开接口）。

function StatCard({ label, value, sub, color = '#1E6B50' }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 180, padding: '20px 22px' }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function ChronicDiseaseBar({ items }) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1
  const COLORS = ['#1E6B50', '#0077B6', '#D97706', '#DC3545', '#7C3AED', '#22A06B', '#8AA89C', '#B0A99C', '#E91E63', '#059669']
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#1A2B24' }}>慢性病分布（Top 10）</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#aaa' }}>暂无数据</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item, i) => (
            <div key={item.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#4A6558', marginBottom: 4 }}>
                <span>{item.name}</span>
                <span>{item.count} 人（{Math.round((item.count / total) * 100)}%）</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: '#f0ede7' }}>
                <div style={{ height: '100%', borderRadius: 5, width: `${(item.count / total) * 100}%`, background: COLORS[i % COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewUserTrendChart({ items }) {
  const max = Math.max(1, ...items.map(i => i.count))
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: '#1A2B24' }}>近30天新增客户趋势</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#aaa' }}>暂无数据</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
          {items.map(d => (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${d.date}: ${d.count}人`}>
              <div style={{ width: '100%', maxWidth: 14, borderRadius: '3px 3px 0 0', background: '#1E6B50', height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 3 : 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OpsDashboardView({ data, lastUpdated }) {
  if (!data) return null
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatCard label="服务企业数" value={data.enterprises?.total ?? '-'} />
        <StatCard label="服务人数" value={data.users?.total ?? '-'} color="#0077B6" />
        <StatCard label="已激活人数" value={data.users?.activated ?? '-'} sub={`激活率 ${data.users?.activationRate ?? 0}%`} color="#22A06B" />
        <StatCard label="近7天新增" value={data.users?.new7d ?? '-'} color="#D97706" />
        <StatCard label="近30天新增" value={data.users?.new30d ?? '-'} color="#D97706" />
        <StatCard
          label="累计营收"
          value={`¥${(data.revenue?.total || 0).toLocaleString()}`}
          sub={`${data.revenue?.orderCount || 0} 笔已支付订单`}
          color="#7C3AED"
        />
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 340 }}>
          <ChronicDiseaseBar items={data.chronicDiseases || []} />
        </div>
        <div style={{ flex: 1, minWidth: 340 }}>
          <NewUserTrendChart items={data.dailyNewUsers || []} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 18, textAlign: 'center' }}>
        数据每次刷新自动更新 · 最后更新时间 {lastUpdated ? new Date(lastUpdated).toLocaleString('zh-CN') : '-'}
      </div>
    </div>
  )
}
