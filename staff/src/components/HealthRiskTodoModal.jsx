import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const OUTCOMES = [
  ['confirmed', '已核实需关注'],
  ['needs_information', '待补资料（继续待办）'],
  ['contacted', '已联系并安排后续'],
  ['referred', '已建议就医'],
  ['false_positive', '误报'],
]

export default function HealthRiskTodoModal({ todo, onClose, onViewSource, onDone }) {
  const [event, setEvent] = useState(null)
  const [outcome, setOutcome] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const eventId = todo.id.replace(/^risk_event_/, '')

  useEffect(() => {
    let active = true
    staffAPI.getHealthRiskEvents(todo.patientId)
      .then(result => {
        if (!active) return
        const found = (result.data || []).find(row => row._id === eventId)
        if (found?.status === 'pending') setEvent(found)
        else setError('这条线索已处理或不可查看，请刷新工作台。')
      })
      .catch(err => { if (active) setError(err.message || '线索读取失败，请重试') })
    return () => { active = false }
  }, [todo.patientId, eventId])

  const save = async () => {
    if (!outcome || !note.trim()) {
      setError('请选择核实结果，并填写实际处理情况与下一步安排')
      return
    }
    setSaving(true)
    setError('')
    try {
      await staffAPI.resolveHealthRiskEvent(eventId, { disposition: outcome, note: note.trim() })
      onDone()
    } catch (err) {
      setError(err.message || '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return <div role="dialog" aria-modal="true" aria-label="健康风险线索核实" style={{ position: 'fixed', inset: 0, background: '#0006', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ background: '#fff', padding: 20, width: 'min(680px, 95vw)', maxHeight: '85vh', overflow: 'auto', borderRadius: 12 }}>
      <button type="button" onClick={onClose} style={{ float: 'right' }}>关闭</button>
      <h3>健康风险线索待核对 · {todo.patientName}</h3>
      <p style={{ color: '#6B7F75', fontSize: 13 }}>请结合原始资料和既有随访安排核实。此标记不等于诊断或临床危急值。</p>
      {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
      {!event && !error && <p>正在读取线索…</p>}
      {event && <>
        <strong>{event.title}</strong>
        <p>{event.summary}</p>
        {event.sourceType === 'medical_report' && <p style={{ fontSize: 13 }}>原始报告：{event.evidence?.reportTitle || '未命名'}；检查日期：{event.evidence?.checkDate || '未记录'}；异常/关注项：{(event.evidence?.items || []).map(item => item.name).filter(Boolean).join('、') || '请查看报告'}</p>}
        {event.sourceType === 'health_record' && <p style={{ fontSize: 13 }}>原始记录：{event.evidence?.value || '未记录'} {event.evidence?.unit || ''}；记录时间：{event.evidence?.recordedAt ? new Date(event.evidence.recordedAt).toLocaleString('zh-CN') : '未记录'}</p>}
        {event.sourceType === 'monitoring_trend' && <p style={{ fontSize: 13 }}>原始记录：{(event.evidence?.records || []).map(record => `${record.value} ${record.unit}（${new Date(record.recordedAt).toLocaleDateString('zh-CN')}）`).join('；')}</p>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onViewSource}>查看原始资料</button>
        <div style={{ marginTop: 16 }}>
          <select className="form-input" aria-label="核实结果" value={outcome} onChange={e => setOutcome(e.target.value)}>
            <option value="">请选择核实结果</option>
            {OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <textarea className="form-input" aria-label="实际处理情况与下一步安排" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="记录核实依据、联系结果和下一步安排" style={{ marginTop: 8 }} />
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save} style={{ marginTop: 8 }}>{saving ? '保存中…' : '保存核实结果'}</button>
        </div>
      </>}
    </div>
  </div>
}
