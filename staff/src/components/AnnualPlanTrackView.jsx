import React from 'react'

const medical = [
  ['专家就医与进一步检查', ['medical_treatment', 'specialist_collab']],
  ['完善检查', ['checkup_completion']],
  ['定期复查', ['abnormal_followup']],
]
const management = [
  ['营养干预', ['nutrition_assessment', 'nutrition_intervention']],
  ['运动复健', ['rehab_assessment']],
  ['疫苗接种', ['vaccine']],
  ['健康认知与共识', ['health_consensus']],
]
const displayDate = value => value ? String(value).slice(0, 10) : '时间待确认'
const conciseTitle = action => {
  if (action.key === 'annual_checkup') return '年度体检'
  const title = String(action.title || action.moduleName || '待核对事项').replace(/\s*（来源[:：][^）]+）/g, '').trim()
  return title.length > 72 ? `${title.slice(0, 72)}…` : title
}

export default function AnnualPlanTrackView({ actions, renderAction, nutritionTask, nutritionEnabled, nutritionMetrics = [], onNutrition, onConsensus, consensusTopics, canAddConsensus, consensusEditor, manualMonitoringEditor }) {
  const itemsFor = keys => actions.filter(action => keys.includes(action.key))
  const renderGroup = ([title, keys]) => {
    const items = itemsFor(keys).filter(action => action.key !== 'nutrition_assessment')
    const nutrition = keys.includes('nutrition_assessment') && (nutritionEnabled || actions.some(action => action.key === 'nutrition_assessment'))
    const consensus = keys.includes('health_consensus')
    if (!items.length && !nutrition && !consensus) return null
    const itemCount = items.length + (nutrition ? 1 : 0)
    return <div key={title} style={{ borderTop: '1px solid #E1EAE4', padding: '15px 0' }}>
      <strong style={{ fontSize: 16, color: '#183E30' }}>{title}</strong><span style={{ marginLeft: 8, fontSize: 12, color: '#71877B' }}>{itemCount ? `${itemCount} 项` : '待安排'}</span>
      {nutrition && <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
        <div>纳入数据：{nutritionMetrics.join('、') || '体重、骨骼肌、体脂率、内脏脂肪'}</div>
        <div>目标：由营养师评估后确定</div>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={onNutrition}>{nutritionTask ? '查看营养师任务' : '安排营养师评估'}</button>
      </div>}
      {items.map(action => <details key={`${action.key}:${action.index}`} style={{ marginTop: 9, border: '1px solid #E1EAE4', borderRadius: 10, padding: '11px 13px', background: '#FBFDFC' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, lineHeight: 1.55 }} title={action.title}>
          {conciseTitle(action)}<span style={{ display: 'block', color: '#62776A', fontSize: 12, fontWeight: 400 }}>{action.key === 'specialist_collab' ? '多学科会诊 · ' : action.key === 'medical_treatment' ? '门诊／检查 · ' : ''}{displayDate(action.date)}</span>
        </summary>
        {renderAction(action)}
      </details>)}
      {consensus && <div style={{ marginTop: 9, fontSize: 13, color: '#52675D' }}>
        按客户关注点逐次沟通，完成后再定下一主题。
        <details style={{ marginTop: 7 }}><summary style={{ cursor: 'pointer' }}>查看建议主题（在下方安排时勾选）</summary>
          <ol style={{ paddingLeft: 22, marginBottom: 0 }}>{consensusTopics.map(topic => <li key={topic} style={{ margin: '5px 0' }}>{topic}</li>)}</ol>
        </details>
        {canAddConsensus && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 9 }} onClick={onConsensus}>＋ 安排当前沟通主题</button>}
        {consensusEditor}
      </div>}
    </div>
  }
  return <section id="annual-plan-content" aria-label="年度方案按服务线路查看" style={{ marginBottom: 16 }}>
    <h2 style={{ margin: '0 0 12px', fontSize: 21, color: '#1A2B24' }}>年度管理方案</h2>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <div style={{ background: '#fff', border: '1px solid #C7DCCF', borderRadius: 14, padding: '18px 20px' }}><h3 style={{ margin: 0, fontSize: 19 }}>医疗服务</h3>{medical.map(renderGroup)}</div>
      <div style={{ background: '#fff', border: '1px solid #C7DCCF', borderRadius: 14, padding: '18px 20px' }}><h3 style={{ margin: 0, fontSize: 19 }}>健康管理</h3>{management.map(renderGroup)}
        <div style={{ borderTop: '1px solid #E1EAE4', padding: '12px 0', fontSize: 13 }}><strong style={{ fontSize: 15 }}>日常监测 · 按已有每周计划执行</strong>{manualMonitoringEditor}</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #C7DCCF', borderRadius: 14, padding: '18px 20px' }}><h3 style={{ margin: 0, fontSize: 19 }}>年度体检</h3>{renderGroup(['年度体检', ['annual_checkup']]) || <div style={{ marginTop: 12, fontSize: 13, color: '#62776A' }}>待安排</div>}</div>
    </div>
  </section>
}
