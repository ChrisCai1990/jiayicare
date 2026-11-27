import React from 'react'
import dispatch from '../../../shared/annualDispatch.cjs'
import AnnualPlanSection from './AnnualPlanSection'
import nutritionCatalog from '../../../shared/annualNutritionAdvisorTargets.cjs'

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
  if (action.key === 'medical_treatment' && action.record.department) return `前往${action.record.department}就诊`
  if (action.key === 'abnormal_followup' && action.record.reviewItems?.length) return `复查${action.record.reviewItems.join('、')}`
  const title = String(action.title || action.moduleName || '待核对事项').replace(/\s*（来源[:：][^）]+）/g, '').trim()
  return title.length > 72 ? `${title.slice(0, 72)}…` : title
}

export default function AnnualPlanTrackView({ actions, renderAction, goalForAction, nutritionEnabled, nutritionScreeningIssues = [], nutritionAdvisorTargets = [], nutritionExecutionDate, nutritionExecutorName, nutritionTask, nutritionTaskLoading, canEditNutrition, onNutrition, nutritionAdvisorEditor, onConsensus, canAddConsensus, consensusEditor, monitoringRecords = [], latestCheckupDate = '', onEditItem }) {
  const itemsFor = keys => actions.filter(action => keys.includes(action.key))
  const renderGroup = ([title, keys]) => {
    const items = itemsFor(keys).filter(action => action.key !== 'nutrition_assessment')
    const nutrition = keys.includes('nutrition_assessment') && (nutritionEnabled || actions.some(action => action.key === 'nutrition_assessment'))
    const consensus = keys.includes('health_consensus')
    if (!items.length && !nutrition && !consensus) return null
    const itemCount = items.length + (nutrition ? 1 : 0)
    return <div key={title} style={{ borderTop: title === '年度体检' ? 0 : '1px solid #E1EAE4', padding: '15px 0' }}>
      {title !== '年度体检' && <><strong style={{ fontSize: 16, color: '#183E30' }}>{title}</strong><span style={{ marginLeft: 8, fontSize: 12, color: '#71877B' }}>{itemCount ? `${itemCount} 项` : '待安排'}</span></>}
      {nutrition && <details style={{ marginTop: 9, border: '1px solid #E1EAE4', borderRadius: 10, padding: '11px 13px', background: '#FBFDFC', fontSize: 13, lineHeight: 1.7 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>营养干预<span style={{ display: 'block', color: '#62776A', fontSize: 12, fontWeight: 400 }}>目标：明确异常指标与症状，按顾问确认的目标实施干预</span></summary>
        {nutritionScreeningIssues.length > 0 && <div style={{ color: '#365E4C', margin: '8px 0' }}>本次合并评估：{nutritionScreeningIssues.map(row => row.sourceTitle).filter(Boolean).join('、')}</div>}
        {nutritionAdvisorTargets.length ? <div className="annual-nutrition-advisor-summary">{[['metric', '异常指标'], ['symptom', '症状']].map(([kind, label]) => {
          const rows = nutritionAdvisorTargets.filter(row => (row.kind || nutritionCatalog.kindFor(row.metric)) === kind)
          return rows.length ? <div key={kind}><strong className="annual-nutrition-group-title">{label}</strong>{rows.map((row, index) => <div className="annual-nutrition-summary-row" key={`${row.metric}:${index}`}><strong>{row.metric}{nutritionCatalog.isInternalNutritionMetric(row.metric) && <small> · 仅内部</small>}</strong><span>当前：{row.baseline || '待核对'}</span><span>目标：{row.target}</span></div>)}</div> : null
        })}</div> : <div style={{ color: '#62776A' }}>待顾问明确异常指标、症状和期望目标</div>}
        <div style={{ color: '#52675D' }}>下一步：营养师核对饮食、生活方式和相关指标，制定具体干预方案。</div>
        <div style={{ color: '#52675D' }}>计划日期：{nutritionExecutionDate || '待确定'} · 执行营养师：{nutritionExecutorName || '待匹配'}</div>
        <div style={{ color: '#52675D' }}>任务状态：{nutritionTaskLoading ? '核对中' : nutritionTask ? nutritionTask.status === 'completed' ? '已完成' : '已派发给营养师' : '尚未派发'}</div>
        {onNutrition && (nutritionTask || canEditNutrition) && <button type="button" className="btn btn-secondary btn-sm" onClick={onNutrition} disabled={nutritionTaskLoading}>{nutritionTask ? '查看营养师任务' : '编辑营养安排'}</button>}
        {nutritionAdvisorEditor}
      </details>}
      {items.map(action => <details key={`${action.key}:${action.index}`} style={{ marginTop: 9, border: '1px solid #E1EAE4', borderRadius: 10, padding: '11px 13px', background: '#FBFDFC' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, lineHeight: 1.55 }} title={action.title}>
          {conciseTitle(action)}
          <span style={{ display: 'block', color: '#365E4C', fontSize: 12, fontWeight: 400 }}>安排时间：{displayDate(action.date)}{action.record.frequency ? ` · ${action.record.frequency}` : ''}</span>
          {(action.record.hospital || action.record.institution || action.record.department) && <span style={{ display: 'block', color: '#365E4C', fontSize: 12, fontWeight: 400 }}>就诊地点：{[action.record.hospital || action.record.institution, action.record.department].filter(Boolean).join(' · ')}</span>}
          {(action.record.reason || action.record.items || action.record.reviewItems?.length) && <span style={{ display: 'block', color: '#365E4C', fontSize: 12, fontWeight: 400 }}>要做什么：{action.record.reason || action.record.items || action.record.reviewItems.join('、')}</span>}
          {goalForAction?.(action) && <span style={{ display: 'block', color: '#365E4C', fontSize: 12, fontWeight: 400 }}>希望达到：{goalForAction(action)}</span>}
          {action.record.serviceMode && <span style={{ display: 'block', color: '#365E4C', fontSize: 12, fontWeight: 400 }}>服务安排：{{ reminder: '提醒您自行安排', single: dispatch.labels[action.record.serviceType] || '协助安排单项服务', managed: '全程协助' }[action.record.serviceMode] || '待确认'}</span>}
        </summary>
        {renderAction(action)}
        {onEditItem && ['vaccine', 'health_consensus', 'annual_checkup'].includes(action.key) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditItem(action.key, action.index)}>修改安排</button>}
      </details>)}
      {consensus && <div style={{ marginTop: 9, fontSize: 13, color: '#52675D' }}>
        按客户关注点逐次沟通，完成后再定下一主题。
        {canAddConsensus && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 9 }} onClick={onConsensus}>＋ 安排当前沟通主题</button>}
        {consensusEditor}
      </div>}
    </div>
  }
  return <section id="annual-plan-content" aria-label="年度方案按服务线路查看" style={{ marginBottom: 16 }}>
    <h2 style={{ margin: '0 0 12px', fontSize: 21, color: '#1A2B24' }}>年度管理方案</h2>
    <div className="annual-track-stack">
      <AnnualPlanSection section="medical">{medical.map(renderGroup)}</AnnualPlanSection>
      <AnnualPlanSection section="management">{management.map(group => group[0] === '疫苗接种' && !itemsFor(group[1]).length ? <div key="vaccine-review" style={{ borderTop: '1px solid #E1EAE4', padding: '15px 0', fontSize: 13, color: '#62776A' }}><strong style={{ fontSize: 16, color: '#183E30' }}>疫苗接种</strong><div style={{ marginTop: 5 }}>当前方案未纳入接种事项；需核对接种史、检查结果和适宜性后决定。</div>{onEditItem && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditItem('vaccine')}>添加接种安排</button>}</div> : renderGroup(group))}
        <div style={{ borderTop: '1px solid #E1EAE4', padding: '12px 0', fontSize: 13 }}><strong style={{ fontSize: 15 }}>日常监测 · {monitoringRecords.length ? '按年度方案选定项目执行' : '按已有基础计划执行'}</strong>{monitoringRecords.length > 0 && <div style={{ marginTop: 6 }}>{monitoringRecords.map((row, index) => <div key={index}>{row.items}{row.measurementPeriod && ` · ${row.measurementPeriod}`} · {row.frequency || '周期待确认'}</div>)}</div>}</div>
      </AnnualPlanSection>
      <AnnualPlanSection section="checkup">{renderGroup(['年度体检', ['annual_checkup']]) || <div style={{ marginTop: 12, fontSize: 13, color: '#62776A', lineHeight: 1.7 }}>
        <div>本方案尚未纳入下一次年度体检安排。{latestCheckupDate ? `已审核的最近一次完整体检日期：${latestCheckupDate}。` : ''}</div>
        <div>下次体检日期：待安排 · 体检机构：待确认 · 服务方式：待选择</div>
        {onEditItem && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => onEditItem('annual_checkup')}>＋ 安排下一年度体检随访</button>}
      </div>}</AnnualPlanSection>
    </div>
  </section>
}
