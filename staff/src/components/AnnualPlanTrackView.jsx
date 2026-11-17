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
const grouped = new Set([...medical, ...management, ['年度体检', ['annual_checkup']]].flatMap(([, keys]) => keys))
const displayDate = value => value ? String(value).slice(0, 10) : '时间待确认'

export default function AnnualPlanTrackView({ actions, targets, renderAction, nutritionTask, nutritionEnabled, onNutrition, onConsensus, consensusTopics, canAddConsensus, consensusEditor, manualMonitoringEditor }) {
  const itemsFor = keys => actions.filter(action => keys.includes(action.key))
  const renderGroup = ([title, keys]) => {
    const items = itemsFor(keys).filter(action => action.key !== 'nutrition_assessment')
    const nutrition = keys.includes('nutrition_assessment') && (nutritionEnabled || actions.some(action => action.key === 'nutrition_assessment'))
    const consensus = keys.includes('health_consensus')
    const monitoring = title === '日常监测'
    if (!items.length && !nutrition && !consensus && !monitoring) return null
    return <div key={title} style={{ borderTop: '1px solid #E1EAE4', padding: '12px 0' }}>
      <strong style={{ fontSize: 15 }}>{title}</strong>
      {nutrition && <div style={{ marginTop: 8, fontSize: 13 }}>
        营养师评估{nutritionTask ? ' · 已派发' : ' · 待核对'}　
        <button type="button" className="btn btn-secondary btn-sm" onClick={onNutrition}>查看评估与干预</button>
      </div>}
      {items.map(action => <details key={`${action.key}:${action.index}`} style={{ marginTop: 8, border: '1px solid #E1EAE4', borderRadius: 8, padding: '10px 12px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          {action.title}　<span style={{ color: '#62776A', fontSize: 12, fontWeight: 400 }}>{action.key === 'specialist_collab' ? '多学科会诊 · ' : action.key === 'medical_treatment' ? '单学科门诊／进一步检查 · ' : ''}{displayDate(action.date)} · {action.issueId ? '已关联问题' : '来源与目标待核对'}</span>
        </summary>
        {renderAction(action)}
      </details>)}
      {consensus && <div style={{ marginTop: 9, fontSize: 13, color: '#52675D' }}>
        按客户关注点逐次沟通；本次完成后再定下一主题和时间。
        <details style={{ marginTop: 7 }}><summary style={{ cursor: 'pointer' }}>查看建议主题路径（可调整顺序）</summary>
          <ol style={{ paddingLeft: 22, marginBottom: 0 }}>{consensusTopics.map(topic => <li key={topic} style={{ margin: '5px 0' }}>{topic}</li>)}</ol>
        </details>
        {canAddConsensus && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 9 }} onClick={onConsensus}>＋ 安排当前沟通主题</button>}
        {consensusEditor}
      </div>}
    </div>
  }
  const unknown = actions.filter(action => !grouped.has(action.key) && action.key !== 'monitoring' && action.key !== 'management_targets')
  return <section id="annual-plan-content" aria-label="年度方案按服务线路查看" style={{ marginBottom: 16 }}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#1A2B24' }}>本年度管理方案</h2>
    <div style={{ fontSize: 13, color: '#62776A', marginBottom: 12 }}>管理问题 {targets.length} 项 · 年度行动 {actions.length} 项。一个问题可关联多条独立行动，各自跟进结果。</div>
    {targets.length === 0 && actions.length > 0 && <div role="status" style={{ padding: 10, borderRadius: 8, background: '#FFF5E8', color: '#8A5A18', fontSize: 13, marginBottom: 12 }}>历史方案尚未关联逐项管理目标。请先核对来源，再用于阶段评估。</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <div style={{ background: '#fff', border: '1px solid #C7DCCF', borderRadius: 12, padding: 14 }}><h3 style={{ margin: 0, fontSize: 18 }}>医疗服务</h3>{medical.map(renderGroup)}</div>
      <div style={{ background: '#fff', border: '1px solid #C7DCCF', borderRadius: 12, padding: 14 }}><h3 style={{ margin: 0, fontSize: 18 }}>健康管理</h3>{management.map(renderGroup)}
        <div style={{ borderTop: '1px solid #E1EAE4', padding: '12px 0', fontSize: 13 }}><strong style={{ fontSize: 15 }}>日常监测</strong><div style={{ marginTop: 6, color: '#52675D' }}>建档时已设置，沿现有每周监测接续。年度方案不重复建立监测任务。</div>{manualMonitoringEditor}</div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #C7DCCF', borderRadius: 12, padding: 14 }}><h3 style={{ margin: 0, fontSize: 18 }}>年度体检</h3>{renderGroup(['年度体检', ['annual_checkup']]) || <div style={{ marginTop: 12, fontSize: 13, color: '#62776A' }}>暂无已确认的年度体检安排</div>}</div>
    </div>
    {unknown.length > 0 && <details style={{ marginTop: 12, padding: 12, background: '#fff', border: '1px solid #E1EAE4', borderRadius: 9 }}><summary style={{ cursor: 'pointer' }}>其他既有安排 · {unknown.length} 项（待核对归类）</summary>{unknown.map(action => <div key={`${action.key}:${action.index}`}>{renderAction(action)}</div>)}</details>}
  </section>
}
