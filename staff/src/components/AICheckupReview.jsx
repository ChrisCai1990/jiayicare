import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

const LABELS = { needs_exam: '已纳入完善检查', request_records: '仅需补传资料', already_managed: '已有事项覆盖', not_needed: '无需安排' }

export default function AICheckupReview({ patientId, year, versionKey, staff, toast }) {
  const [data, setData] = useState(null), [decisions, setDecisions] = useState([]), [error, setError] = useState('')
  const [editing, setEditing] = useState(null), [form, setForm] = useState({}), [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([staffAPI.getAICheckupReviews(patientId, year), staffAPI.getAnnualManagementDecisions(patientId, year)])
      .then(([reviews, existing]) => { if (active) { setData(reviews.data); setDecisions(existing.data || []); setError('') } })
      .catch(e => { if (active) setError(e.message || '读取核对状态失败') })
    return () => { active = false }
  }, [patientId, year, versionKey])
  if (error) return <div role="alert" style={{ color: '#B42318', fontSize: 12 }}>{error}</div>
  if (!data?.approved) return <div style={{ color: '#64748B', fontSize: 12 }}>本板块审核后，可逐项核对是否进入年度管理。</div>
  if (!data.items?.length) return null
  const editable = ['familyDoctor', 'superadmin'].includes(staff?.role)
  const checkupDecisions = decisions.filter(row => row.direction === 'checkup_completion')
  const current = item => data.reviews?.find(row => row.sourceKey === item.sourceKey)
  const open = item => {
    const saved = current(item)
    setEditing(item); setForm({ disposition: saved?.disposition || '', title: saved?.title || item.text.slice(0, 80), note: saved?.note || '', linkedDecisionId: saved?.linkedDecisionId || '' }); setError('')
  }
  const save = async () => {
    if (!form.disposition) { setError('请选择处理方式'); return }
    if (form.disposition === 'needs_exam' && form.title.trim().length < 2) { setError('请填写具体检查名称'); return }
    if (form.disposition !== 'needs_exam' && !form.note.trim()) { setError('请填写处理原因'); return }
    if (form.disposition === 'already_managed' && !form.linkedDecisionId) { setError('请选择已有的完善检查事项'); return }
    setBusy(true); setError('')
    try {
      const result = await staffAPI.saveAICheckupReview(patientId, { year: Number(year), sourceKey: editing.sourceKey,
        disposition: form.disposition, title: form.title.trim(), note: form.note.trim(), linkedDecisionId: form.linkedDecisionId })
      setData(prev => ({ ...prev, reviews: [...(prev.reviews || []).filter(row => row.sourceKey !== editing.sourceKey), result.data] }))
      setEditing(null); toast?.('待完善检查已核对', 4000)
    } catch (e) { setError(e.message || '保存失败，请重试') }
    finally { setBusy(false) }
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
    {data.items.map(item => { const saved = current(item); return <div key={item.sourceKey} style={{ border: '1px solid #E0D9CE', borderRadius: 8, padding: '8px 10px', background: '#FAFAF8', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
      <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.6 }}><b>{item.text}</b><div style={{ color: saved ? '#1E6B50' : '#B45309', fontSize: 12 }}>{saved ? LABELS[saved.disposition] + (saved.note ? ` · ${saved.note}` : '') : '待顾问核对'}</div></div>
      {editable && <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(item)}>{saved ? '调整' : '核对去向'}</button>}
    </div> })}
    {editing && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 520 }}>
      <div className="modal-header"><div className="modal-title">核对待完善检查</div><button type="button" className="modal-close" onClick={() => { setEditing(null); setError('') }}>×</button></div>
      <div className="modal-body">
        <div style={{ fontSize: 13, color: '#65776F', marginBottom: 10 }}>已审核 AI 整理：{editing.text}</div>
        <label className="form-label">处理方式</label>
        <select className="form-input" value={form.disposition} onChange={e => setForm(v => ({ ...v, disposition: e.target.value }))}>
          <option value="">请选择</option><option value="needs_exam">确需检查，纳入年度完善检查</option><option value="request_records">检查已做，仅需补传或核对资料</option><option value="already_managed">已有完善检查事项覆盖</option><option value="not_needed">经核对无需安排</option>
        </select>
        {form.disposition === 'needs_exam' && <><label className="form-label" style={{ marginTop: 12 }}>具体检查名称</label><input className="form-input" maxLength={80} value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} /></>}
        {form.disposition === 'already_managed' && <><label className="form-label" style={{ marginTop: 12 }}>已有事项</label><select className="form-input" value={form.linkedDecisionId} onChange={e => setForm(v => ({ ...v, linkedDecisionId: e.target.value }))}><option value="">请选择</option>{checkupDecisions.map(row => <option key={row._id} value={row._id}>{row.title}</option>)}</select></>}
        <label className="form-label" style={{ marginTop: 12 }}>{form.disposition === 'needs_exam' ? '顾问补充说明（可选）' : '处理原因'}</label>
        <textarea className="form-input" rows={2} maxLength={1000} value={form.note} onChange={e => setForm(v => ({ ...v, note: e.target.value }))} placeholder="记录核对依据、建议时间或补资料安排" />
        {error && <div role="alert" style={{ color: '#B42318', marginTop: 8 }}>{error}</div>}
      </div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => { setEditing(null); setError('') }}>取消</button><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '确认处理'}</button></div>
    </div></div>}
  </div>
}
