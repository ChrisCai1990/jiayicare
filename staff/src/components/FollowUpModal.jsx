import React, { useState, useEffect } from 'react'
import { staffAPI } from '../api'

const today = () => new Date().toISOString().slice(0, 10)

export default function FollowUpModal({ patientId, patientName, onClose, onSaved }) {
  const [patients, setPatients] = useState([])
  const [form, setForm] = useState({
    patientId: patientId || '',
    date: today(),
    type: 'phone',
    status: 'completed',
    content: '',
    nextFollowUpDate: '',
    tags: [],
    // vitals
    systolic: '', diastolic: '', bloodSugar: '', weight: '', heartRate: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // If no patientId given, load patients for selection
  useEffect(() => {
    if (!patientId) {
      staffAPI.getPatients({ limit: 200 }).then(r => setPatients(r.data.patients)).catch(() => {})
    }
  }, [patientId])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const TAGS_OPTIONS = ['用药提醒', '复查提示', '生活指导', '心理疏导', '转诊建议', '急性发作']
  const toggleTag = (t) => setForm(f => ({
    ...f,
    tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t]
  }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.patientId) { setError('请选择患者'); return }
    if (!form.content.trim() && form.status === 'completed') { setError('已完成的随访请填写随访内容'); return }
    setSaving(true)
    setError('')
    try {
      const vitals = {}
      if (form.systolic)   vitals.systolic   = Number(form.systolic)
      if (form.diastolic)  vitals.diastolic  = Number(form.diastolic)
      if (form.bloodSugar) vitals.bloodSugar = Number(form.bloodSugar)
      if (form.weight)     vitals.weight     = Number(form.weight)
      if (form.heartRate)  vitals.heartRate  = Number(form.heartRate)

      await staffAPI.createFollowUp({
        patientId: form.patientId,
        date: form.date,
        type: form.type,
        status: form.status,
        content: form.content,
        nextFollowUpDate: form.nextFollowUpDate || null,
        tags: form.tags,
        vitals: Object.keys(vitals).length > 0 ? vitals : undefined,
      })
      onSaved()
    } catch (err) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {patientName ? `随访记录 · ${patientName}` : '新增随访记录'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit} className="modal-body">
          {/* 患者选择（仅当没有传 patientId 时） */}
          {!patientId && (
            <div className="form-group">
              <label className="form-label">选择患者 *</label>
              <select className="form-input" value={form.patientId} onChange={set('patientId')} required>
                <option value="">-- 请选择患者 --</option>
                {patients.map(p => (
                  <option key={p._id} value={p._id}>{p.name} · {p.phone}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">随访日期</label>
              <input className="form-input" type="date" value={form.date} onChange={set('date')} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">随访方式</label>
              <select className="form-input" value={form.type} onChange={set('type')}>
                <option value="phone">电话</option>
                <option value="wechat">微信</option>
                <option value="visit">上门</option>
                <option value="video">视频</option>
                <option value="other">其他</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">随访状态</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { v: 'completed', l: '✅ 已完成' },
                { v: 'missed', l: '📵 未接通' },
                { v: 'planned', l: '📅 计划中' },
              ].map(opt => (
                <button
                  key={opt.v} type="button"
                  onClick={() => setForm(f => ({ ...f, status: opt.v }))}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                    border: `1px solid ${form.status === opt.v ? '#1E6B50' : '#E0D9CE'}`,
                    background: form.status === opt.v ? '#1E6B50' : '#f9f7f3',
                    color: form.status === opt.v ? '#fff' : '#4A6558',
                  }}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">随访内容</label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="记录随访的主要内容、患者反馈、建议等..."
              value={form.content}
              onChange={set('content')}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* 体征记录（可选） */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558', marginBottom: 8 }}>体征记录（可选）</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>收缩压 (mmHg)</label>
                <input className="form-input" type="number" placeholder="如：120" value={form.systolic} onChange={set('systolic')} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>舒张压 (mmHg)</label>
                <input className="form-input" type="number" placeholder="如：80" value={form.diastolic} onChange={set('diastolic')} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>血糖 (mmol/L)</label>
                <input className="form-input" type="number" step="0.1" placeholder="如：5.6" value={form.bloodSugar} onChange={set('bloodSugar')} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>体重 (kg)</label>
                <input className="form-input" type="number" step="0.1" placeholder="如：65" value={form.weight} onChange={set('weight')} />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>心率 (次/分)</label>
                <input className="form-input" type="number" placeholder="如：72" value={form.heartRate} onChange={set('heartRate')} />
              </div>
            </div>
          </div>

          {/* 标签 */}
          <div className="form-group">
            <label className="form-label">随访标签（可多选）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TAGS_OPTIONS.map(t => (
                <button
                  key={t} type="button"
                  onClick={() => toggleTag(t)}
                  style={{
                    padding: '4px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${form.tags.includes(t) ? '#1E6B50' : '#E0D9CE'}`,
                    background: form.tags.includes(t) ? '#1E6B50' : '#f9f7f3',
                    color: form.tags.includes(t) ? '#fff' : '#4A6558',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 下次随访 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">下次随访日期（可选）</label>
            <input className="form-input" type="date" value={form.nextFollowUpDate} onChange={set('nextFollowUpDate')} />
          </div>
        </form>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '保存中...' : '保存随访'}
          </button>
        </div>
      </div>
    </div>
  )
}
