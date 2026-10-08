import React from 'react'

export default function AnnualVisitHandoff({ items = [] }) {
  if (items.length < 2) return null
  return <section style={{ padding: 15, borderRadius: 10, border: '1px solid #B9DDD0', background: '#F2F8F5', display: 'grid', gap: 8 }}>
    <b>年度方案 · 本次一站式就医全部事项</b>
    <div style={{ fontSize: 12, color: '#65776F' }}>以下为健康顾问的原计划交接；逐项向接诊医生核对，实际诊疗与开单以医生意见为准。</div>
    <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
      {items.map((item, index) => <li key={`${item.moduleKey}:${item.recordIndex}:${index}`}><b>{item.title}</b>
        {(item.department || item.expert) && <div>科室／专家：{[item.department, item.expert].filter(Boolean).join(' · ')}</div>}
        {item.reason && <div>就医原因：{item.reason}</div>}
        {item.basisSummary && <div>原计划依据：{item.basisSummary}</div>}
        {item.communicationContent && <div>沟通要点：{item.communicationContent}</div>}
        {item.goal && <div>管理目标：{item.goal}</div>}
        {item.precautions && <div>注意事项：{item.precautions}</div>}
      </li>)}
    </ol>
  </section>
}
