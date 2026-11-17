import React, { useState } from 'react'
import { managementReviewAPI } from '../api'

const dimensions = { data: '数据', symptom: '症状', lifestyle: '生活方式' }
const recordLabels = { symptom: '不适主诉', diet: '饮食', exercise: '运动', sleep: '睡眠', smoking: '吸烟', alcohol: '饮酒', mood: '情绪' }

export default function AnnualGoalEvidencePreview({ patientId }) {
  const [open, setOpen] = useState(false)
  const [periods, setPeriods] = useState([])
  const [periodKey, setPeriodKey] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const show = async () => {
    setBusy(true); setError('')
    try {
      const result = await managementReviewAPI.goalPreview(patientId)
      const rows = result.data?.periods || []
      setPeriods(rows)
      setPeriodKey((rows.filter(row => row.kind === 'monthly').at(-1) || rows.at(-1))?.key || '')
      setOpen(true)
    } catch (cause) { setError(cause.message || '暂不能读取评估周期') }
    finally { setBusy(false) }
  }
  const load = async () => {
    if (!periodKey) return
    setBusy(true); setError(''); setPreview(null)
    try { setPreview((await managementReviewAPI.goalPreview(patientId, periodKey)).data) }
    catch (cause) { setError(cause.message || '暂不能读取目标证据') }
    finally { setBusy(false) }
  }

  return <div style={{ padding: 12, border: '1px solid #D8E8E0', borderRadius: 8, background: '#F7FBF9' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <b style={{ flex: 1, fontSize: 13 }}>年度目标证据预览</b>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => open ? (setOpen(false), setPreview(null)) : show()}>{open ? '收起' : '只读查看'}</button>
    </div>
    <div style={{ fontSize: 12, color: '#60756B', marginTop: 5 }}>预览不会生成或改写阶段性评估，也不会判定目标达成。</div>
    {error && <div role="alert" style={{ color: '#B42318', fontSize: 12, marginTop: 7 }}>{error}</div>}
    {open && <div style={{ marginTop: 10 }}>
      {periods.length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="form-input" aria-label="预览周期" value={periodKey} onChange={event => { setPeriodKey(event.target.value); setPreview(null) }}>
          {periods.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !periodKey} onClick={load}>{busy ? '读取中…' : '读取证据'}</button>
      </div> : <div style={{ fontSize: 12 }}>当前没有已结束且可预览的服务周期。</div>}
      {preview && <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#60756B' }}>{preview.period.label} · {preview.period.start} 至 {preview.period.end} · {preview.note}</div>
        <div style={{ padding: 10, border: '1px solid #D8E8E0', borderRadius: 7, background: '#fff', fontSize: 12, lineHeight: 1.7 }}>
          <b>本期生活方式与主诉记录整体情况</b>
          {Object.entries(preview.recordOverview || {}).map(([type, evidence]) => <div key={type}>
            {recordLabels[type] || type}：覆盖 {evidence.days} / {evidence.periodDays || '?'} 天，共 {evidence.count} 条
            {evidence.common?.length ? `；常见填写：${evidence.common.map(item => `${item.value}（${item.count}条）`).join('、')}` : ''}
            {evidence.incomplete ? '；资料达到读取上限，可能不完整' : ''}
          </div>)}
          <div style={{ color: '#60756B' }}>仅概括已填写记录；不能据此推断未记录日期的行为或健康变化。</div>
        </div>
        {preview.goals.length ? preview.goals.map(goal => {
          const observation = goal.observationEvidence
          const previous = goal.previousEvidence?.observationEvidence
          const metric = goal.metricEvidence
          return <div key={goal.issueId} style={{ padding: 10, border: '1px solid #D8E8E0', borderRadius: 7, background: '#fff', fontSize: 12, lineHeight: 1.7 }}>
            <b>{goal.goal}</b> · {dimensions[goal.goalDimension] || '维度待核对'}
            <div>基线：{goal.baseline || '待核对'}；来源：{goal.sourceTitle || '年度方案'}</div>
            {observation && <div>本期已填 {observation.days} / {observation.periodDays || '?'} 天、{observation.count} 条{previous ? `；前次已归档${goal.previousEvidence.label}为 ${previous.days} / ${previous.periodDays || '?'} 天、${previous.count} 条` : ''}。记录覆盖不代表目标达成。</div>}
            {metric?.latest && !metric.ambiguous && <div>本期可比指标：{metric.first?.value} {metric.first?.unit} → {metric.latest.value} {metric.latest.unit}{goal.previousEvidence?.metricLatest ? `；前次已归档末值 ${goal.previousEvidence.metricLatest.value} ${goal.previousEvidence.metricLatest.unit}` : ''}。需核对原始资料。</div>}
            {metric?.ambiguous && <div>同日出现不同数值，需核对原始报告。</div>}
            {goal.taskEvidence?.length > 0 && <div>关联执行任务 {goal.taskEvidence.length} 条；任务办结不等于目标达成。</div>}
          </div>
        }) : <div style={{ fontSize: 12, color: '#8A5A00' }}>当前已确认年度方案没有结构化管理目标。本期记录可先核对整体情况；目标达成分析须由健康顾问在后续正式方案中确认目标和基线。</div>}
      </div>}
    </div>}
  </div>
}
