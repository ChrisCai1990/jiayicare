import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const day = value => new Date(value).toLocaleDateString('sv-SE')
const stamp = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
const label = { available: '可预约', booked: '已预约', unavailable: '不可预约' }

export default function AvailabilityPage() {
  const { staff } = useStaff()
  const canTeam = ['healthPlanner', 'superadmin', 'manager'].includes(staff?.role)
  const [start, setStart] = useState(day(Date.now()))
  const [view, setView] = useState('mine')
  const [team, setTeam] = useState({ staff: [], slots: [] })
  const [slots, setSlots] = useState([])
  const [target, setTarget] = useState('')
  const [form, setForm] = useState({ startAt: '', endAt: '', status: 'available' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const period = () => {
    const first = new Date(`${start}T00:00:00`)
    return { start: first.toISOString(), end: new Date(+first + 7 * 86400000).toISOString() }
  }
  async function load() {
    const params = period()
    if (view === 'team' && canTeam) {
      const result = await staffAPI.teamAvailability(params)
      setTeam(result.data || { staff: [], slots: [] })
    } else {
      const result = await staffAPI.availability(params)
      setSlots(result.data || [])
    }
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [start, view])
  async function save(event) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      await staffAPI.createAvailability({ ...form, startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString(), ...(view === 'team' && target ? { staffId: target } : {}) })
      setForm({ startAt: '', endAt: '', status: 'available' })
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function remove(id) {
    setError(''); setBusy(true)
    try { await staffAPI.deleteAvailability(id); await load() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const visible = view === 'team' ? team.slots.filter(slot => !target || String(slot.staffId) === target) : slots
  const names = Object.fromEntries(team.staff.map(person => [String(person._id), `${person.name} · ${person.role}`]))
  return <div className="page-container" style={{ maxWidth: 900 }}>
    <h1>岗位排班</h1>
    <p>所有岗位可维护未来空档。已预约时段在排班中标记，不能直接删除。</p>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <label>查看起始日期 <input className="form-input" type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      {canTeam && <label style={{ marginLeft: 16 }}>范围 <select className="form-input" value={view} onChange={e => { setTarget(''); setView(e.target.value) }}><option value="mine">我的排班</option><option value="team">团队排班</option></select></label>}
      {view === 'team' && <label style={{ marginLeft: 16 }}>岗位人员 <select className="form-input" value={target} onChange={e => setTarget(e.target.value)}><option value="">全部人员</option>{team.staff.map(person => <option key={person._id} value={person._id}>{person.name} · {person.role}</option>)}</select></label>}
    </div>
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <h3>新增时间段</h3>
      <form onSubmit={save} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
        {view === 'team' && !target && <p>先选择一位人员，再为其排班。</p>}
        <label>开始 <input className="form-input" required type="datetime-local" value={form.startAt} onChange={e => setForm({ ...form, startAt: e.target.value })}/></label>
        <label>结束 <input className="form-input" required type="datetime-local" value={form.endAt} onChange={e => setForm({ ...form, endAt: e.target.value })}/></label>
        <label>状态 <select className="form-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="available">可预约</option><option value="unavailable">不可预约</option></select></label>
        <button className="btn btn-primary" disabled={busy || (view === 'team' && !target)}>保存时间段</button>
      </form>
    </div>
    <div className="card" style={{ padding: 18 }}>
      <h3>未来七天</h3>
      {visible.length === 0 && <p>暂无排班</p>}
      {visible.map(slot => <div key={slot._id} style={{ borderTop: '1px solid #E1EAE6', padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{view === 'team' && <b>{names[String(slot.staffId)] || '人员'} · </b>}{stamp(slot.startAt)} 至 {stamp(slot.endAt)} · {label[slot.status] || slot.status}</span>
        {slot.status !== 'booked' && (view === 'mine' || canTeam) && <button className="btn btn-secondary" disabled={busy} onClick={() => remove(slot._id)}>删除</button>}
      </div>)}
    </div>
  </div>
}
