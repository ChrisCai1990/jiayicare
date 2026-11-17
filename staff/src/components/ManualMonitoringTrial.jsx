import React, { useState } from 'react'
import { staffAPI } from '../api'

export default function ManualMonitoringTrial({ patientId, toast }) {
  const [date, setDate] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    try {
      const result = await staffAPI.startManualAnnualMonitoring(patientId, { date, noClientAppConfirmed: confirmed })
      setDone(true)
      toast(result.message || '人工监测提醒已建立')
    } catch (cause) { setError(cause.message || '安排失败，请核对已有任务') }
    finally { setBusy(false) }
  }
  return <details style={{ marginTop: 9 }}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>客户不使用 App／小程序 · 安排健管专员人工提醒</summary>
    <div style={{ display: 'grid', gap: 8, marginTop: 9 }}>
      <div>只对确实无法使用客户端的客户安排。一条任务同时记录血压和体重，本次两项入档后接续下一周。</div>
      <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> 已向客户确认不使用 App 和小程序</label>
      <div>记录项目：血压、体重</div>
      <label>首次提醒日期<input className="form-input" type="date" min={new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())} value={date} onChange={event => setDate(event.target.value)} /></label>
      {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
      {done && <div role="status" style={{ color: '#1E6B50' }}>已安排血压和体重的同一条每周任务。</div>}
      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !confirmed || !date || done} onClick={save}>{busy ? '安排中…' : '给健管专员安排人工提醒'}</button>
    </div>
  </details>
}
