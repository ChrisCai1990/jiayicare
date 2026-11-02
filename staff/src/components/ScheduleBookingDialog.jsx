import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const dateKey = value => new Date(value).toLocaleDateString('sv-SE')
const timeLabel = value => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const periodOf = value => {
  const hour = new Date(value).getHours()
  return hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上'
}

export default function ScheduleBookingDialog({ onClose, onSaved, context = {}, initialStaffId, initialDate, initialSlotId }) {
  const { staff } = useStaff()
  const [people, setPeople] = useState([])
  const [slots, setSlots] = useState([])
  const [target, setTarget] = useState(initialStaffId || staff?._id || '')
  const [date, setDate] = useState(initialDate || dateKey(new Date(Date.now() + 86400000)))
  const [selected, setSelected] = useState(initialSlotId ? [String(initialSlotId)] : [])
  const [category, setCategory] = useState(['customer_service', 'partner_exchange', 'other_affairs'].includes(context.category) ? context.category : 'customer_service')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const loadVersion = useRef(0)

  async function load() {
    const version = ++loadVersion.current
    setLoading(true)
    try {
      const start = new Date(`${date}T00:00:00`)
      const end = new Date(start); end.setDate(end.getDate() + 1)
      const response = await staffAPI.teamAvailability({ start: start.toISOString(), end: end.toISOString() })
      if (version === loadVersion.current) { setPeople(response.data?.staff || []); setSlots(response.data?.slots || []) }
    } catch (cause) { if (version === loadVersion.current) setError(cause.message) }
    finally { if (version === loadVersion.current) setLoading(false) }
  }
  useEffect(() => { load() }, [date])

  const daily = slots.filter(slot => String(slot.staffId) === String(target) && dateKey(slot.startAt) === date)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
  const available = daily.filter(slot => slot.status === 'available' && +new Date(slot.startAt) > Date.now())
  const chosen = available.filter(slot => selected.includes(String(slot._id)))
  const ordered = [...chosen].sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
  const contiguous = ordered.every((slot, index) => !index || +new Date(slot.startAt) === +new Date(ordered[index - 1].endAt))
  const groups = ['上午', '下午', '晚上'].map(label => ({ label, slots: daily.filter(slot => periodOf(slot.startAt) === label) })).filter(group => group.slots.length)

  async function submit(event) {
    event.preventDefault()
    if (!ordered.length || !contiguous) { setError('请选择同一天内连续的可预约时间'); return }
    setBusy(true); setError('')
    try {
      await staffAPI.createScheduleBooking({ slotIds: ordered.map(slot => slot._id), category, content: content.trim(),
        patientId: context.patientId || undefined, relatedType: context.relatedType || undefined, relatedId: context.relatedId || undefined })
      onSaved?.()
      onClose()
    } catch (cause) { setError(cause.message); await load() }
    finally { setBusy(false) }
  }

  return <div className="modal-overlay" onClick={onClose} role="presentation" style={{ zIndex: 1200 }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label="新建预约" onClick={event => event.stopPropagation()}
      style={{ width: 'min(94vw, 880px)', maxWidth: 880, maxHeight: '90vh', overflowY: 'auto' }}>
      <div className="modal-header"><h2 className="modal-title">新建预约</h2><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button></div>
      <form onSubmit={submit} className="modal-body" style={{ display: 'grid', gap: 18, padding: 24 }}>
        {context.label && <div style={{ padding: '12px 16px', borderRadius: 10, background: '#EDF7F1' }}>关联：{context.label}</div>}
        {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <label>预约人员<select className="form-input" style={{ width: '100%', marginTop: 8 }} value={target} onChange={event => { setTarget(event.target.value); setSelected([]) }} required>
            <option value="">请选择人员</option>{people.map(person => <option key={person._id} value={person._id}>{person.name} · {person.role}</option>)}
          </select></label>
          <label>日期<input className="form-input" style={{ width: '100%', marginTop: 8 }} type="date" value={date} min={dateKey(new Date())} max={dateKey(new Date(Date.now() + 180 * 86400000))} onChange={event => { setDate(event.target.value); setSelected([]); setError('') }} required /></label>
        </div>
        <section><b>选择时间</b><p style={{ color: '#60776C', margin: '6px 0 10px' }}>可选多个相邻时段。已占用的时间仅供查看。</p>
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #DCE8E1', borderRadius: 10, padding: 14 }}>
            {loading ? '正在加载排班…' : !target ? '请先选择预约人员' : !daily.length ? '当天暂无排班，可请本人或健管专员先设置空档' : groups.map(group => <div key={group.label} style={{ marginBottom: 12 }}>
              <strong style={{ display: 'block', marginBottom: 8 }}>{group.label}</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{group.slots.map(slot => {
                const free = slot.status === 'available' && +new Date(slot.startAt) > Date.now()
                const checked = selected.includes(String(slot._id))
                return <button key={slot._id} type="button" disabled={!free} aria-pressed={checked}
                  onClick={() => setSelected(current => checked ? current.filter(id => id !== String(slot._id)) : [...current, String(slot._id)])}
                  style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${checked ? '#176348' : '#DCE8E1'}`, background: checked ? '#DDF2E7' : free ? '#fff' : '#F1F3F2', color: free ? '#183C2B' : '#82928A', cursor: free ? 'pointer' : 'default' }}>
                  {timeLabel(slot.startAt)}–{timeLabel(slot.endAt)}{free ? '' : ' · 已占用'}
                </button>
              })}</div>
            </div>)}
          </div>
          <p style={{ color: contiguous ? '#176348' : '#B42318', marginBottom: 0 }}>已选 {ordered.length} 段{ordered.length ? ` · ${timeLabel(ordered[0].startAt)}–${timeLabel(ordered.at(-1).endAt)}` : ''}{!contiguous ? '；请选择连续时段' : ''}</p>
        </section>
        <label>预约类型<select className="form-input" style={{ width: '100%', marginTop: 8 }} value={category} onChange={event => setCategory(event.target.value)}><option value="customer_service">客户服务</option><option value="partner_exchange">合作伙伴交流</option><option value="other_affairs">其他事务</option></select></label>
        <label>具体内容 *<textarea className="form-input" style={{ width: '100%', minHeight: 130, marginTop: 8, resize: 'vertical' }} value={content} onChange={event => setContent(event.target.value)} maxLength={300} required placeholder="例如：健管专员陪诊；健康顾问解读检查报告" /></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button type="button" className="btn btn-secondary" onClick={onClose}>取消</button><button type="submit" className="btn btn-primary" disabled={busy || !ordered.length || !contiguous}>{busy ? '保存中…' : '确认预约'}</button></div>
      </form>
    </div>
  </div>
}
