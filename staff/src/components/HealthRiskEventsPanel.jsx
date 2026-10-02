import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const OUTCOMES = [
  ['confirmed', '已核实需关注'],
  ['needs_information', '待补资料（继续待办）'],
  ['contacted', '已联系并安排后续'],
  ['referred', '已建议就医'],
  ['false_positive', '误报'],
]

export default function HealthRiskEventsPanel({ patientId, staff }) {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState('')
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const allowed = ['familyDoctor', 'superadmin'].includes(staff?.role)

  useEffect(() => {
    if (!allowed || !patientId) return
    let live = true
    staffAPI.getHealthRiskEvents(patientId)
      .then(result => { if (live) setEvents(result.data || []) })
      .catch(err => { if (live) setError(err.message || '风险事件加载失败') })
    return () => { live = false }
  }, [patientId, allowed])

  if (!allowed || (!events.length && !error)) return null

  const save = async (eventId) => {
    if (!outcome || !note.trim()) { setError('请选择核实结果，并填写实际处理情况与下一步安排'); return }
    setSaving(true); setError('')
    try {
      const result = await staffAPI.resolveHealthRiskEvent(eventId, { disposition: outcome, note: note.trim() })
      setEvents(rows => rows.map(row => row._id === eventId ? result.data : row))
      setActiveId(''); setOutcome(''); setNote('')
    } catch (err) { setError(err.message || '保存失败，请重试') }
    finally { setSaving(false) }
  }

  return <div className="card" style={{ marginBottom: 16, padding: '16px 20px' }}>
    <div className="card-title" style={{ marginBottom: 5 }}>健康风险线索与核实记录</div>
    <div style={{ fontSize: 12, color: '#6B7F75', marginBottom: 12 }}>系统依据新录入数据和已审核报告提示待核对信息。请查看原始资料；这里的标记不等于诊断或临床危急值。</div>
    {error && <div style={{ color: '#B91C1C', marginBottom: 10 }}>{error}</div>}
    {events.map(event => <div key={event._id} style={{ borderTop: '1px solid #E6EDE8', padding: '12px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{event.title}</strong>
        <span style={{ fontSize: 12, color: event.status === 'pending' ? '#B45309' : '#6B7F75' }}>{event.status === 'pending' ? '待核对' : event.status === 'closed' ? '已结案' : '来源已更正'}</span>
        <span style={{ fontSize: 12, color: '#6B7F75' }}>{event.detectedAt ? new Date(event.detectedAt).toLocaleString('zh-CN') : ''}</span>
      </div>
      <div style={{ fontSize: 13, marginTop: 5 }}>{event.summary}</div>
      {event.sourceType === 'health_record' && <div style={{ fontSize: 12, marginTop: 5 }}>原始记录：{event.evidence?.value || '未记录'} {event.evidence?.unit || ''}；记录时间：{event.evidence?.recordedAt ? new Date(event.evidence.recordedAt).toLocaleString('zh-CN') : '未记录'}</div>}
      {event.sourceType === 'monitoring_trend' && <div style={{ fontSize: 12, marginTop: 5 }}>原始记录：{(event.evidence?.records || []).map(record => `${record.value} ${record.unit}（${new Date(record.recordedAt).toLocaleDateString('zh-CN')}）`).join('；')}</div>}
      {event.sourceType === 'medical_report' && <div style={{ fontSize: 12, marginTop: 5 }}>原始报告：{event.evidence?.reportTitle || '未命名'}；检查日期：{event.evidence?.checkDate || '未记录'}；异常/关注项：{(event.evidence?.items || []).map(item => item.name).filter(Boolean).join('、') || '请查看报告'}</div>}
      {!!event.decisionNote && <div style={{ fontSize: 12, color: '#4A6558', marginTop: 6 }}>最近处理：{event.decisionNote} {event.decidedByName && `· ${event.decidedByName}`}</div>}
      {event.status === 'pending' && (activeId === event._id ? <div style={{ marginTop: 10 }}>
        <select className="form-input" value={outcome} onChange={e => setOutcome(e.target.value)} style={{ marginBottom: 8 }}>
          <option value="">请选择核实结果</option>
          {OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <textarea className="form-input" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="记录核实依据、联系结果和下一步安排" />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => save(event._id)}>{saving ? '保存中…' : '保存核实结果'}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setActiveId(''); setError('') }}>取消</button>
        </div>
      </div> : <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setActiveId(event._id); setOutcome(''); setNote(''); setError('') }}>核实并记录</button>)}
      {(event.history || []).length > 1 && <details style={{ fontSize: 12, marginTop: 8 }}><summary>处理历史</summary>{event.history.map((entry, index) => <div key={index} style={{ marginTop: 5 }}>{entry.at ? new Date(entry.at).toLocaleString('zh-CN') : ''} · {entry.staffName || '系统'} · {entry.note || entry.action}</div>)}</details>}
    </div>)}
  </div>
}
