import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import MonitoringFrequencyField from './MonitoringFrequencyField'

export default function PublishedMonitoringCycles({ patientId, plan, rows = [], toast, onSaved }) {
  const [frequencies, setFrequencies] = useState(() => rows.map(row => row.frequency || ''))
  const [clientAppUsage, setClientAppUsage] = useState(plan?.moduleData?.monitoring?.clientAppUsage || '')
  const [firstManualFollowUpDate, setFirstManualFollowUpDate] = useState(plan?.moduleData?.monitoring?.firstManualFollowUpDate || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setFrequencies(rows.map(row => row.frequency || '')); setClientAppUsage(plan?.moduleData?.monitoring?.clientAppUsage || ''); setFirstManualFollowUpDate(plan?.moduleData?.monitoring?.firstManualFollowUpDate || ''); setError('') }, [plan?._id, plan?.updatedAt])
  const dirty = rows.some((row, index) => (row.frequency || '') !== frequencies[index]) ||
    (plan?.moduleData?.monitoring?.clientAppUsage || '') !== clientAppUsage ||
    (plan?.moduleData?.monitoring?.firstManualFollowUpDate || '') !== firstManualFollowUpDate
  const save = async () => {
    setBusy(true); setError('')
    try {
      const result = await staffAPI.saveAnnualMonitoringCycles(patientId, plan._id, { baseUpdatedAt: plan.updatedAt, frequencies,
        clientAppUsage, firstManualFollowUpDate })
      onSaved(result.data)
      toast(result.message || '监测周期已保存')
    } catch (cause) { setError(cause.message || '保存失败，请刷新方案') }
    finally { setBusy(false) }
  }
  return <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
    {rows.map((row, index) => <div key={`${row.metricType || row.items}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>{row.items || '监测项目'}{row.measurementPeriod && ` · ${row.measurementPeriod}`}</span>
      <MonitoringFrequencyField label={row.items || '监测项目'} value={frequencies[index] || ''}
        onChange={frequency => setFrequencies(current => current.map((value, i) => i === index ? frequency : value))} />
    </div>)}
    <label>客户是否使用 App／小程序　<select className="form-input" aria-label="客户是否使用App或小程序" style={{ width: 'auto' }} value={clientAppUsage} onChange={event => setClientAppUsage(event.target.value)}><option value="">请选择</option><option value="yes">使用</option><option value="no">不使用</option></select></label>
    {clientAppUsage === 'no' && <label>首次随访日期　<input className="form-input" type="date" aria-label="人工监测首次随访日期" style={{ width: 'auto' }} value={firstManualFollowUpDate} onChange={event => setFirstManualFollowUpDate(event.target.value)} /></label>}
    <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !dirty || frequencies.some(value => !value) || !clientAppUsage || clientAppUsage === 'no' && !firstManualFollowUpDate} onClick={save} style={{ justifySelf: 'start' }}>
      {busy ? '保存中…' : '保存各项监测周期（留痕）'}
    </button>
    {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
  </div>
}
