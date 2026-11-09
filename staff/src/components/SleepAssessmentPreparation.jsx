import React, { useState } from 'react'

// Original sleep intake: display saved responses without clinical scores.
export default function SleepAssessmentPreparation({ records = [] }) {
  const [history, setHistory] = useState(false)
  const completed = records.filter(row => row && row.completedAt)
    .slice().sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
  const rows = history ? completed : completed.slice(0, 1)
  return <section className="card" aria-labelledby="sleep-assessment-title" style={{ marginBottom: 16 }}>
    <div className="card-body">
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 id="sleep-assessment-title" className="card-title" style={{ margin: 0 }}>睡眠评估</h3>
      {completed.length > 1 && <button type="button" onClick={() => setHistory(!history)} aria-expanded={history}>{history ? '收起历史' : `历史记录（${completed.length}）`}</button>}
    </div>
    {!rows.length ? <p style={{ color: '#8AA89C', fontSize: 13, margin: '8px 0 0' }}>暂无睡眠评估记录</p> : rows.map((row, i) => <article key={row.id || i} style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E4ECE7' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' }}>
        <strong>{row.title || '睡眠评估问卷'}</strong>
        <span style={{ color: '#60786B', fontSize: 13 }}>填写时间：{new Date(row.completedAt).toLocaleString('zh-CN')}</span>
      </div>
      {row.answers?.length > 0 && <details><summary style={{ cursor: 'pointer' }}>查看原始答卷</summary>{row.answers.map((item, index) => <p key={index}><strong>{item.question}</strong><br />{item.answer ?? '未填写'}</p>)}</details>}
    </article>)}
    </div>
  </section>
}
