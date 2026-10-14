import React from 'react'
import { liverMarkerTrends } from '../utils/liverMarkerTrends.mjs'

export default function LiverMarkerTrends({ card }) {
  const groups = liverMarkerTrends(card)
  if (!groups.length) return null
  const result = point => `${point.value}${point.unit ? ` ${point.unit}` : ''}`
  return <div style={{ background: '#F8FBFA', border: '1px solid #D7E5DC', borderRadius: 8, padding: 10 }}>
    <b style={{ color: '#1E6B50' }}>肝炎与 AFP 指标变化</b>
    <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>按同名指标归组；数值变化不等于病情改善或恶化，检测方法需结合原报告核对。</div>
    {groups.map(group => <div key={group.name} style={{ borderTop: '1px solid #E2E8E5', marginTop: 8, paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <b>{group.name}</b><span style={{ color: '#47645A' }}>{group.trend}</span>
      </div>
      <div style={{ color: '#475569', marginTop: 3 }}>
        {group.points.length > 1 && <>首次 {group.first.date}：{result(group.first)}；</>}
        最近
        {group.last.date}：{result(group.last)}
      </div>
      <details style={{ marginTop: 4 }}>
        <summary style={{ color: '#64748B', cursor: 'pointer' }}>查看全部 {group.points.length} 次结果及参考范围</summary>
        {group.points.map((point, index) => <div key={index} style={{ padding: '4px 0', overflowWrap: 'anywhere' }}>
          {point.date} · {result(point)}<br />
          <span style={{ color: '#64748B' }}>{point.name}；参考范围：{point.referenceRange || '未记录'}</span>
        </div>)}
      </details>
    </div>)}
    {!groups.some(group => /丙肝|HCV/.test(group.name)) && <div style={{ color: '#64748B', marginTop: 8 }}>当前关联资料中未见丙肝抗体或 HCV-RNA 项目，请核对原报告。</div>}
  </div>
}
