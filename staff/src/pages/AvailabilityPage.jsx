import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const dateKey = value => new Date(value).toLocaleDateString('sv-SE')
const addDays = (value, count) => {
  const [year, month, day] = value.split('-').map(Number)
  return dateKey(new Date(year, month - 1, day + count))
}
const monday = value => {
  const weekday = new Date(`${value}T12:00:00`).getDay()
  return addDays(value, -((weekday + 6) % 7))
}
const localDateTime = (date, time) => new Date(`${date}T${time}:00`)
const clock = value => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const labels = { available: '可预约', booked: '已预约', unavailable: '不可预约' }
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const roleNames = { specialist: '专科专家', familyDoctor: '健康顾问', healthManager: '健管专员', healthPlanner: '健康规划师',
  nutritionist: '营养师', rehabSpecialist: '运动复健师', psychologist: '心理咨询师', tcmDoctor: '中医师', medicalAssistant: '就医专员',
  superadmin: '管理员', manager: '管理员' }
const initialDate = () => addDays(dateKey(new Date()), 1)

export default function AvailabilityPage() {
  const { staff } = useStaff()
  const canTeam = ['healthPlanner', 'healthManager', 'superadmin', 'manager'].includes(staff?.role)
  const [month, setMonth] = useState(initialDate().slice(0, 7))
  const [week, setWeek] = useState(monday(initialDate()))
  const [view, setView] = useState('mine')
  const [target, setTarget] = useState('')
  const [team, setTeam] = useState({ staff: [], slots: [] })
  const [ownSlots, setOwnSlots] = useState([])
  const [form, setForm] = useState({ date: initialDate(), startTime: '09:00', endTime: '10:00', status: 'available', segmentMinutes: '20' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  const first = monday(`${month}-01`)
  const last = dateKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
  const weeks = []
  for (let date = first; date <= last; date = addDays(date, 7)) weeks.push(date)

  async function load() {
    const params = { start: localDateTime(first, '00:00').toISOString(), end: localDateTime(addDays(weeks.at(-1), 7), '00:00').toISOString() }
    if (view === 'team' && canTeam) {
      const result = await staffAPI.teamAvailability(params)
      setTeam(result.data || { staff: [], slots: [] })
    } else {
      const result = await staffAPI.availability(params)
      setOwnSlots(result.data || [])
    }
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [month, view])

  const slots = view === 'team' ? team.slots.filter(slot => String(slot.staffId) === target) : ownSlots
  const slotsOn = date => slots.filter(slot => dateKey(slot.startAt) === date).sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
  const selectedDates = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const previewStart = localDateTime(form.date, form.startTime)
  const previewEnd = localDateTime(form.date, form.endTime)
  const previewStep = Number(form.segmentMinutes) * 60000
  const previewTotal = previewStep && form.status === 'available' && (+previewEnd - +previewStart) > 0 && (+previewEnd - +previewStart) % previewStep === 0
    ? (+previewEnd - +previewStart) / previewStep : 0
  const previewSkipped = previewTotal ? Math.max(0, Math.ceil((nowMs - +previewStart) / previewStep)) : 0
  const previewCount = Math.max(0, previewTotal - previewSkipped)
  const effectivePreviewStart = new Date(+previewStart + previewSkipped * previewStep)

  function chooseWeek(date) {
    setWeek(date)
    const firstFuture = Array.from({ length: 7 }, (_, i) => addDays(date, i)).find(day => day >= dateKey(new Date()))
    setForm(current => ({ ...current, date: firstFuture || date }))
    setError(''); setNotice('')
  }
  function changeMonth(delta) {
    const [year, number] = month.split('-').map(Number)
    const next = dateKey(new Date(year, number - 1 + delta, 1)).slice(0, 7)
    setMonth(next)
    chooseWeek(monday(`${next}-01`))
  }
  async function save(event) {
    event.preventDefault(); setError(''); setNotice('')
    if (view === 'team' && !target) { setError('请先选择要排班的人员'); return }
    const startAt = localDateTime(form.date, form.startTime)
    const endAt = localDateTime(form.date, form.endTime)
    const minutes = (+endAt - +startAt) / 60000
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 720) {
      setError('请选择同一天的时间，每段至少15分钟、最多12小时。例如 09:00 到 09:30。')
      return
    }
    const whole = form.segmentMinutes === 'whole' || form.status === 'unavailable'
    if (whole && startAt < new Date()) { setError('整段时间须从未来开始；若是分段排班，系统可以自动跳过今天已经开始的空档。'); return }
    if (!whole) {
      const step = Number(form.segmentMinutes) * 60000
      if ((+endAt - +startAt) % step !== 0) { setError('起止时间要能完整分成20分钟或30分钟，例如 09:00 到 10:00 可以分成3个20分钟空档。'); return }
      if (+endAt <= Date.now()) { setError('这段时间已全部过去，请选择未来的空档'); return }
    }
    setBusy(true)
    try {
      const payload = { startAt: startAt.toISOString(), endAt: endAt.toISOString(), status: form.status,
        ...(view === 'team' ? { staffId: target } : {}) }
      if (whole) {
        await staffAPI.createAvailability(payload)
        setNotice('已添加1个整段时间')
      } else {
        const result = await staffAPI.createAvailabilityBatch({ ...payload, segmentMinutes: Number(form.segmentMinutes) })
        const saved = result.data || {}
        setNotice(`已添加 ${saved.count} 个${form.segmentMinutes}分钟空档${saved.skipped ? `，自动跳过 ${saved.skipped} 个已开始的时段，实际从 ${clock(saved.firstStartAt)} 开始` : ''}`)
      }
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function copyPreviousWeek() {
    setError(''); setNotice('')
    if (view === 'team' && !target) { setError('请先选择要排班的人员'); return }
    setBusy(true)
    try {
      const result = await staffAPI.copyPreviousWeekAvailability({ targetWeekStart: localDateTime(week, '00:00').toISOString(),
        ...(view === 'team' ? { staffId: target } : {}) })
      setNotice(`已从上一周复制 ${result.data?.count || 0} 个时间段。已预约时段按可预约空档复制。`)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function remove(id) {
    setError(''); setNotice(''); setBusy(true)
    try { await staffAPI.deleteAvailability(id); await load() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return <div className="page-container" style={{ maxWidth: 1100 }}>
    <h1>岗位排班</h1>
    <p>按周安排时间，在月历中查看整月。专家可以自己填写，健管专员和健康规划师也可以为同机构人员代排。已预约时间不能直接删除。</p>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#176348' }}>{notice}</p>}
    {canTeam && <div className="card" style={{ padding: 18, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <label>排班对象 <select className="form-input" value={view} onChange={e => { setView(e.target.value); setTarget(''); setError(''); setNotice('') }}><option value="mine">我自己</option><option value="team">代同事排班</option></select></label>
      {view === 'team' && <label>选择人员 <select className="form-input" value={target} onChange={e => setTarget(e.target.value)}><option value="">请选择专家或其他岗位人员</option>{team.staff.map(person => <option key={person._id} value={person._id}>{person.name} · {roleNames[person.role] || person.role}</option>)}</select></label>}
    </div>}
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn btn-secondary" type="button" onClick={() => changeMonth(-1)}>上个月</button>
        <h2 style={{ margin: 0 }}>{month.replace('-', ' 年 ')} 月</h2>
        <button className="btn btn-secondary" type="button" onClick={() => changeMonth(1)}>下个月</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
        {weekDays.map(name => <b key={name} style={{ textAlign: 'center' }}>{name}</b>)}
        {weeks.flatMap(weekStart => Array.from({ length: 7 }, (_, i) => {
          const date = addDays(weekStart, i)
          const daily = slotsOn(date)
          return <button type="button" key={date} onClick={() => chooseWeek(weekStart)} style={{ minHeight: 92, textAlign: 'left', padding: 8, border: week === weekStart ? '2px solid #176348' : '1px solid #D7E2DB', borderRadius: 8, background: date.slice(0, 7) === month ? '#fff' : '#F5F7F5', color: '#1B3329', cursor: 'pointer' }}>
            <b>{Number(date.slice(-2))}</b>
            {daily.slice(0, 2).map(slot => <span key={slot._id} style={{ display: 'block', fontSize: 12, marginTop: 3 }}>{clock(slot.startAt)}–{clock(slot.endAt)} {slot.status === 'booked' ? '已约' : slot.status === 'unavailable' ? '不可约' : ''}</span>)}
            {daily.length > 2 && <span style={{ fontSize: 12 }}>另有 {daily.length - 2} 段</span>}
          </button>
        }))}
      </div>
    </div>
    <div className="card" style={{ padding: 18 }}>
      <h3>{week} 至 {addDays(week, 6)} 的安排</h3>
      <p>先选当天可用于咨询的起止时间，再选每20分钟、每30分钟或整段保存。专家会诊通常选20或30分钟；健康顾问需要覆盖全程时可选整段。</p>
      <form onSubmit={save} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginBottom: 16 }}>
        <label>星期／日期 <select className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}>{selectedDates.map((date, i) => <option key={date} value={date}>{weekDays[i]} {date}</option>)}</select></label>
        <label>开始 <input className="form-input" required type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></label>
        <label>结束 <input className="form-input" required type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></label>
        <label>分段方式 <select className="form-input" value={form.segmentMinutes} disabled={form.status === 'unavailable'} onChange={e => setForm({ ...form, segmentMinutes: e.target.value })}><option value="20">每20分钟一段</option><option value="30">每30分钟一段</option><option value="whole">整段时间</option></select></label>
        <label>状态 <select className="form-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value, segmentMinutes: e.target.value === 'unavailable' ? 'whole' : form.segmentMinutes })}><option value="available">可预约</option><option value="unavailable">不可预约</option></select></label>
        <button className="btn btn-primary" disabled={busy || (view === 'team' && !target)}>{busy ? '处理中…' : '添加到本周'}</button>
      </form>
      {form.status === 'available' && form.segmentMinutes !== 'whole' && <p style={{ color: previewCount ? '#176348' : '#B42318' }}>{previewCount
        ? `将生成 ${previewCount} 个${form.segmentMinutes}分钟空档${previewSkipped ? `，跳过 ${previewSkipped} 个已开始的时段` : ''}，从 ${clock(effectivePreviewStart)} 到 ${clock(previewEnd)}。`
        : previewTotal ? '这段时间已全部过去，请选择未来的空档。' : '当前起止时间无法按所选时长完整分段，请调整结束时间。'}</p>}
      <button className="btn btn-secondary" type="button" disabled={busy || (view === 'team' && !target)} onClick={copyPreviousWeek}>复制上一周到本周</button>
      <p style={{ color: '#5A6B63' }}>复制前请选中目标周。若本周已有重叠时间，系统会提示冲突，不覆盖原排班。</p>
      {selectedDates.flatMap(date => slotsOn(date).map(slot => <div key={slot._id} style={{ borderTop: '1px solid #E1EAE6', padding: '10px 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{date} {clock(slot.startAt)}–{clock(slot.endAt)} · {labels[slot.status] || slot.status}</span>
        {slot.status !== 'booked' && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => remove(slot._id)}>删除</button>}
      </div>))}
    </div>
  </div>
}
