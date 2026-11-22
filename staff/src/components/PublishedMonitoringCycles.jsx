import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import MonitoringFrequencyField from './MonitoringFrequencyField'

export default function PublishedMonitoringCycles({ patientId, plan, rows = [], toast, onSaved }) {
  const [frequencies, setFrequencies] = useState(() => rows.map(row => row.frequency || ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setFrequencies(rows.map(row => row.frequency || '')); setError('') }, [plan?._id, plan?.updatedAt])
  const dirty = rows.some((row, index) => (row.frequency || '') !== frequencies[index])
  const save = async () => {
    setBusy(true); setError('')
    try {
      const result = await staffAPI.saveAnnualMonitoringCycles(patientId, plan._id, { baseUpdatedAt: plan.updatedAt, frequencies })
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
    <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !dirty || frequencies.some(value => !value)} onClick={save} style={{ justifySelf: 'start' }}>
      {busy ? '保存中…' : '保存各项监测周期（留痕）'}
    </button>
    {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
  </div>
}
