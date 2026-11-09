import React from 'react'

// Preparation only: no questionnaire, clinical score, API write or push is enabled.
export default function SleepAssessmentPreparation() {
  return <section className="card" aria-labelledby="sleep-assessment-title" style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
      <h3 id="sleep-assessment-title" style={{ margin: 0, color: '#174B3B' }}>睡眠评估</h3>
      <span style={{ background: '#FFF4DB', color: '#805B15', padding: '4px 10px', borderRadius: 16, fontSize: 13 }}>PSQI 待启用</span>
    </div>
    <p style={{ color: '#4A6558', lineHeight: 1.7 }}>匹兹堡睡眠质量指数（PSQI）计划用于首次建档睡眠评估。正式中文版及使用授权尚未确认，当前暂不能填写、推送或写入档案。</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {['推送客户填写', '医护协助录入'].map(label => <button key={label} type="button" disabled title="正式版本及授权确认后开放" style={{ padding: '9px 16px', border: '1px solid #D2DDD7', borderRadius: 8, background: '#F2F5F3', color: '#68796E', cursor: 'not-allowed' }}>{label}</button>)}
    </div>
    <details style={{ marginTop: 16, color: '#4A6558', fontSize: 14, lineHeight: 1.8 }}>
      <summary style={{ cursor: 'pointer' }}>查看拟启用流程</summary>
      <p>与成人健康档案问卷同期推送 → 客户填写或医护协助记录原始回答 → 健管专员审核 → 形成睡眠评估记录并写入档案。</p>
      <p>协助录入需保留实际填写人、录入人、填写时间及原始回答；退回后修订再审核，保留全部版本。</p>
      <p>既有嗜睡量表及答卷继续按原名称保存，不转换为 PSQI 分数。</p>
    </details>
  </section>
}
