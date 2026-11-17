import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export const isBodyCompInvitation = task => !!task?.bodyCompCycle?.planId

function plusDays(day, count) {
  if (!day) return ''
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

export default function BodyCompInvitation({ task, onClose, onSaved }) {
  const [options, setOptions] = useState([])
  const [index, setIndex] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [targetDate, setTargetDate] = useState(String(task.bodyCompCycle.targetAt || '').slice(0, 10))
  useEffect(() => {
    let active = true
    staffAPI.getBodyCompInvitationOptions(task._id).then(result => {
      if (active) { setOptions(result.data || []); setLoading(false) }
    }).catch(err => { if (active) { setError(err.message || '读取测量记录失败'); setLoading(false) } })
    return () => { active = false }
  }, [task._id])
  const choose = value => {
    setIndex(value)
    const selected = options.find(item => String(item.index) === value)
    if (selected) setNextDate(plusDays(selected.measuredAt, 28))
  }
  const selected = options.find(item => String(item.index) === index)
  const save = async () => {
    if (!selected || !note.trim() || !nextDate) { setError('请选择已入档的测量记录，填写结果和下一次日期'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.completeBodyCompInvitation(task._id, { measurementIndex: Number(index), measuredAt: selected.measuredAt, sourceReportId: selected.sourceReportId, resultNote: note.trim(), nextTargetDate: nextDate })
      onSaved?.()
    } catch (err) { setError(err.message || '保存失败，请重试') }
    finally { setSaving(false) }
  }
  const reschedule = async () => {
    setSaving(true); setError('')
    try { await staffAPI.rescheduleBodyCompInvitation(task._id, { targetDate }); onSaved?.('rescheduled') }
    catch (err) { setError(err.message || '改期失败') }
    finally { setSaving(false) }
  }
  return <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose?.() }}>
    <div className="modal" style={{ maxWidth: 580 }}>
      <div className="modal-header"><h3 className="modal-title">体成分测量邀约 · 第{task.bodyCompCycle.cycle}次</h3><button className="modal-close" onClick={onClose}>✕</button></div>
      <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
        <div>目标测量日期：{String(task.bodyCompCycle.targetAt || '').slice(0, 10)}。可先记录沟通进展；测量结果入档后再结束本轮。</div>
        {task.status === 'completed' ? <div>本轮已完成，下一轮按 {String(task.bodyCompCycle.nextTargetAt || '').slice(0, 10)} 安排。</div> : <>
          <label>调整目标测量日期 <input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)} style={{ marginLeft: 8 }} /></label>
          <button className="btn btn-secondary" disabled={saving || targetDate === String(task.bodyCompCycle.targetAt || '').slice(0, 10)} onClick={reschedule}>保存改期</button>
          <label>已入档的体成分记录
            <select value={index} onChange={event => choose(event.target.value)} disabled={loading} style={{ display: 'block', width: '100%', marginTop: 6 }}>
              <option value="">{loading ? '读取中…' : '请选择本次测量'}</option>
              {options.map(item => <option key={item.index} value={item.index}>{item.measuredAt} · {item.source === 'medical_report' ? '已审核报告' : '健康档案'} · 体重 {item.weight ?? '—'} kg / 体脂 {item.bodyFatRate ?? '—'}</option>)}
            </select>
          </label>
          {!loading && options.length === 0 && <div>暂无可选记录。请先在客户的体成分档案或报告管理中录入并审核测量结果。</div>}
          <label>本次结果与下轮安排<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} style={{ display: 'block', width: '100%', marginTop: 6 }} /></label>
          <label>下次目标测量日期 <input type="date" value={nextDate} min={selected ? plusDays(selected.measuredAt, 4) : undefined} onChange={event => setNextDate(event.target.value)} style={{ display: 'block', marginTop: 6 }} /></label>
          <small>默认按实际测量后 28 天；提前 3 天生成营养师邀约待办。同一营养方案始终只有一条当前待办。</small>
        </>}
        {error && <div style={{ color: '#B91C1C' }}>{error}</div>}
      </div>
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>关闭</button>{task.status !== 'completed' && <button className="btn btn-primary" disabled={saving || loading || !options.length} onClick={save}>{saving ? '保存中…' : '完成本轮并安排下一次'}</button>}</div>
    </div>
  </div>
}
