import React, { useState } from 'react'
import { staffAPI } from '../api'

export default function MedicalAssistClosureAction({ task, onConfirmed }) {
  const [open, setOpen] = useState(false)
  const [conclusion, setConclusion] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (task?.workflowKey !== 'medical_assist:closure') return null

  const submit = async event => {
    event.stopPropagation()
    if (!conclusion.trim()) { setError('请填写结案核对结论'); return }
    setSaving(true)
    setError('')
    try {
      await staffAPI.confirmMedicalAssistClosure(task._id, conclusion.trim())
      setOpen(false)
      onConfirmed?.()
    } catch (cause) { setError(cause.message || '结案失败，请刷新后重试') }
    finally { setSaving(false) }
  }

  return <div onClick={event => event.stopPropagation()} style={{ marginTop: 8 }}>
    <div style={{ color: '#8A6A20', fontSize: 12, marginBottom: 6 }}>执行环节已结束，服务待健康规划师确认结案</div>
    {!open ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>核对并确认结案</button>
      : <div style={{ display: 'grid', gap: 7, maxWidth: 460 }}>
        <label style={{ fontSize: 12 }}>结案核对结论
          <textarea className="form-input" value={conclusion} onChange={event => setConclusion(event.target.value)} rows={3}
            placeholder="记录服务结果、交付资料及后续安排" style={{ display: 'block', width: '100%', marginTop: 4 }} />
        </label>
        {error && <div role="alert" style={{ color: '#B42318', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 7 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? '确认中…' : '确认结案'}</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setOpen(false)}>取消</button>
        </div>
      </div>}
  </div>
}
