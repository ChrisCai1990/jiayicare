import React, { useState } from 'react'
import helpers from '../../../shared/medicationReminder.cjs'

export default function MedicationReminderModal({ medication, onSave, onClose }) {
  const [form, setForm] = useState(() => helpers.initialForm(medication))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const change = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError('') }
  let preview, validation = ''
  try { preview = helpers.schedule(form, medication) } catch (err) { validation = err.message }
  async function save(enabled) {
    if (saving) return
    if (enabled && validation) { setError(validation); return }
    setSaving(true); setError('')
    try { await onSave({ ...form, enabled }); onClose() }
    catch (err) { setError(err.message || '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <div className="modal-overlay" onClick={() => !saving && onClose()}>
    <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
      <div className="modal-header"><div><h3 className="modal-title">用药提醒</h3><div style={{ fontSize: 13, color: '#65776F', marginTop: 6 }}>{medication.name} · {medication.dosage} · {medication.frequency}{medication.timing ? ` · ${medication.timing}` : ''}</div></div><button className="modal-close" disabled={saving} onClick={onClose}>×</button></div>
      <div className="modal-body">
        <p style={{ padding: 12, background: '#F5F3FF', borderRadius: 8, color: '#6D28D9', fontSize: 13 }}>同一时间的多种药合并为一条消息，只保留当天提醒，次日自动接续，到点合并通知。按已记录医嘱设置；餐前、随餐或餐后要求以上方记录为准。建议时间请结合客户作息确认。客户需要帮助时再交健管专员跟进。</p>
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-group"><label className="form-label" htmlFor="med-reminder-interval">提醒周期</label><select id="med-reminder-interval" className="form-input" value={form.intervalDays} onChange={e => change('intervalDays', Number(e.target.value))}>{Array.from(new Set([1, 3, 7, 14, 30, 90, form.intervalDays])).sort((a,b) => a-b).map(n => <option key={n} value={n}>{n === 1 ? '每天' : `每${n}天`}</option>)}</select></div>
          <div className="form-group"><div className="form-label">每个提醒日的用药时间（北京时间）</div><button type="button" className="btn btn-secondary btn-sm" onClick={() => { change('remindTimes', ['08:00', '12:00', '18:00']); change('intervalDays', 1) }}>设为每日早、中、晚三次</button>
            {form.remindTimes.map((time, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}><label htmlFor={`med-time-${i}`} style={{ minWidth: 70 }}>{form.remindTimes.length === 3 ? ['早间', '午间', '晚间'][i] : `第${i + 1}次`}</label><input id={`med-time-${i}`} className="form-input" type="time" value={time} onChange={e => change('remindTimes', form.remindTimes.map((t,j) => j === i ? e.target.value : t))}/><button type="button" className="btn btn-ghost" aria-label={`删除第${i+1}次提醒`} disabled={form.remindTimes.length === 1} onClick={() => change('remindTimes', form.remindTimes.filter((_,j) => j !== i))}>删除</button></div>)}
            <button type="button" className="btn btn-ghost" disabled={form.remindTimes.length >= 6} onClick={() => change('remindTimes', [...form.remindTimes, ''])}>＋添加提醒时间</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}><div className="form-group"><label className="form-label" htmlFor="med-start">开始日期</label><input id="med-start" className="form-input" type="date" value={form.startDate} onChange={e => change('startDate', e.target.value)}/></div><div className="form-group"><label className="form-label" htmlFor="med-end">结束日期（不填默认一年）</label><input id="med-end" className="form-input" type="date" value={form.endDate} onChange={e => change('endDate', e.target.value)}/></div></div>
          <div className="form-group"><label className="form-label" htmlFor="med-note">提醒备注</label><textarea id="med-note" className="form-input" rows={2} placeholder="补充已确认的用药提醒说明" value={form.note} onChange={e => change('note', e.target.value)}/></div>
        </fieldset>
        {preview && <div role="status" style={{ fontSize: 13, color: '#1E6B50' }}>{form.intervalDays === 1 ? '每天' : `每${form.intervalDays}天`} {preview.remindTimes.length} 次：{preview.remindTimes.join('、')}<br/>{preview.startDate} 至 {preview.endDate}，仅生成当天提醒，次日自动接续；同一时间的其他药物自动合并。</div>}
        {(error || validation) && <p role="alert" style={{ color: '#DC3545' }}>{error || validation}</p>}
      </div>
      <div className="modal-footer">{medication.reminder?.enabled && <button className="btn btn-secondary" disabled={saving} onClick={() => save(false)}>关闭提醒</button>}<button className="btn btn-ghost" disabled={saving} onClick={onClose}>取消</button><button className="btn btn-primary" disabled={saving || !!validation} onClick={() => save(true)}>{saving ? '保存中…' : '保存用药提醒'}</button></div>
    </div>
  </div>
}
