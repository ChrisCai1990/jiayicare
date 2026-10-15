import React from 'react'
import { liverMarkerTrends } from '../utils/liverMarkerTrends.mjs'

export default function LiverMarkerTrends({ card }) {
  const groups = liverMarkerTrends(card)
  if (!groups.length) return null
  const result = point => `${point.value}${point.unit ? ` ${point.unit}` : ''}`
  return <div style={{ background: '#F8FBFA', border: '1px solid #D7E5DC', borderRadius: 8, padding: 10 }}>
    <b style={{ color: '#1E6B50' }}>肝炎与 AFP 指标变化</b>
    <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>逐年列出关联结果。日期可能沿用整份报告日期，记录条数不代表检查次数；数值变化不等于病情变化。</div>
    {groups.map(group => <div key={group.name} style={{ borderTop: '1px solid #E2E8E5', marginTop: 8, paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <b>{group.name}</b><span style={{ color: '#47645A' }}>{group.trend}</span>
      </div>
      {group.datedResults.map(row => <div key={row.date} style={{ color: '#475569', marginTop: 5, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <b>{row.date}</b><span>{row.results.map(result).join(' / ')}</span>
        {row.needsDateReview && <span style={{ color: '#92400E' }}>此日期下有不同记录，请核对原件日期</span>}
      </div>)}
      <details style={{ marginTop: 4 }}>
        <summary style={{ color: '#64748B', cursor: 'pointer' }}>查看来源记录、页码及参考范围</summary>
        {group.points.map((point, index) => <div key={index} style={{ padding: '4px 0', overflowWrap: 'anywhere' }}>
          {point.date} · {result(point)}<br />
          <span style={{ color: '#64748B' }}>{point.name}；原报告{point.sourcePage ? `第 ${point.sourcePage} 页` : '页码未记录'}；参考范围：{point.referenceRange || '未记录'}</span>
        </div>)}
      </details>
    </div>)}
    {!groups.some(group => /丙肝|HCV/.test(group.name)) && <div style={{ color: '#64748B', marginTop: 8 }}>当前关联资料中未见丙肝抗体或 HCV-RNA 项目，请核对原报告。</div>}
  </div>
}
