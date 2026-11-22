import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { MONITORING_METRICS } from '../utils/monitoringMetrics'

const metricType = row => row.metricType || MONITORING_METRICS.find(([, label]) => label === row.items)?.[0]

export default function ManualMonitoringTrial({ patientId, year, planId, rows = [], assignedManagerId = '', managerName = '', toast }) {
  const [date, setDate] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState('')
  const reload = () => staffAPI.getManualAnnualMonitoring(patientId, planId).then(result => setTasks(result.data || []))
  useEffect(() => { let active = true; staffAPI.getManualAnnualMonitoring(patientId, planId)
    .then(result => { if (active) setTasks(result.data || []) }).catch(() => { if (active) setError('人工随访状态暂不可读取，请刷新') })
    return () => { active = false } }, [patientId, planId])
  const save = async () => {
    setBusy(true); setError('')
    try {
      const result = await staffAPI.startManualAnnualMonitoring(patientId, { year, planId, date,
        managerId: assignedManagerId, noClientAppConfirmed: confirmed })
      await reload()
      setConfirmed(false)
      toast(result.message || '人工监测随访已建立')
    } catch (cause) { setError(cause.message || '安排失败，请核对已有任务') }
    finally { setBusy(false) }
  }
  const remaining = rows.filter(row => !tasks.some(task => task.type === metricType(row)))
  return <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>客户不用 App／小程序 · 健管专员人工随访</summary>
    <div style={{ display: 'grid', gap: 8, marginTop: 9, fontSize: 13 }}>
      <div>按本方案各项目周期建立内部随访；完成一轮后按该项目周期接续。客户原有自动监测提醒保持独立。</div>
      {tasks.length > 0 && <div role="status">已有 {tasks.length} 项人工随访：{tasks.map(task => `${rows.find(row => metricType(row) === task.type)?.items || task.type}（${task.frequency}）`).join('、')}</div>}
      {!remaining.length ? <div>本方案监测项目已全部安排人工随访。</div> : <>
      <div>待安排：{remaining.map(row => `${row.items}（${row.frequency || '周期待确认'}）`).join('、')}</div>
      <div>责任健管专员：{managerName || '尚未分配'}</div>
      <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 已向客户确认不使用 App 和小程序</label>
      <label>首次随访日期 <input className="form-input" type="date" min={new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())} value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !confirmed || !date || !assignedManagerId || rows.some(row => !row.frequency)} onClick={save}>{busy ? '安排中…' : '按项目周期建立内部随访'}</button>
      </>}
      {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
    </div>
  </details>
}
