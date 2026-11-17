import React, { useState } from 'react'
import { staffAPI } from '../api'

const dimensionNames = { '': '综合／医疗过程', data: '数据', symptom: '症状', lifestyle: '生活方式' }
const vitalNames = { weight: ['体重', 'kg'], bloodSugar: ['血糖', 'mmol/L'], heartRate: ['心率', '次/分'], systolic: ['收缩压', 'mmHg'], diastolic: ['舒张压', 'mmHg'] }
const lifestyleNames = { diet: '饮食', exercise: '运动', sleep: '睡眠', smoking: '吸烟', alcohol: '饮酒', mood: '情绪' }

export default function PublishedAnnualGoals({ patientId, plan, onSaved, toast }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draftingId, setDraftingId] = useState('')
  const [candidates, setCandidates] = useState([])
  const [goals, setGoals] = useState([])
  const [baseUpdatedAt, setBaseUpdatedAt] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setBusy(true); setError('')
    try {
      const result = await staffAPI.getAnnualGoalCandidates(patientId, plan._id)
      setCandidates(result.data?.candidates || [])
      setGoals(result.data?.goals || [])
      setBaseUpdatedAt(result.data?.baseUpdatedAt || '')
      setRequestId(crypto.randomUUID())
      setOpen(true)
    } catch (cause) { setError(cause.message || '无法读取原方案事项') }
    finally { setBusy(false) }
  }
  const change = (issueId, patch) => setGoals(rows => rows.map(row => row.issueId === issueId ? { ...row, ...patch } : row))
  const toggle = candidate => setGoals(rows => rows.some(row => row.issueId === candidate.issueId)
    ? rows.filter(row => row.issueId !== candidate.issueId)
    : [...rows, { issueId: candidate.issueId, sourceTitle: candidate.sourceTitle, goal: '', focus: '',
      baseline: '', goalDimension: '', symptomTerm: '', lifestyleType: '', goalMetric: null,
      nutritionRelevant: false, rehabRelevant: false }])
  const save = async () => {
    if (!goals.length || goals.some(row => !row.goal?.trim() || !row.focus?.trim()) || reason.trim().length < 2) {
      setError('请选择原方案事项，并逐项填写目标和行动重点、说明修订原因'); return
    }
    if (!window.confirm('确认更新已发布方案的年度目标并通知客户？原有任务和已归档评估不会改写。')) return
    setBusy(true); setError('')
    try {
      const result = await staffAPI.reviseAnnualGoals(patientId, plan._id, { baseUpdatedAt, requestId, reason: reason.trim(), goals })
      onSaved(result.data)
      setOpen(false); setReason('')
      toast(result.message || '目标已更新')
    } catch (cause) { setError(cause.message || '目标修订失败，请刷新后核对') }
    finally { setBusy(false) }
  }
  const metricField = (row, patch) => change(row.issueId, { goalMetric: { ...(row.goalMetric || { source: 'vital', key: 'weight', unit: 'kg' }), ...patch } })
  const draft = async issueId => {
    setDraftingId(issueId); setError('')
    try {
      const result = await staffAPI.draftAnnualGoal(patientId, plan._id, issueId)
      setGoals(rows => rows.map(row => row.issueId === issueId ? {
        ...row, goal: row.goal?.trim() || result.data.goal, focus: row.focus?.trim() || result.data.focus,
        baseline: row.baseline?.trim() || result.data.baseline,
      } : row))
    } catch (cause) { setError(cause.message || 'AI草稿暂不可用，请手动填写') }
    finally { setDraftingId('') }
  }

  return <details open={open} style={{ marginBottom: 16, padding: 14, border: '1px solid #C7D8CB', borderRadius: 10, background: '#fff' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }} onClick={event => { event.preventDefault(); open ? setOpen(false) : load() }}>补充已发布方案的管理目标（试点）</summary>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {open && <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#52675D' }}>只从原方案事项中选择需要跟踪的问题。顾问核对目标、当前基线与专业岗位后保存；历史评估不倒填，新目标从本次确认起生效。</p>
      {candidates.map(candidate => {
        const row = goals.find(item => item.issueId === candidate.issueId)
        return <div key={candidate.issueId} style={{ border: '1px solid #D8E8E0', borderRadius: 8, padding: 10 }}>
          <label><input type="checkbox" checked={!!row} disabled={busy} onChange={() => toggle(candidate)} /> {candidate.sourceTitle} <small>· {candidate.moduleKey}</small></label>
          {row && <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
            <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy || !!draftingId} onClick={() => draft(row.issueId)}>{draftingId === row.issueId ? '起草中…' : 'AI 起草空白目标和行动'}</button><span style={{ marginLeft: 8, fontSize: 12, color: '#60756B' }}>仅供顾问核对，已填写内容不会被覆盖。</span></div>
            <label>管理目标<textarea className="form-input" maxLength={240} rows={2} value={row.goal || ''} onChange={event => change(row.issueId, { goal: event.target.value })} /></label>
            <label>行动重点<textarea className="form-input" maxLength={500} rows={2} value={row.focus || ''} onChange={event => change(row.issueId, { focus: event.target.value })} /></label>
            <label>当前基线或待核实内容<textarea className="form-input" maxLength={500} rows={2} value={row.baseline || ''} onChange={event => change(row.issueId, { baseline: event.target.value })} /></label>
            <label>目标维度<select className="form-input" value={row.goalDimension || ''} onChange={event => change(row.issueId, { goalDimension: event.target.value, goalMetric: null, symptomTerm: '', lifestyleType: '' })}>{Object.entries(dimensionNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
            {row.goalDimension === 'symptom' && <label>追踪症状词<input className="form-input" maxLength={80} value={row.symptomTerm || ''} onChange={event => change(row.issueId, { symptomTerm: event.target.value })} placeholder="可留空，由顾问核对全部主诉" /></label>}
            {row.goalDimension === 'lifestyle' && <label>记录类别<select className="form-input" value={row.lifestyleType || ''} onChange={event => change(row.issueId, { lifestyleType: event.target.value })}><option value="">请选择</option>{Object.entries(lifestyleNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
            {row.goalDimension === 'data' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label>指标来源<select className="form-input" value={row.goalMetric?.source || ''} onChange={event => change(row.issueId, { goalMetric: event.target.value === 'vital' ? { source: 'vital', key: 'weight', unit: 'kg' } : event.target.value === 'report_item' ? { source: 'report_item', name: '', unit: '' } : null })}><option value="">待核对</option><option value="vital">日常健康数据</option><option value="report_item">已审核报告检查项</option></select></label>
              {row.goalMetric?.source === 'vital' && <label>指标<select className="form-input" value={row.goalMetric.key} onChange={event => metricField(row, { key: event.target.value, unit: vitalNames[event.target.value][1] })}>{Object.entries(vitalNames).map(([key, [name]]) => <option key={key} value={key}>{name}</option>)}</select></label>}
              {row.goalMetric?.source === 'report_item' && <><label>检查项原名<input className="form-input" maxLength={100} value={row.goalMetric.name || ''} onChange={event => metricField(row, { name: event.target.value })} /></label><label>单位<input className="form-input" maxLength={30} value={row.goalMetric.unit || ''} onChange={event => metricField(row, { unit: event.target.value })} /></label></>}
              {row.goalMetric && <><label>目标方向<select className="form-input" value={row.goalMetric.operator || ''} onChange={event => metricField(row, { operator: event.target.value })}><option value="">仅对照变化</option><option value="lte">不高于</option><option value="gte">不低于</option><option value="lt">低于</option><option value="gt">高于</option><option value="eq">等于</option></select></label><label>目标数值<input className="form-input" type="number" step="any" value={row.goalMetric.targetValue ?? ''} onChange={event => metricField(row, { targetValue: event.target.value })} /></label></>}
            </div>}
            <label><input type="checkbox" checked={row.nutritionRelevant === true} onChange={event => change(row.issueId, { nutritionRelevant: event.target.checked })} /> 营养师参与</label>
            <label><input type="checkbox" checked={row.rehabRelevant === true} onChange={event => change(row.issueId, { rehabRelevant: event.target.checked })} /> 建议运动复健评估</label>
          </div>}
        </div>
      })}
      <label>修订原因<textarea className="form-input" maxLength={500} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !candidates.length} onClick={save}>{busy ? '保存中…' : '顾问确认并保存目标'}</button>
    </div>}
  </details>
}
