import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import ScheduleBookingDialog from '../components/ScheduleBookingDialog'

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
const dayPeriods = [
  { key: 'morning', label: '上午', startTime: '09:00', endTime: '12:00', enabled: true },
  { key: 'afternoon', label: '下午', startTime: '13:00', endTime: '17:00', enabled: true },
  { key: 'evening', label: '晚上', startTime: '18:00', endTime: '21:00', enabled: false },
]
const roleNames = { specialist: '专科专家', familyDoctor: '健康顾问', healthManager: '健管专员', healthPlanner: '健康规划师',
  nutritionist: '营养师', rehabSpecialist: '运动复健师', psychologist: '心理咨询师', tcmDoctor: '中医师', medicalAssistant: '就医专员',
  superadmin: '管理员', manager: '管理员' }
const initialDate = () => addDays(dateKey(new Date()), 1)

export default function AvailabilityPage() {
  const { staff } = useStaff()
  const canManageTeam = ['healthPlanner', 'healthManager', 'superadmin', 'manager'].includes(staff?.role)
  const [month, setMonth] = useState(initialDate().slice(0, 7))
  const [week, setWeek] = useState(monday(initialDate()))
  const [view, setView] = useState('mine')
  const [target, setTarget] = useState('')
  const [team, setTeam] = useState({ staff: [], slots: [] })
  const [ownSlots, setOwnSlots] = useState([])
  const [bookings, setBookings] = useState([])
  const [bookingOpen, setBookingOpen] = useState(false)
  const [form, setForm] = useState({ date: initialDate(), periods: dayPeriods, status: 'available', segmentMinutes: '20' })
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
    if (view === 'team') {
      const result = await staffAPI.teamAvailability(params)
      setTeam(result.data || { staff: [], slots: [] })
    } else {
      const result = await staffAPI.availability(params)
      setOwnSlots(result.data || [])
    }
    const bookingResult = await staffAPI.scheduleBookings({ ...params, ...(view === 'team' ? { staffId: target || staff._id } : {}) })
    setBookings(bookingResult.data || [])
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [month, view, target])

  const slots = view === 'team' ? team.slots.filter(slot => String(slot.staffId) === target) : ownSlots
  const slotsOn = date => slots.filter(slot => dateKey(slot.startAt) === date).sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
  const bookingFor = slot => bookings.find(item => item.slotIds.some(id => String(id) === String(slot._id)))
  const selectedDates = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const whole = form.segmentMinutes === 'whole' || form.status === 'unavailable'
  const preview = form.periods.filter(period => period.enabled).map(period => {
    const startAt = localDateTime(form.date, period.startTime)
    const endAt = localDateTime(form.date, period.endTime)
    const duration = +endAt - +startAt
    const step = Number(form.segmentMinutes) * 60000
    const valid = Number.isFinite(duration) && duration >= 15 * 60000 && duration <= 12 * 3600000 &&
      (whole || duration % step === 0)
    const total = valid ? whole ? 1 : duration / step : 0
    const skipped = valid ? whole ? (startAt < nowMs ? 1 : 0) : Math.min(total, Math.max(0, Math.ceil((nowMs - +startAt) / step))) : 0
    return { ...period, startAt, endAt, valid, count: total - skipped, skipped }
  })
  const previewCount = preview.reduce((sum, period) => sum + period.count, 0)
  const previewSkipped = preview.reduce((sum, period) => sum + period.skipped, 0)

  function updatePeriod(key, field, value) {
    setForm(current => ({ ...current, periods: current.periods.map(period => period.key === key ? { ...period, [field]: value } : period) }))
  }

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
    if (!preview.length) { setError('请至少勾选上午、下午或晚上中的一段'); return }
    if (preview.some(period => !period.valid)) { setError('请检查各时段起止时间：每段至少15分钟、最多12小时，分段时间须能被20或30分钟整除'); return }
    const ordered = [...preview].sort((a, b) => a.startAt - b.startAt)
    if (ordered.some((period, index) => index && period.startAt < ordered[index - 1].endAt)) { setError('上午、下午、晚上时间不能互相重叠'); return }
    if (!previewCount) { setError('勾选的时间都已过去，请选择未来的空档'); return }
    setBusy(true)
    try {
      const payload = { date: form.date, status: form.status, segmentMinutes: whole ? 'whole' : Number(form.segmentMinutes),
        windows: ordered.map(period => ({ period: period.key, startAt: period.startAt.toISOString(), endAt: period.endAt.toISOString() })),
        ...(view === 'team' ? { staffId: target } : {}) }
      const result = await staffAPI.createAvailabilityDayPlan(payload)
      const saved = result.data || {}
      setNotice(`已添加 ${saved.count} 个${whole ? '整段' : `${form.segmentMinutes}分钟`}空档` +
        `${saved.skippedPast ? `，跳过 ${saved.skippedPast} 个已开始的时段` : ''}` +
        `${saved.skippedExisting ? `，保留 ${saved.skippedExisting} 个已有排班或预约` : ''}`)
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
  async function cancelBooking(id) {
    setError(''); setNotice(''); setBusy(true)
    try { await staffAPI.cancelScheduleBooking(id); setNotice('预约已取消，时间恢复为可预约'); await load() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return <div className="page-container" style={{ maxWidth: 1100 }}>
    <h1>岗位排班</h1>
    <p>各岗位共用排班表。本人可填写空档，健管专员和健康规划师可代同机构人员排班；医护人员均可查看同事空档并发起服务、沟通或事务预约。</p>
    <p>专家咨询与 MDT 派单也会占用这里的时间。预约后显示“已预约”；系统会检查时间冲突。</p>
    {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#176348' }}>{notice}</p>}
    {<div className="card" style={{ padding: 18, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <label>查看谁的排班 <select className="form-input" value={view} onChange={e => { setView(e.target.value); setTarget(''); setError(''); setNotice('') }}><option value="mine">我自己</option><option value="team">同事</option></select></label>
      {view === 'team' && <label>选择人员 <select className="form-input" value={target} onChange={e => setTarget(e.target.value)}><option value="">请选择岗位人员</option>{team.staff.filter(person => String(person._id) !== String(staff?._id)).map(person => <option key={person._id} value={person._id}>{person.name} · {roleNames[person.role] || person.role}</option>)}</select></label>}
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
          return <button type="button" key={date} onClick={() => { chooseWeek(weekStart); setForm(current => ({ ...current, date })) }} style={{ minHeight: 92, textAlign: 'left', padding: 8, border: form.date === date ? '2px solid #176348' : '1px solid #D7E2DB', borderRadius: 8, background: date.slice(0, 7) === month ? '#fff' : '#F5F7F5', color: '#1B3329', cursor: 'pointer' }}>
            <b>{Number(date.slice(-2))}</b>
            {daily.slice(0, 2).map(slot => <span key={slot._id} style={{ display: 'block', fontSize: 12, marginTop: 3 }}>{clock(slot.startAt)}–{clock(slot.endAt)} {slot.status === 'booked' ? '已约' : slot.status === 'unavailable' ? '不可约' : ''}</span>)}
            {daily.length > 2 && <span style={{ fontSize: 12 }}>另有 {daily.length - 2} 段</span>}
          </button>
        }))}
      </div>
    </div>
    <div className="card" style={{ padding: 18 }}>
      <h3>{week} 至 {addDays(week, 6)} 的安排</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>{selectedDates.map((date, index) => <button key={date} type="button" className={form.date === date ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'} onClick={() => setForm(current => ({ ...current, date }))}>{weekDays[index]} {date.slice(5)} <small>({slotsOn(date).length})</small></button>)}</div>
      {(view === 'mine' || canManageTeam) && <details style={{ borderTop: '1px solid #E1EAE6', padding: '14px 0' }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>设置或复制空档</summary><p>选择一天，分别填写上午、下午、晚上可安排的时间。休息时段留空；三段可一次保存。专家通常按20或30分钟分段，健康顾问覆盖全程可选整段。</p>
      <form onSubmit={save} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginBottom: 12 }}>
          <label>星期／日期 <select className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}>{selectedDates.map((date, i) => <option key={date} value={date}>{weekDays[i]} {date}</option>)}</select></label>
          <label>分段方式 <select className="form-input" value={form.segmentMinutes} disabled={form.status === 'unavailable'} onChange={e => setForm({ ...form, segmentMinutes: e.target.value })}><option value="20">每20分钟一段</option><option value="30">每30分钟一段</option><option value="whole">整段时间</option></select></label>
          <label>状态 <select className="form-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value, segmentMinutes: e.target.value === 'unavailable' ? 'whole' : form.segmentMinutes })}><option value="available">可预约</option><option value="unavailable">不可预约</option></select></label>
        </div>
        {form.periods.map(period => {
          const result = preview.find(item => item.key === period.key)
          return <div key={period.key} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid #E1EAE6' }}>
            <label style={{ minWidth: 90 }}><input type="checkbox" checked={period.enabled} onChange={e => updatePeriod(period.key, 'enabled', e.target.checked)} /> {period.label}</label>
            <label>开始 <input className="form-input" type="time" required={period.enabled} disabled={!period.enabled} value={period.startTime} onChange={e => updatePeriod(period.key, 'startTime', e.target.value)} /></label>
            <label>结束 <input className="form-input" type="time" required={period.enabled} disabled={!period.enabled} value={period.endTime} onChange={e => updatePeriod(period.key, 'endTime', e.target.value)} /></label>
            {period.enabled && <span style={{ color: result?.valid && result.count ? '#176348' : '#B42318' }}>{!result?.valid ? '请检查时间或分段方式' : result.count
              ? `预计新增 ${result.count} 段${result.skipped ? `，跳过已开始的 ${result.skipped} 段` : ''}` : '此时段已过去'}</span>}
          </div>
        })}
        <button className="btn btn-primary" disabled={busy || (view === 'team' && !target)}>{busy ? '处理中…' : '一次保存当天安排'}</button>
      </form>
      {!!preview.length && <p style={{ color: previewCount ? '#176348' : '#B42318' }}>本次预计新增 {previewCount} 个空档{previewSkipped ? `，跳过已开始的 ${previewSkipped} 个时段` : ''}。已有相同时间的排班或预约会保留，不会重复添加。</p>}
      <button className="btn btn-secondary" type="button" disabled={busy || (view === 'team' && !target)} onClick={copyPreviousWeek}>复制上一周到本周</button>
      <p style={{ color: '#5A6B63' }}>复制前请选中目标周。若本周已有重叠时间，系统会提示冲突，不覆盖原排班。</p></details>}
      {(view === 'mine' || target) && <div style={{ borderTop: '1px solid #E1EAE6', padding: '16px 0' }}><button type="button" className="btn btn-primary" onClick={() => setBookingOpen(true)}>＋ 新建预约</button><span style={{ marginLeft: 12, color: '#60776C' }}>在宽版窗口选择人员、时间并填写事项</span></div>}
      <h3>{form.date} 的时段</h3>
      {!slotsOn(form.date).length && <p style={{ color: '#60776C' }}>当天暂无排班</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))', gap: 10 }}>
        {slotsOn(form.date).map(slot => <div key={slot._id} style={{ border: '1px solid #DCE8E1', borderRadius: 9, padding: 10, background: slot.status === 'booked' ? '#F3F5F4' : '#fff' }}>
          <div style={{ fontWeight: 600 }}>{clock(slot.startAt)}–{clock(slot.endAt)}</div>
          <div style={{ color: '#60776C', fontSize: 13 }}>{labels[slot.status] || slot.status}{bookingFor(slot)?.title ? ` · ${bookingFor(slot).title}` : ''}{bookingFor(slot)?.reason ? ` · 缘由：${bookingFor(slot).reason}` : ''}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{slot.status === 'available' && +new Date(slot.startAt) > nowMs && <button className="btn btn-primary btn-sm" type="button" onClick={() => setBookingOpen({ slotId: slot._id })}>预约</button>}
            {slot.status !== 'booked' && (view === 'mine' || canManageTeam) && <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => remove(slot._id)}>删除</button>}
            {String(bookingFor(slot)?.slotIds?.[0]) === String(slot._id) && <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => cancelBooking(bookingFor(slot)._id)}>取消预约</button>}
          </div>
        </div>)}
      </div>
    </div>
    {bookingOpen && <ScheduleBookingDialog initialStaffId={view === 'team' ? target : staff?._id} initialDate={form.date} initialSlotId={bookingOpen.slotId} onClose={() => setBookingOpen(false)} onSaved={() => { setNotice('预约已创建'); load().catch(e => setError(e.message)) }} />}
  </div>
}
