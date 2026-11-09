import React, { useState } from 'react'

// Read-only result view. No PSQI producer/scoring or push is enabled yet.
// records will be connected to persisted, completed questionnaire results.
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
        <strong>匹兹堡睡眠质量指数（PSQI）</strong>
        <span style={{ color: '#60786B', fontSize: 13 }}>填写时间：{new Date(row.completedAt).toLocaleString('zh-CN')}</span>
      </div>
      <p>总分：{Number.isFinite(row.totalScore) ? row.totalScore : '未生成'}{row.summary ? ` · ${row.summary}` : ''}</p>
      {row.components?.length > 0 && <dl style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>{row.components.map(item => <div key={item.key || item.name}><dt style={{ color: '#60786B' }}>{item.name}</dt><dd style={{ margin: 0 }}>{Number.isFinite(item.score) ? item.score : '—'}</dd></div>)}</dl>}
      {row.answers?.length > 0 && <details><summary style={{ cursor: 'pointer' }}>查看原始答卷</summary>{row.answers.map((item, index) => <p key={index}><strong>{item.question}</strong><br />{item.answer ?? '未填写'}</p>)}</details>}
    </article>)}
    </div>
  </section>
}
